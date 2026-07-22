'use client';

/**
 * hooks/useSocketReceiver.ts
 * PC2(아웃풋) 전용 Socket.io 수신 훅
 *
 * [FEATURE: SOCKET_IO]
 * useBroadcastReceiver 를 대체. 동일한 onMessage 콜백 API를 유지해
 * OutputCanvas 에서의 import 변경만으로 전환 가능.
 *
 * 동작:
 *   1. 마운트 시 'output' 룸에 참가
 *   2. 서버로부터 BROADCAST 이벤트 수신 → onMessage 콜백 호출
 *   3. PING 수신 시 PONG 응답 (Composer 연결 상태 표시용)
 *   4. send(msg) — Output→Composer 메시지 직접 전송 (PONG 등)
 */

import { useEffect, useRef, useCallback } from 'react';
import { getSocket } from '@/lib/socketClient';
import { SOCKET_EVENTS, SOCKET_ROOMS, SocketMessage } from '@/lib/socketEvents';
import { toLatencyReportPayload, type LatencyDiagnosticEntry } from '@/lib/latencyDiagnostics';

export function useSocketReceiver(onMessage: (msg: SocketMessage) => void) {
  const onMessageRef = useRef(onMessage);

  useEffect(() => {
    onMessageRef.current = onMessage;   // 최신 콜백 유지 (stale closure 방지)
  }, [onMessage]);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    // ── 'output' 룸 참가 — 재연결 시에도 반드시 재참가 ─────────────────────
    //    (룸 멤버십은 연결 단위라 WiFi 순단·서버 재시작 후 재조인 없으면
    //     BROADCAST 릴레이를 영영 못 받고 출력이 마지막 화면에 얼어붙음)
    const joinRoom = () => {
      socket.emit(SOCKET_EVENTS.JOIN_ROOM, SOCKET_ROOMS.OUTPUT);
      // 즉시 PONG — Composer에게 Output 존재를 알림
      socket.emit(SOCKET_EVENTS.PONG);
    };
    joinRoom();
    socket.on('connect', joinRoom);

    // ── Composer로부터 메시지 수신 ───────────────────────────────────────────
    const handleBroadcast = (msg: SocketMessage) => {
      // PING에는 PONG으로 자동 응답 (Composer 연결 상태 표시용)
      if (msg.type === 'PING') {
        socket.emit(SOCKET_EVENTS.PONG);
        return;
      }
      // 잘못된 메시지 1건이 출력 창 소켓 핸들러를 죽이지 않도록 격리
      try {
        onMessageRef.current(msg);
      } catch (err) {
        console.error('[receiver] message 처리 실패:', msg?.type, err);
      }
    };

    socket.on(SOCKET_EVENTS.BROADCAST, handleBroadcast);

    return () => {
      socket.off('connect', joinRoom);
      socket.off(SOCKET_EVENTS.BROADCAST, handleBroadcast);
    };
  }, []);

  // ── 외부 공개 API: useBroadcastReceiver와 동일한 시그니처 유지 ───────────
  const send = useCallback((msg: SocketMessage) => {
    const socket = getSocket();
    if (!socket) return;
    // Output 측에서 직접 보내는 메시지 (PONG 등)는 서버 PONG 이벤트로 전송
    if (msg.type === 'PONG') {
      socket.emit(SOCKET_EVENTS.PONG);
    } else {
      // 기타 메시지는 BROADCAST로 릴레이 (향후 Output→Composer 피드백 지원)
      socket.emit(SOCKET_EVENTS.BROADCAST, msg);
    }
  }, []);

  const reportLatency = useCallback((entry: LatencyDiagnosticEntry) => {
    const socket = getSocket();
    if (!socket) return;
    socket.emit(SOCKET_EVENTS.LATENCY_REPORT, toLatencyReportPayload(entry));
  }, []);

  return { send, reportLatency };
}
