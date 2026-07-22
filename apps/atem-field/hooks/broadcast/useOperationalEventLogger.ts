'use client';

import { useEffect, useRef } from 'react';
import { useBroadcastStore } from '@/lib/broadcast/broadcastStore';
import { useMediaStore } from '@/lib/media/mediaStore';
import type {
  BroadcastConnectionSnapshot,
  IncidentLogEntry,
} from '@/lib/media/mediaTypes';
import { getSocket } from '@/lib/socketClient';
import {
  SOCKET_EVENTS,
  SOCKET_ROOMS,
  isSocketMessageTargetedTo,
  type SocketMessage,
} from '@/lib/socketEvents';

type IncidentCategory = NonNullable<IncidentLogEntry['category']>;
type IncidentLevel = IncidentLogEntry['level'];

interface SocketHealthPayload {
  socket?: {
    activeSockets?: number;
    rejectedEvents?: number;
    roomCounts?: Record<string, number>;
  };
}

const HEALTH_POLL_MS = 5_000;
const DUPLICATE_SUPPRESS_MS = 2_500;

export function useOperationalEventLogger(enabled = true) {
  const previousHealthRef = useRef<BroadcastConnectionSnapshot | null>(null);
  const previousRejectedRef = useRef<number | null>(null);
  const healthFailedRef = useRef(false);
  const lastLogAtRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    if (!enabled) return;

    const record = (
      key: string,
      level: IncidentLevel,
      message: string,
      category: IncidentCategory,
      suppressMs = DUPLICATE_SUPPRESS_MS
    ) => {
      const now = Date.now();
      const lastAt = lastLogAtRef.current.get(key) ?? 0;
      if (now - lastAt < suppressMs) return;
      lastLogAtRef.current.set(key, now);
      useMediaStore.getState().recordIncident(level, message, category, { actorId: null });
    };

    const socket = getSocket();
    if (!socket) {
      record('socket-unavailable', 'warn', 'Socket.io 클라이언트를 사용할 수 없습니다', 'system', 60_000);
      return;
    }

    const handleConnect = () => {
      record('socket-connected', 'info', `Socket.io 연결됨 (${socket.id ?? 'id 대기'})`, 'system');
    };

    const handleDisconnect = (reason: string) => {
      record('socket-disconnected', 'warn', `Socket.io 연결 끊김: ${reason}`, 'system');
    };

    const handleConnectError = (error: Error) => {
      record('socket-connect-error', 'error', `Socket.io 연결 실패: ${error.message}`, 'system', 10_000);
    };

    const handleJoinRoomResult = (payload: unknown) => {
      const result = payload as { room?: string; ok?: boolean; reason?: string };
      if (result.room !== SOCKET_ROOMS.VIEWER) return;
      if (result.ok) {
        record('viewer-room-ok', 'info', '브로드캐스트 대시보드가 viewer 룸에 접속했습니다', 'system', 30_000);
      } else {
        record(
          'viewer-room-fail',
          'warn',
          `viewer 룸 접속 거부: ${result.reason ?? 'unknown'}`,
          'system',
          10_000
        );
      }
    };

    const handleOutputReady = () => {
      record('output-ready', 'info', '아웃풋 PC PGM 송출 준비 신호 수신', 'broadcast', 10_000);
    };

    const handleBroadcast = (msg: SocketMessage) => {
      if (!isSocketMessageTargetedTo(msg, 'broadcast')) return;
      const summary = summarizeBroadcastMessage(msg);
      if (!summary) return;
      record(summary.key, summary.level, summary.message, 'broadcast', summary.suppressMs);
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('connect_error', handleConnectError);
    socket.on(SOCKET_EVENTS.JOIN_ROOM_RESULT, handleJoinRoomResult);
    socket.on(SOCKET_EVENTS.OUTPUT_READY, handleOutputReady);
    socket.on(SOCKET_EVENTS.BROADCAST, handleBroadcast);

    if (socket.connected) handleConnect();

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('connect_error', handleConnectError);
      socket.off(SOCKET_EVENTS.JOIN_ROOM_RESULT, handleJoinRoomResult);
      socket.off(SOCKET_EVENTS.OUTPUT_READY, handleOutputReady);
      socket.off(SOCKET_EVENTS.BROADCAST, handleBroadcast);
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;

    const record = (
      key: string,
      level: IncidentLevel,
      message: string,
      category: IncidentCategory,
      suppressMs = DUPLICATE_SUPPRESS_MS
    ) => {
      const now = Date.now();
      const lastAt = lastLogAtRef.current.get(key) ?? 0;
      if (now - lastAt < suppressMs) return;
      lastLogAtRef.current.set(key, now);
      useMediaStore.getState().recordIncident(level, message, category, { actorId: null });
    };

    let alive = true;
    let timer: ReturnType<typeof setInterval> | null = null;

    const pollHealth = async () => {
      try {
        const response = await fetch('/api/health', { cache: 'no-store' });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const payload = (await response.json()) as SocketHealthPayload;
        const snapshot = toConnectionSnapshot(payload);
        if (!alive) return;

        useMediaStore.getState().setConnectionSnapshot(snapshot);
        if (healthFailedRef.current) {
          record('health-restored', 'info', '서버 상태 조회 복구', 'system', 30_000);
          healthFailedRef.current = false;
        }
        logConnectionChanges(record, previousHealthRef.current, snapshot);
        previousHealthRef.current = snapshot;

        const rejected = payload.socket?.rejectedEvents ?? 0;
        const previousRejected = previousRejectedRef.current;
        if (previousRejected !== null && rejected > previousRejected) {
          record(
            `socket-rejected-${rejected}`,
            'warn',
            `Socket.io 거부 이벤트 ${rejected - previousRejected}건 발생`,
            'system'
          );
        }
        previousRejectedRef.current = rejected;
      } catch (error) {
        if (!alive) return;
        if (!healthFailedRef.current) {
          record(
            'health-failed',
            'warn',
            `서버 상태 조회 실패: ${(error as Error).message}`,
            'system',
            30_000
          );
          healthFailedRef.current = true;
        }
      }
    };

    void pollHealth();
    timer = setInterval(() => void pollHealth(), HEALTH_POLL_MS);

    return () => {
      alive = false;
      if (timer) clearInterval(timer);
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;

    let lastStatus = useBroadcastStore.getState().liveStatus;
    let lastError = useBroadcastStore.getState().liveError;

    const unsubscribe = useBroadcastStore.subscribe((state) => {
      const record = (
        key: string,
        level: IncidentLevel,
        message: string,
        category: IncidentCategory,
        suppressMs = DUPLICATE_SUPPRESS_MS
      ) => {
        const now = Date.now();
        const lastAt = lastLogAtRef.current.get(key) ?? 0;
        if (now - lastAt < suppressMs) return;
        lastLogAtRef.current.set(key, now);
        useMediaStore.getState().recordIncident(level, message, category, { actorId: null });
      };

      if (state.liveStatus !== lastStatus) {
        if (state.liveStatus === 'connecting') {
          record('live-connecting', 'info', '라이브 인코더 연결 중', 'live');
        } else if (state.liveStatus === 'live') {
          const bitrate = state.liveStats.bitrate
            ? ` · ${(state.liveStats.bitrate / 1000).toFixed(2)} Mbps`
            : '';
          record('live-confirmed', 'info', `라이브 인코더 송출 확인${bitrate}`, 'live');
        } else if (state.liveStatus === 'idle' && lastStatus !== 'idle') {
          record('live-idle', 'info', '라이브 인코더 종료', 'live');
        } else if (state.liveStatus === 'error') {
          record('live-error', 'error', `라이브 인코더 오류: ${state.liveError ?? 'unknown'}`, 'live');
        }
        lastStatus = state.liveStatus;
      }

      if (state.liveError && state.liveError !== lastError) {
        record('live-error-message', 'error', `라이브 오류: ${state.liveError}`, 'live', 10_000);
      }
      lastError = state.liveError;
    });

    return unsubscribe;
  }, [enabled]);
}

function toConnectionSnapshot(payload: SocketHealthPayload): BroadcastConnectionSnapshot {
  const socket = payload.socket;
  const rooms = socket?.roomCounts ?? {};
  return {
    at: Date.now(),
    socketConnected: true,
    activeSockets: Number(socket?.activeSockets ?? 0),
    composer: Number(rooms[SOCKET_ROOMS.COMPOSER] ?? 0),
    output: Number(rooms[SOCKET_ROOMS.OUTPUT] ?? 0),
    viewer: Number(rooms[SOCKET_ROOMS.VIEWER] ?? 0),
    camerasSource: Number(rooms[SOCKET_ROOMS.CAMERAS_SOURCE] ?? 0),
    camerasViewer: Number(rooms[SOCKET_ROOMS.CAMERAS_VIEWER] ?? 0),
  };
}

function logConnectionChanges(
  record: (
    key: string,
    level: IncidentLevel,
    message: string,
    category: IncidentCategory,
    suppressMs?: number
  ) => void,
  previous: BroadcastConnectionSnapshot | null,
  next: BroadcastConnectionSnapshot
) {
  if (!previous) {
    record(
      'connection-initial',
      next.output > 0 ? 'info' : 'warn',
      `접속 상태 확인: 총 ${next.activeSockets} · 컴포즈 ${next.composer} · 아웃풋 ${next.output} · 확인 ${next.viewer}`,
      'system',
      30_000
    );
    return;
  }

  if (previous.output === 0 && next.output > 0) {
    record('output-online', 'info', '아웃풋 PC 온라인', 'system');
  } else if (previous.output > 0 && next.output === 0) {
    record('output-offline', 'warn', '아웃풋 PC 오프라인 또는 송출 창 닫힘', 'system');
  }

  if (previous.composer === 0 && next.composer > 0) {
    record('composer-online', 'info', '콤포우즈 제어 PC 온라인', 'system');
  } else if (previous.composer > 0 && next.composer === 0) {
    record('composer-offline', 'warn', '콤포우즈 제어 PC 오프라인', 'system');
  }

  if (previous.viewer !== next.viewer) {
    record(
      `viewer-count-${next.viewer}`,
      'info',
      `브로드캐스트 확인 접속 ${next.viewer}대`,
      'system',
      5_000
    );
  }
}

function summarizeBroadcastMessage(msg: SocketMessage):
  | {
      key: string;
      level: IncidentLevel;
      message: string;
      suppressMs: number;
    }
  | null {
  switch (msg.type) {
    case 'SUBTITLE_UPDATE': {
      const text = compact(msg.payload.text);
      return text
        ? {
            key: `subtitle-${text}`,
            level: 'info',
            message: `자막 송출 수신: ${text}`,
            suppressMs: 3_000,
          }
        : null;
    }
    case 'ELEMENTS_UPDATE': {
      const label = compact(msg.payload.sectionText) || `${msg.payload.elements.length}개 요소`;
      return {
        key: `elements-${label}`,
        level: 'info',
        message: `섹션 송출 수신: ${label}`,
        suppressMs: 3_000,
      };
    }
    case 'FRAME_SHOW': {
      const label = compact(msg.payload.sectionText);
      return label
        ? {
            key: `frame-show-${label}`,
            level: 'info',
            message: `프레임 송출 수신: ${label}`,
            suppressMs: 3_000,
          }
        : null;
    }
    case 'FRAME_UPDATE': {
      const label = compact(msg.payload.sectionText);
      return label
        ? {
            key: `frame-update-${label}`,
            level: 'info',
            message: `모션 프레임 수신 중: ${label}`,
            suppressMs: 15_000,
          }
        : null;
    }
    case 'BLACKOUT':
      return {
        key: `blackout-${msg.payload.active ? 'on' : 'off'}`,
        level: msg.payload.active ? 'warn' : 'info',
        message: msg.payload.active ? '블랙 화면 ON' : '블랙 화면 OFF',
        suppressMs: 1_000,
      };
    case 'CLEAR_TEXT':
      return {
        key: 'clear-text',
        level: 'info',
        message: '송출 자막/요소 클리어',
        suppressMs: 2_000,
      };
    case 'CAMERA_SOURCE':
      return {
        key: `camera-${msg.payload.deviceId}`,
        level: 'info',
        message: `카메라 소스 변경: ${msg.payload.deviceId}`,
        suppressMs: 3_000,
      };
    case 'VIDEO_COMMAND':
      return {
        key: `video-${msg.payload.youtubeId}-${msg.payload.command}`,
        level: 'info',
        message: `영상 제어: ${msg.payload.command}`,
        suppressMs: 3_000,
      };
    default:
      return null;
  }
}

function compact(value: string): string {
  const text = value.replace(/\s+/g, ' ').trim();
  if (text.length <= 28) return text;
  return `${text.slice(0, 27)}...`;
}
