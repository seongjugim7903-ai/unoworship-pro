'use client';

/**
 * hooks/useCamerasVideoStream.ts
 * [FEATURE: CAMERAS_RELAY]
 *
 * 원격 composer 의 CameraGrid 에서 사용하는 구독자 훅.
 * 서버 /cameras-source 페이지가 송출하는 MultiView 캡처 스트림을 WebRTC 로 수신.
 *
 * useBroadcastVideoStream 과 동일한 구조이며 이벤트 이름만
 * CAMERAS_* 접두사로 분리되어 /output 스트림과 독립 운영.
 *
 * 자동으로 CAMERAS_VIEWER 룸에 참가하고, 서버 퍼블리셔가 준비되면 offer 수신.
 *
 * [공유 연결 — 2026-07-07]
 *   퍼블리셔(useCamerasPublisher)는 소켓 ID(=브라우저 탭)당 RTCPeerConnection 을
 *   1개만 만든다. 그런데 한 composer 탭 안에서 이 훅을 CameraGrid 와
 *   ProgramMirror(맥 릴레이 모드)가 동시에 쓰면, offer 하나에 answer 가 두 번
 *   날아가 먼저 도착한 쪽만 연결되고 나머지는 영원히 "대기"에 머무는 경합이
 *   있었다 (그리드만 안 뜨던 현장 사고).
 *   → WebRTC 연결과 MediaStream 을 모듈 레벨에서 탭당 1개만 유지하고,
 *     모든 훅 인스턴스가 같은 스트림을 나눠 쓴다. 하나의 MediaStream 을
 *     여러 <video> 에 붙이는 것은 표준 동작이라 문제없다.
 */

import { useSyncExternalStore } from 'react';
import { getSocket } from '@/lib/socketClient';
import { SOCKET_EVENTS, SOCKET_ROOMS, type WebRTCSignal } from '@/lib/socketEvents';

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

export interface UseCamerasVideoStreamResult {
  stream: MediaStream | null;
  connected: boolean;
  connectionState: RTCPeerConnectionState | 'idle';
}

// ── 탭 전체가 공유하는 단일 구독 상태 ─────────────────────────────────────
type SharedState = {
  stream: MediaStream | null;
  connectionState: RTCPeerConnectionState | 'idle';
};

let shared: SharedState = { stream: null, connectionState: 'idle' };
const listeners = new Set<() => void>();
let refCount = 0;
let peer: RTCPeerConnection | null = null;
let detachSocket: (() => void) | null = null;

function notify(next: SharedState) {
  shared = next;
  listeners.forEach((fn) => fn());
}

function cleanupPeer() {
  if (peer) {
    try { peer.close(); } catch { /* noop */ }
    peer = null;
  }
  notify({ stream: null, connectionState: 'idle' });
}

/** 첫 구독자가 생길 때 한 번만 소켓 핸들러를 붙인다. */
function attach() {
  const socket = getSocket();
  if (!socket || detachSocket) return;

  // 구독자 룸 참가 + 합류 알림
  const announceJoin = () => {
    socket.emit(SOCKET_EVENTS.JOIN_ROOM, SOCKET_ROOMS.CAMERAS_VIEWER);
    socket.emit(SOCKET_EVENTS.CAMERAS_VIEWER_JOIN);
  };

  if (socket.connected) announceJoin();

  const handleConnect = () => announceJoin();
  const handleCamerasReady = () => announceJoin();

  const handleSignal = async (signal: WebRTCSignal & { from: string }) => {
    if (!signal?.from) return;

    if (signal.kind === 'offer') {
      cleanupPeer();

      const pc = new RTCPeerConnection(RTC_CONFIG);
      peer = pc;

      pc.ontrack = (ev) => {
        if (ev.streams && ev.streams[0]) {
          notify({ ...shared, stream: ev.streams[0] });
        }
      };

      pc.onicecandidate = (ev) => {
        if (ev.candidate) {
          socket.emit(SOCKET_EVENTS.CAMERAS_WEBRTC_SIGNAL, {
            kind: 'ice',
            to: signal.from,
            candidate: ev.candidate.toJSON(),
          } satisfies WebRTCSignal);
        }
      };

      pc.onconnectionstatechange = () => {
        const s = pc.connectionState;
        notify({ ...shared, connectionState: s });
        if (s === 'failed' || s === 'closed' || s === 'disconnected') {
          cleanupPeer();
        }
      };

      try {
        await pc.setRemoteDescription(signal.sdp);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit(SOCKET_EVENTS.CAMERAS_WEBRTC_SIGNAL, {
          kind: 'answer',
          to: signal.from,
          sdp: answer,
        } satisfies WebRTCSignal);
      } catch (err) {
        console.warn('[camerasViewer] answer 생성 실패:', err);
        cleanupPeer();
      }
    } else if (signal.kind === 'ice') {
      const pc = peer;
      if (!pc) return;
      try {
        await pc.addIceCandidate(signal.candidate);
      } catch (err) {
        console.warn('[camerasViewer] addIceCandidate 실패:', err);
      }
    }
  };

  socket.on('connect', handleConnect);
  socket.on(SOCKET_EVENTS.CAMERAS_READY, handleCamerasReady);
  socket.on(SOCKET_EVENTS.CAMERAS_WEBRTC_SIGNAL, handleSignal);

  detachSocket = () => {
    socket.off('connect', handleConnect);
    socket.off(SOCKET_EVENTS.CAMERAS_READY, handleCamerasReady);
    socket.off(SOCKET_EVENTS.CAMERAS_WEBRTC_SIGNAL, handleSignal);
    detachSocket = null;
  };
}

function subscribe(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  refCount += 1;
  if (refCount === 1) attach();

  return () => {
    listeners.delete(onStoreChange);
    refCount -= 1;
    if (refCount === 0) {
      if (detachSocket) detachSocket();
      cleanupPeer();
    }
  };
}

function getSnapshot(): SharedState {
  return shared;
}

export function useCamerasVideoStream(): UseCamerasVideoStreamResult {
  // 모듈 레벨 공유 스토어 구독 — 인스턴스 수와 무관하게 연결은 탭당 1개.
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  return {
    stream: state.stream,
    connected: state.connectionState === 'connected',
    connectionState: state.connectionState,
  };
}
