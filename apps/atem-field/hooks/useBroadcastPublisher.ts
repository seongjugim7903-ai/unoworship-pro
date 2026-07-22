'use client';

/**
 * hooks/useBroadcastPublisher.ts
 * Output PC → /media/broadcast Viewer 측 WebRTC 미러 퍼블리셔
 *
 * [FEATURE: BROADCAST_VIEWER / WEBRTC]
 *
 * 동작:
 *   1. 전달받은 <canvas> 에서 `captureStream(fps)` 로 MediaStream 획득
 *   2. Socket.io 를 시그널링 채널로 사용해 뷰어별 RTCPeerConnection 생성
 *   3. VIEWER_JOIN → offer 송신 → answer 수신 → ICE 교환
 *   4. 뷰어 이탈(VIEWER_LEAVE / connection failed) 시 해당 peer 정리
 *
 * 제약:
 *   - 캔버스만 캡처 — OutputCanvas 의 YouTube iframe 과 상단 오버레이 canvas 는
 *     포함되지 않습니다. MVP 한정, Phase 2C+ 에서 getDisplayMedia 또는
 *     off-screen composite canvas 로 확장 가능.
 *   - STUN: 같은 LAN 에서는 host 후보만으로 충분하지만 안전하게 Google 공용
 *     STUN 을 1개 사용.
 */

import { useEffect, type RefObject } from 'react';
import { getSocket } from '@/lib/socketClient';
import { SOCKET_EVENTS, type WebRTCSignal } from '@/lib/socketEvents';

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
  ],
  iceCandidatePoolSize: 4,
  bundlePolicy: 'max-bundle',
};

const CAPTURE_FPS = 30;

export interface UseBroadcastPublisherOptions {
  /** 퍼블리셔 활성화 여부. false 면 아무것도 하지 않음. */
  enabled?: boolean;
}

/**
 * 주어진 canvas 를 WebRTC 로 VIEWER 룸에 송출합니다.
 * canvasRef 가 null 이거나 enabled 가 false 면 동작하지 않습니다.
 */
export function useBroadcastPublisher(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  { enabled = true }: UseBroadcastPublisherOptions = {}
): void {
  useEffect(() => {
    if (!enabled) return;
    const socket = getSocket();
    if (!socket) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    // ─── 1. 캔버스 스트림 생성 ─────────────────────────────────────────────
    let stream: MediaStream;
    try {
      stream = canvas.captureStream(CAPTURE_FPS);
    } catch (err) {
      console.warn('[publisher] canvas.captureStream 실패:', err);
      return;
    }
    if (stream.getTracks().length === 0) {
      console.warn('[publisher] 캡처 트랙이 없습니다 — 캔버스가 그려지지 않은 상태일 수 있음');
    }

    // ─── 2. 뷰어별 peer connection 관리 ────────────────────────────────────
    const peers = new Map<string, RTCPeerConnection>();

    const createPeer = async (viewerId: string): Promise<void> => {
      // 기존 peer 정리
      const existing = peers.get(viewerId);
      if (existing) {
        try {
          existing.close();
        } catch {
          /* noop */
        }
        peers.delete(viewerId);
      }

      const pc = new RTCPeerConnection(RTC_CONFIG);
      peers.set(viewerId, pc);

      // 캔버스 트랙 추가
      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream);
      });

      // ICE 후보 송신
      pc.onicecandidate = (ev) => {
        if (ev.candidate) {
          const signal: WebRTCSignal = {
            kind: 'ice',
            to: viewerId,
            candidate: ev.candidate.toJSON(),
          };
          socket.emit(SOCKET_EVENTS.WEBRTC_SIGNAL, signal);
        }
      };

      // 연결 상태 감시 — 실패/종료 시 정리
      pc.onconnectionstatechange = () => {
        const s = pc.connectionState;
        if (s === 'failed' || s === 'closed' || s === 'disconnected') {
          try {
            pc.close();
          } catch {
            /* noop */
          }
          peers.delete(viewerId);
        }
      };

      // Offer 생성 및 송신
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        const signal: WebRTCSignal = {
          kind: 'offer',
          to: viewerId,
          sdp: offer,
        };
        socket.emit(SOCKET_EVENTS.WEBRTC_SIGNAL, signal);
      } catch (err) {
        console.warn('[publisher] offer 생성 실패:', err);
        try {
          pc.close();
        } catch {
          /* noop */
        }
        peers.delete(viewerId);
      }
    };

    // ─── 3. 이벤트 핸들러 ─────────────────────────────────────────────────
    const handleViewerJoin = (data: { viewerSocketId: string }) => {
      if (!data?.viewerSocketId) return;
      void createPeer(data.viewerSocketId);
    };

    const handleViewerLeave = (data: { viewerSocketId: string }) => {
      if (!data?.viewerSocketId) return;
      const pc = peers.get(data.viewerSocketId);
      if (pc) {
        try {
          pc.close();
        } catch {
          /* noop */
        }
        peers.delete(data.viewerSocketId);
      }
    };

    const handleSignal = async (signal: WebRTCSignal & { from: string }) => {
      if (!signal?.from) return;
      const pc = peers.get(signal.from);
      if (!pc) return;

      try {
        if (signal.kind === 'answer') {
          await pc.setRemoteDescription(signal.sdp);
        } else if (signal.kind === 'ice') {
          await pc.addIceCandidate(signal.candidate);
        }
      } catch (err) {
        console.warn('[publisher] 시그널 처리 실패:', signal.kind, err);
      }
    };

    socket.on(SOCKET_EVENTS.VIEWER_JOIN, handleViewerJoin);
    socket.on(SOCKET_EVENTS.VIEWER_LEAVE, handleViewerLeave);
    socket.on(SOCKET_EVENTS.WEBRTC_SIGNAL, handleSignal);

    // ─── 4. 송출 준비 공지 ────────────────────────────────────────────────
    // 이미 /media/broadcast 에 떠 있는 Viewer 들에게 "이제 피드 요청해도 된다"
    // 라는 신호를 보내 JOIN 을 재발송하게 한다.
    socket.emit(SOCKET_EVENTS.OUTPUT_READY);

    return () => {
      socket.off(SOCKET_EVENTS.VIEWER_JOIN, handleViewerJoin);
      socket.off(SOCKET_EVENTS.VIEWER_LEAVE, handleViewerLeave);
      socket.off(SOCKET_EVENTS.WEBRTC_SIGNAL, handleSignal);
      peers.forEach((pc) => {
        try {
          pc.close();
        } catch {
          /* noop */
        }
      });
      peers.clear();
      stream.getTracks().forEach((t) => t.stop());
    };
  }, [canvasRef, enabled]);
}
