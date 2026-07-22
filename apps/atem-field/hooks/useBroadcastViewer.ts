'use client';

/**
 * hooks/useBroadcastViewer.ts
 * /media/broadcast 대시보드 미러 창 전용 — 읽기 전용 Socket.io 수신 훅
 *
 * [FEATURE: BROADCAST_VIEWER]
 *
 * useSocketReceiver 와의 차이:
 *   - VIEWER 룸에 참가 (OUTPUT 과 분리, 하트비트 영향 없음)
 *   - PONG 송신하지 않음 (OUTPUT 존재 감지를 방해하지 않음)
 *   - PING 에 자동 응답하지 않음
 *   - 수신 메시지를 콜백이 아닌 **상태(state)**로 노출 → 캔버스 렌더링에 직접 사용
 *
 * 반환 값:
 *   - connected        : Socket.io 연결 상태 (websocket OPEN)
 *   - hasReceived      : 첫 BROADCAST 메시지 수신 여부 (false = 아무도 송출 중 아님)
 *   - lastMessageAt    : 마지막 메시지 수신 시각 (ms)
 *   - subtitleText     : 현재 자막 텍스트
 *   - subtitleStyle    : 현재 자막 스타일
 *   - elements         : 현재 캔버스 요소 배열
 *   - sectionText      : 현재 섹션 텍스트
 *   - blackout         : 블랙아웃 상태
 */

import { useEffect, useState } from 'react';
import { getSocket } from '@/lib/socketClient';
import { SOCKET_EVENTS, SOCKET_ROOMS, SocketMessage, isSocketMessageTargetedTo } from '@/lib/socketEvents';
import { SubtitleStyle, DEFAULT_SUBTITLE_STYLE } from '@/lib/types';
import { CanvasElement } from '@/lib/canvasTypes';

export interface BroadcastViewerState {
  connected: boolean;
  hasReceived: boolean;
  lastMessageAt: number | null;
  subtitleText: string;
  subtitleStyle: SubtitleStyle;
  elements: CanvasElement[];
  sectionText: string;
  blackout: boolean;
}

const INITIAL_STATE: BroadcastViewerState = {
  connected: false,
  hasReceived: false,
  lastMessageAt: null,
  subtitleText: '',
  subtitleStyle: DEFAULT_SUBTITLE_STYLE,
  elements: [],
  sectionText: '',
  blackout: false,
};

export function useBroadcastViewer(): BroadcastViewerState {
  const [state, setState] = useState<BroadcastViewerState>(INITIAL_STATE);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    // ── 연결 상태 트래킹 ─────────────────────────────────────────────────────
    const handleConnect = () => {
      setState((prev) => ({ ...prev, connected: true }));
      // 연결되자마자 VIEWER 룸 참가
      socket.emit(SOCKET_EVENTS.JOIN_ROOM, SOCKET_ROOMS.VIEWER);
    };
    const handleDisconnect = () => {
      setState((prev) => ({ ...prev, connected: false }));
    };

    // ── BROADCAST 수신 → 상태 업데이트 ──────────────────────────────────────
    const handleBroadcast = (msg: SocketMessage) => {
      if (!isSocketMessageTargetedTo(msg, 'broadcast')) return;

      const now = Date.now();
      setState((prev) => {
        const next: BroadcastViewerState = {
          ...prev,
          hasReceived: true,
          lastMessageAt: now,
        };

        switch (msg.type) {
          case 'SUBTITLE_UPDATE':
            next.subtitleText = msg.payload.text;
            next.subtitleStyle = msg.payload.style;
            break;
          case 'ELEMENTS_UPDATE':
            next.subtitleText = '';
            next.elements = msg.payload.elements;
            next.sectionText = msg.payload.sectionText;
            break;
          // [BUGFIX] FRAME_SHOW / FRAME_UPDATE 수신 시 섹션 전환 반영.
          //   이전에는 무시되어서 이전 섹션의 YouTube iframe 요소가 대시보드에
          //   잔존하는 버그가 있었음 (Section이 비디오→비모션 으로 바뀐 경우).
          //   OutputCanvas 와 동일한 규칙: hasMotion=false 면 elements 초기화
          //   (모션 섹션이면 이어서 ELEMENTS_UPDATE 가 별도로 와서 elements 갱신).
          case 'FRAME_SHOW':
          case 'FRAME_UPDATE':
            next.subtitleText = '';
            next.sectionText = msg.payload.sectionText;
            if (!msg.payload.hasMotion) {
              next.elements = [];
            }
            break;
          case 'BLACKOUT':
            next.blackout = msg.payload.active;
            break;
          case 'CLEAR_TEXT':
            next.subtitleText = '';
            next.elements = [];
            next.sectionText = '';
            break;
          // VIEWER 는 CAMERA_SOURCE / VIDEO_COMMAND / PING / PONG 무시
          default:
            break;
        }
        return next;
      });
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on(SOCKET_EVENTS.BROADCAST, handleBroadcast);

    // 이미 연결되어 있으면 즉시 조인
    if (socket.connected) {
      handleConnect();
    }

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off(SOCKET_EVENTS.BROADCAST, handleBroadcast);
    };
  }, []);

  return state;
}
