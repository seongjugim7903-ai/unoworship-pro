'use client';

/**
 * hooks/useBroadcastVideoStream.ts
 * /media/broadcast Viewer 측 WebRTC 미러 수신 훅
 *
 * [FEATURE: BROADCAST_VIEWER / WEBRTC]
 *
 * 동작:
 *   1. 마운트 시 VIEWER 룸 참가
 *   2. OUTPUT_READY 또는 socket 'connect' 시 VIEWER_JOIN 송신
 *   3. Output 이 보낸 SDP offer 수신 → answer 생성 → 송신
 *   4. ICE 후보 양방향 교환
 *   5. ontrack 으로 들어온 MediaStream 을 상태로 노출
 *
 * 반환:
 *   - stream          : Output 으로부터 수신한 MediaStream (없으면 null)
 *   - connected       : peer connection 이 'connected' 상태인지
 *   - connectionState : 세부 상태 (디버깅/UI 용)
 */

import { useEffect, useRef, useState } from 'react';
import { getSocket } from '@/lib/socketClient';
import { SOCKET_EVENTS, SOCKET_ROOMS, type WebRTCSignal } from '@/lib/socketEvents';

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
  ],
  iceCandidatePoolSize: 4,
  bundlePolicy: 'max-bundle',
};

export interface UseBroadcastVideoStreamResult {
  stream: MediaStream | null;
  connected: boolean;
  connectionState: RTCPeerConnectionState | 'idle';
}

export interface UseBroadcastVideoStreamOptions {
  /**
   * 운영자 PGM 프리뷰처럼 부드러움보다 즉시성이 중요한 수신자에서 사용한다.
   * 지원 브라우저에서는 WebRTC jitter buffer 목표값을 낮춰 LAN 지연을 줄인다.
   */
  lowLatency?: boolean;
}

type LowLatencyRtpReceiver = RTCRtpReceiver & {
  jitterBufferTarget?: number;
};

function applyLowLatencyReceiverOptions(pc: RTCPeerConnection): void {
  for (const receiver of pc.getReceivers()) {
    const target = receiver as LowLatencyRtpReceiver;
    if (!('jitterBufferTarget' in target)) continue;
    try {
      target.jitterBufferTarget = 0;
    } catch {
      /* Browser may expose the field but reject writes. */
    }
  }
}

export function useBroadcastVideoStream(
  options: UseBroadcastVideoStreamOptions = {},
): UseBroadcastVideoStreamResult {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [connectionState, setConnectionState] = useState<
    RTCPeerConnectionState | 'idle'
  >('idle');
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const lowLatencyRef = useRef(options.lowLatency === true);

  useEffect(() => {
    lowLatencyRef.current = options.lowLatency === true;
  }, [options.lowLatency]);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    // ─── 1. JOIN 요청 송신 헬퍼 ────────────────────────────────────────────
    const announceJoin = () => {
      socket.emit(SOCKET_EVENTS.JOIN_ROOM, SOCKET_ROOMS.VIEWER);
      console.log('[viewer] VIEWER room 참가 + VIEWER_JOIN 송신, socket.id=', socket.id);
      socket.emit(SOCKET_EVENTS.VIEWER_JOIN);
    };

    // 이미 연결되어 있으면 즉시 1회
    if (socket.connected) {
      console.log('[viewer] 마운트 시 socket 이미 연결됨 → 즉시 JOIN');
      announceJoin();
    } else {
      console.log('[viewer] socket 미연결, connect 이벤트 대기');
    }

    const handleConnect = () => {
      console.log('[viewer] socket connect 이벤트 → JOIN');
      announceJoin();
    };

    // Output 이 나중에 합류했을 때의 재발송 트리거
    const handleOutputReady = () => {
      console.log('[viewer] OUTPUT_READY 수신 → JOIN 재발송');
      announceJoin();
    };

    // ─── 2. SDP / ICE 시그널 처리 ──────────────────────────────────────────
    const cleanupPeer = () => {
      if (peerRef.current) {
        try {
          peerRef.current.close();
        } catch {
          /* noop */
        }
        peerRef.current = null;
      }
      setStream(null);
      setConnectionState('idle');
    };

    const handleSignal = async (signal: WebRTCSignal & { from: string }) => {
      if (!signal?.from) return;

      if (signal.kind === 'offer') {
        console.log('[viewer] OFFER 수신 from=', signal.from);
        cleanupPeer();

        const pc = new RTCPeerConnection(RTC_CONFIG);
        peerRef.current = pc;

        pc.ontrack = (ev) => {
          console.log('[viewer] ontrack — stream 수신');
          if (lowLatencyRef.current) {
            applyLowLatencyReceiverOptions(pc);
          }
          if (ev.streams && ev.streams[0]) {
            setStream(ev.streams[0]);
          }
        };

        pc.onicecandidate = (ev) => {
          if (ev.candidate) {
            console.log('[viewer] ICE candidate 송신:', ev.candidate.type, ev.candidate.address ?? ev.candidate.candidate);
            socket.emit(SOCKET_EVENTS.WEBRTC_SIGNAL, {
              kind: 'ice',
              to: signal.from,
              candidate: ev.candidate.toJSON(),
            } satisfies WebRTCSignal);
          } else {
            console.log('[viewer] ICE gathering 완료');
          }
        };

        pc.onconnectionstatechange = () => {
          const s = pc.connectionState;
          console.log('[viewer] connectionState:', s);
          setConnectionState(s);
          if (s === 'failed' || s === 'closed' || s === 'disconnected') {
            cleanupPeer();
          }
        };

        pc.oniceconnectionstatechange = () => {
          console.log('[viewer] iceConnectionState:', pc.iceConnectionState);
        };

        try {
          await pc.setRemoteDescription(signal.sdp);
          if (lowLatencyRef.current) {
            applyLowLatencyReceiverOptions(pc);
          }
          console.log('[viewer] setRemoteDescription OK');
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          console.log('[viewer] answer 송신');
          socket.emit(SOCKET_EVENTS.WEBRTC_SIGNAL, {
            kind: 'answer',
            to: signal.from,
            sdp: answer,
          } satisfies WebRTCSignal);
        } catch (err) {
          console.warn('[viewer] answer 생성 실패:', err);
          cleanupPeer();
        }
      } else if (signal.kind === 'ice') {
        const pc = peerRef.current;
        if (!pc) return;
        try {
          await pc.addIceCandidate(signal.candidate);
          console.log('[viewer] ICE candidate 수신·추가 OK');
        } catch (err) {
          console.warn('[viewer] addIceCandidate 실패:', err);
        }
      }
    };

    socket.on('connect', handleConnect);
    socket.on(SOCKET_EVENTS.OUTPUT_READY, handleOutputReady);
    socket.on(SOCKET_EVENTS.WEBRTC_SIGNAL, handleSignal);

    return () => {
      socket.off('connect', handleConnect);
      socket.off(SOCKET_EVENTS.OUTPUT_READY, handleOutputReady);
      socket.off(SOCKET_EVENTS.WEBRTC_SIGNAL, handleSignal);
      cleanupPeer();
    };
  }, []);

  return {
    stream,
    connected: connectionState === 'connected',
    connectionState,
  };
}
