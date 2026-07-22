'use client';

/**
 * hooks/useSocketSender.ts
 * PC1(컴포저) 전용 Socket.io 송신 훅
 *
 * [FEATURE: SOCKET_IO]
 * useBroadcastSender 를 대체. 동일한 { send } API를 유지해
 * SetlistPanel / OperatorPanel 에서의 import 변경만으로 전환 가능.
 *
 * 동작:
 *   1. 마운트 시 'composer' 룸에 참가
 *   2. Output이 참가하면 isOutputConnected → true
 *   3. Output이 이탈하거나 PONG이 끊기면 → false
 *   4. 주기적 PING(3초) 발송 → Output이 PONG 응답 → 연결 유지
 *   5. send(msg) — SocketMessage를 서버를 통해 Output으로 릴레이
 */

import { useEffect, useRef, useCallback } from 'react';
import { getSocket } from '@/lib/socketClient';
import { SOCKET_EVENTS, SOCKET_ROOMS, SocketMessage } from '@/lib/socketEvents';
import { useStore } from '@/lib/store';
import { createSocketTrace } from '@/lib/latencyDiagnostics';

export function useSocketSender() {
  const setOutputConnected = useStore((s) => s.setOutputConnected);
  const pingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pongTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    // ── 'composer' 룸 참가 — 재연결 시에도 반드시 재참가 ────────────────────
    //    (인증 모드에서 canBroadcast가 룸 멤버십을 요구 — 재조인 없으면
    //     재연결 후 모든 송출이 broadcast:forbidden으로 거부됨)
    const joinRoom = () => {
      socket.emit(SOCKET_EVENTS.JOIN_ROOM, SOCKET_ROOMS.COMPOSER);
    };
    joinRoom();
    socket.on('connect', joinRoom);

    // ── Output PC가 참가했을 때 연결 상태 ON ────────────────────────────────
    const handlePeerJoined = ({ room }: { room: string }) => {
      if (room === SOCKET_ROOMS.OUTPUT) {
        setOutputConnected(true);
        resetPongTimeout();
      }
    };

    // ── Output PC가 이탈했을 때 연결 상태 OFF ────────────────────────────────
    const handlePeerLeft = ({ room }: { room: string }) => {
      if (room === SOCKET_ROOMS.OUTPUT) {
        setOutputConnected(false);
      }
    };

    // ── Output PONG 수신 → 연결 유지 ─────────────────────────────────────────
    const handlePong = () => {
      // 이미 true면 스킵 — 3초 PONG마다 스토어 변경(전 패널 리렌더+persist)을 막음
      if (!useStore.getState().isOutputConnected) setOutputConnected(true);
      resetPongTimeout();
    };

    // ── PONG 응답이 8초 내 없으면 연결 끊긴 것으로 판단 ──────────────────────
    function resetPongTimeout() {
      if (pongTimeoutRef.current) clearTimeout(pongTimeoutRef.current);
      pongTimeoutRef.current = setTimeout(() => {
        setOutputConnected(false);
      }, 8000);
    }

    socket.on(SOCKET_EVENTS.PEER_JOINED, handlePeerJoined);
    socket.on(SOCKET_EVENTS.PEER_LEFT, handlePeerLeft);
    socket.on(SOCKET_EVENTS.PONG, handlePong);

    // ── 주기적 PING 발송 ─────────────────────────────────────────────────────
    pingTimerRef.current = setInterval(() => {
      socket.emit(SOCKET_EVENTS.BROADCAST, { type: 'PING' } satisfies SocketMessage);
    }, 3000);

    // 초기 PING
    socket.emit(SOCKET_EVENTS.BROADCAST, { type: 'PING' } satisfies SocketMessage);
    resetPongTimeout();

    return () => {
      socket.off('connect', joinRoom);
      socket.off(SOCKET_EVENTS.PEER_JOINED, handlePeerJoined);
      socket.off(SOCKET_EVENTS.PEER_LEFT, handlePeerLeft);
      socket.off(SOCKET_EVENTS.PONG, handlePong);
      if (pingTimerRef.current) clearInterval(pingTimerRef.current);
      if (pongTimeoutRef.current) clearTimeout(pongTimeoutRef.current);
    };
  }, [setOutputConnected]);

  // ── 외부 공개 API: useBroadcastSender와 동일한 시그니처 유지 ─────────────
  const send = useCallback((msg: SocketMessage) => {
    const socket = getSocket();
    if (!socket) return;
    const trace = msg.trace ?? createSocketTrace(msg);
    socket.emit(SOCKET_EVENTS.BROADCAST, trace ? { ...msg, trace } : msg);
  }, []);

  return { send };
}
