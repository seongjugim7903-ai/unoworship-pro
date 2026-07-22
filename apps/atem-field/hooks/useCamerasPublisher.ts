'use client';

/**
 * hooks/useCamerasPublisher.ts
 * [FEATURE: CAMERAS_RELAY]
 *
 * 서버 Mac mini 의 /cameras-source 페이지가 이 훅을 사용해 4분할 카메라
 * 캔버스를 WebRTC 로 **CAMERAS_VIEWER** 룸에 송출한다.
 *
 * 기존 useBroadcastPublisher 와 완전 동일한 구조이나, 이벤트 이름만
 * CAMERAS_* 접두사로 분리해 /output 의 퍼블리싱 경로와 독립 운영된다.
 */

import { useEffect, type RefObject } from 'react';
import { getSocket } from '@/lib/socketClient';
import { SOCKET_EVENTS, SOCKET_ROOMS, type WebRTCSignal } from '@/lib/socketEvents';

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};
const CAPTURE_FPS = 60;

export function useCamerasPublisher(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  { enabled = true }: { enabled?: boolean } = {},
): void {
  useEffect(() => {
    if (!enabled) return;
    const socket = getSocket();
    if (!socket) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    // 재연결 시에도 룸 재참가 (룸 멤버십은 연결 단위)
    const joinRoom = () => {
      socket.emit(SOCKET_EVENTS.JOIN_ROOM, SOCKET_ROOMS.CAMERAS_SOURCE);
      socket.emit(SOCKET_EVENTS.CAMERAS_READY);
    };
    socket.emit(SOCKET_EVENTS.JOIN_ROOM, SOCKET_ROOMS.CAMERAS_SOURCE);
    socket.on('connect', joinRoom);

    let stream: MediaStream;
    try {
      stream = canvas.captureStream(CAPTURE_FPS);
    } catch (err) {
      console.warn('[camerasPublisher] canvas.captureStream 실패:', err);
      return;
    }

    const peers = new Map<string, RTCPeerConnection>();

    const createPeer = async (viewerId: string): Promise<void> => {
      const existing = peers.get(viewerId);
      if (existing) {
        try { existing.close(); } catch { /* noop */ }
        peers.delete(viewerId);
      }

      const pc = new RTCPeerConnection(RTC_CONFIG);
      peers.set(viewerId, pc);

      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      pc.onicecandidate = (ev) => {
        if (ev.candidate) {
          socket.emit(SOCKET_EVENTS.CAMERAS_WEBRTC_SIGNAL, {
            kind: 'ice',
            to: viewerId,
            candidate: ev.candidate.toJSON(),
          } satisfies WebRTCSignal);
        }
      };

      pc.onconnectionstatechange = () => {
        const s = pc.connectionState;
        if (s === 'failed' || s === 'closed' || s === 'disconnected') {
          try { pc.close(); } catch { /* noop */ }
          peers.delete(viewerId);
        }
      };

      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit(SOCKET_EVENTS.CAMERAS_WEBRTC_SIGNAL, {
          kind: 'offer',
          to: viewerId,
          sdp: offer,
        } satisfies WebRTCSignal);
      } catch (err) {
        console.warn('[camerasPublisher] offer 실패:', err);
        try { pc.close(); } catch { /* noop */ }
        peers.delete(viewerId);
      }
    };

    const handleViewerJoin = (data: { viewerSocketId: string }) => {
      if (!data?.viewerSocketId) return;
      void createPeer(data.viewerSocketId);
    };

    const handleViewerLeave = (data: { viewerSocketId: string }) => {
      if (!data?.viewerSocketId) return;
      const pc = peers.get(data.viewerSocketId);
      if (pc) {
        try { pc.close(); } catch { /* noop */ }
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
        console.warn('[camerasPublisher] signal 처리 실패:', signal.kind, err);
      }
    };

    socket.on(SOCKET_EVENTS.CAMERAS_VIEWER_JOIN, handleViewerJoin);
    socket.on(SOCKET_EVENTS.CAMERAS_VIEWER_LEAVE, handleViewerLeave);
    socket.on(SOCKET_EVENTS.CAMERAS_WEBRTC_SIGNAL, handleSignal);

    // Source 준비 완료 → 이미 열려 있던 viewer 들에게 join 재발송 요청
    socket.emit(SOCKET_EVENTS.CAMERAS_READY);

    return () => {
      socket.off('connect', joinRoom);
      socket.off(SOCKET_EVENTS.CAMERAS_VIEWER_JOIN, handleViewerJoin);
      socket.off(SOCKET_EVENTS.CAMERAS_VIEWER_LEAVE, handleViewerLeave);
      socket.off(SOCKET_EVENTS.CAMERAS_WEBRTC_SIGNAL, handleSignal);
      peers.forEach((pc) => { try { pc.close(); } catch { /* noop */ } });
      peers.clear();
      stream.getTracks().forEach((t) => t.stop());
    };
  }, [canvasRef, enabled]);
}
