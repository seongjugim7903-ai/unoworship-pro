/**
 * lib/server/socketServer.ts
 * Socket.io 서버 룸/릴레이 로직
 *
 * [FEATURE: SOCKET_IO]
 * ─ 서버 전용 파일 (Node.js 환경, 브라우저에서 직접 import 금지) ─
 *
 * 역할:
 *   - PC1(컴포저)가 'composer' 룸에, PC2(아웃풋)가 'output' 룸에 참가
 *   - Composer → BROADCAST → 서버 → Output 릴레이
 *   - Output → PONG → 서버 → Composer 릴레이
 *   - 상대방 참가/이탈 이벤트를 각 룸에 알림 (연결 상태 UI 표시용)
 */

import type { Server as SocketIOServer, Socket } from 'socket.io';
import { SOCKET_EVENTS, SOCKET_ROOMS, SocketMessage, WebRTCSignal } from '../socketEvents';
import { attachServerTrace, type LatencyReportPayload } from '../latencyDiagnostics';
import {
  getAuthFromCookieHeader,
  getSocketDevAuth,
  hasMinRole,
  ServerAuthContext,
  verifyDeviceToken,
} from '../auth/serverAuth';

const MAX_SOCKET_MESSAGE_BYTES = 16 * 1024 * 1024;
const MAX_WEBRTC_SIGNAL_BYTES = 256 * 1024;
const MAX_LATENCY_REPORTS = 300;
const MAX_BROADCAST_DIAGNOSTICS = 300;
const MAX_TEXT_LENGTH = 20_000;
const MAX_SOCKET_ID_LENGTH = 128;
const MAX_CANVAS_ELEMENTS = 250;
const MAX_SOCKET_TARGETS = 3;
const SOCKET_ID_PATTERN = /^[A-Za-z0-9_-]+$/;
const SOCKET_MESSAGE_TARGETS = new Set<string>(['output', 'prompt', 'broadcast']);
const SOCKET_MESSAGE_TYPES = new Set<string>([
  'SUBTITLE_UPDATE',
  'ELEMENTS_UPDATE',
  'BLACKOUT',
  'CLEAR_TEXT',
  'CAMERA_SOURCE',
  'VIDEO_COMMAND',
  'FRAME_UPDATE',
  'FRAME_CACHE',
  'FRAME_SHOW',
  'PING',
  'PONG',
]);

const SOCKET_METRIC_ROOMS = Object.values(SOCKET_ROOMS) as string[];

type SocketRuntimeMetrics = {
  startedAt: string;
  uptimeSeconds: number;
  activeSockets: number;
  connectedTotal: number;
  disconnectedTotal: number;
  rejectedEvents: number;
  broadcastMessages: number;
  webrtcSignals: number;
  latencyReports: number;
  latencyReportsRejected: number;
  roomCounts: Record<string, number>;
};

type StoredLatencyReport = LatencyReportPayload & {
  serverStoredAt: string;
  socketId: string;
};

type StoredBroadcastDiagnostic = {
  serverSeenAt: string;
  socketId: string;
  type: string;
  targets: string;
  traceId?: string;
  renderMode?: string;
  sectionId?: string;
  elementCount?: number;
  frameBytes?: number;
  textLength?: number;
  cachePhase?: string;
  cacheDecision?: string;
  cacheReason?: string;
  cacheKeyDigest?: string;
  cacheAgeMs?: number;
  fixedLayerCount?: number;
  ownElementCount?: number;
  outputElementCount?: number;
  hasOutputRouting?: boolean;
  hasOutputVideo?: boolean;
  outputOnlyFrame?: boolean;
};

type LatencyMetricStats = {
  count: number;
  minMs: number | null;
  maxMs: number | null;
  avgMs: number | null;
  latestMs: number | null;
};

type LatencyReportSummary = {
  count: number;
  total: LatencyMetricStats;
  control: LatencyMetricStats;
  network: LatencyMetricStats;
  render: LatencyMetricStats;
  relay: LatencyMetricStats;
};

type LatencyDiagnosticsSnapshot = {
  generatedAt: string;
  storedCount: number;
  totalReceived: number;
  rejected: number;
  summaries: {
    overall: LatencyReportSummary;
    bySurface: Record<string, LatencyReportSummary>;
    byRenderMode: Record<string, LatencyReportSummary>;
  };
  recent: StoredLatencyReport[];
  broadcastsRecent: StoredBroadcastDiagnostic[];
};

type SocketRuntimeState = {
  startedAtMs: number;
  activeSockets: number;
  connectedTotal: number;
  disconnectedTotal: number;
  rejectedEvents: number;
  broadcastMessages: number;
  webrtcSignals: number;
  latencyReports: number;
  latencyReportsRejected: number;
  latencyReportsRecent: StoredLatencyReport[];
  broadcastDiagnosticsRecent: StoredBroadcastDiagnostic[];
  roomCounts: Record<string, number>;
  // [FEATURE: STATE_REPLAY] 늦게 합류한 출력창 복구용 — 마지막 시각 상태 1건 + 블랙아웃 1건
  lastVisualState: SocketMessage | null;
  lastBlackout: SocketMessage | null;
  // FRAME_SHOW 리플레이용 프레임 캐시 (sectionId → frame dataURL, LRU 상한)
  replayFrameCache: Map<string, string>;
};

type GlobalWithSocketRuntime = typeof globalThis & {
  __unoliveSocketRuntimeState?: SocketRuntimeState;
};

function createSocketRuntimeState(): SocketRuntimeState {
  return {
    startedAtMs: Date.now(),
    activeSockets: 0,
    connectedTotal: 0,
    disconnectedTotal: 0,
    rejectedEvents: 0,
    broadcastMessages: 0,
    webrtcSignals: 0,
    latencyReports: 0,
    latencyReportsRejected: 0,
    latencyReportsRecent: [],
    broadcastDiagnosticsRecent: [],
    roomCounts: Object.fromEntries(SOCKET_METRIC_ROOMS.map((room) => [room, 0])) as Record<string, number>,
    lastVisualState: null,
    lastBlackout: null,
    replayFrameCache: new Map(),
  };
}

const globalSocketRuntime = globalThis as GlobalWithSocketRuntime;
const socketRuntimeState = globalSocketRuntime.__unoliveSocketRuntimeState ??= createSocketRuntimeState();
// dev HMR 등으로 구버전 상태 객체가 재사용될 때 신규 필드 보강
socketRuntimeState.lastVisualState ??= null;
socketRuntimeState.lastBlackout ??= null;
socketRuntimeState.replayFrameCache ??= new Map();

// [FEATURE: STATE_REPLAY] ─────────────────────────────────────────────────────
// 마지막 송출 상태를 보관했다가, OUTPUT 룸에 (재)합류한 창에 즉시 재전송한다.
// → 출력창 리로드·재연결 시 다음 조작을 기다리지 않고 현재 자막/블랙아웃이 복원됨.

const REPLAY_FRAME_CACHE_MAX = 12;
const VISUAL_STATE_TYPES: ReadonlySet<SocketMessage['type']> = new Set([
  'SUBTITLE_UPDATE', 'ELEMENTS_UPDATE', 'FRAME_UPDATE', 'FRAME_SHOW', 'CLEAR_TEXT',
]);

function captureReplayState(msg: SocketMessage): void {
  if (msg.type === 'FRAME_CACHE') {
    const cache = socketRuntimeState.replayFrameCache;
    cache.delete(msg.payload.sectionId);
    cache.set(msg.payload.sectionId, msg.payload.frame);
    while (cache.size > REPLAY_FRAME_CACHE_MAX) {
      const oldest = cache.keys().next().value;
      if (oldest === undefined) break;
      cache.delete(oldest);
    }
    return;
  }
  if (msg.type === 'BLACKOUT') {
    socketRuntimeState.lastBlackout = msg;
    return;
  }
  if (VISUAL_STATE_TYPES.has(msg.type)) {
    socketRuntimeState.lastVisualState = msg;
  }
}

// 리플레이 시 전환 효과 재생을 막는다 (리로드 복구가 애니메이션으로 보이면 안 됨)
function withoutTransition(msg: SocketMessage): SocketMessage {
  if ('payload' in msg && msg.payload && typeof msg.payload === 'object' && 'transition' in msg.payload) {
    return { ...msg, payload: { ...msg.payload, transition: undefined } } as SocketMessage;
  }
  return msg;
}

function replayLastStateTo(socket: Socket): void {
  try {
    const visual = socketRuntimeState.lastVisualState;
    if (visual) {
      if (visual.type === 'FRAME_SHOW') {
        // FRAME_SHOW는 수신 측 프레임 캐시에 의존 — 새 창엔 캐시가 없으므로
        // 보관해 둔 프레임으로 자기완결형 FRAME_UPDATE를 합성해 보낸다.
        const frame = socketRuntimeState.replayFrameCache.get(visual.payload.sectionId);
        if (frame) {
          const { sectionId: _sectionId, ...rest } = visual.payload;
          const synthesized = {
            ...visual,
            type: 'FRAME_UPDATE',
            payload: { ...rest, frame, transition: undefined },
          } as SocketMessage;
          socket.emit(SOCKET_EVENTS.BROADCAST, synthesized);
        }
      } else {
        socket.emit(SOCKET_EVENTS.BROADCAST, withoutTransition(visual));
      }
    }
    const blackout = socketRuntimeState.lastBlackout;
    if (blackout && blackout.type === 'BLACKOUT' && blackout.payload.active) {
      socket.emit(SOCKET_EVENTS.BROADCAST, blackout);
    }
  } catch (err) {
    console.error('[socket] 상태 리플레이 실패:', err);
  }
}
// [/FEATURE: STATE_REPLAY] ────────────────────────────────────────────────────

function refreshRoomCounts(io: SocketIOServer): void {
  const rooms = io.sockets.adapter.rooms;
  socketRuntimeState.roomCounts = Object.fromEntries(
    SOCKET_METRIC_ROOMS.map((room) => [room, rooms.get(room)?.size ?? 0])
  ) as Record<string, number>;
}

export function getSocketRuntimeMetrics(): SocketRuntimeMetrics {
  return {
    startedAt: new Date(socketRuntimeState.startedAtMs).toISOString(),
    uptimeSeconds: Math.floor((Date.now() - socketRuntimeState.startedAtMs) / 1000),
    activeSockets: socketRuntimeState.activeSockets,
    connectedTotal: socketRuntimeState.connectedTotal,
    disconnectedTotal: socketRuntimeState.disconnectedTotal,
    rejectedEvents: socketRuntimeState.rejectedEvents,
    broadcastMessages: socketRuntimeState.broadcastMessages,
    webrtcSignals: socketRuntimeState.webrtcSignals,
    latencyReports: socketRuntimeState.latencyReports,
    latencyReportsRejected: socketRuntimeState.latencyReportsRejected,
    roomCounts: { ...socketRuntimeState.roomCounts },
  };
}

export function getLatencyDiagnostics(limit = 80): LatencyDiagnosticsSnapshot {
  const recent = socketRuntimeState.latencyReportsRecent.slice(0, Math.max(1, Math.min(limit, MAX_LATENCY_REPORTS)));
  return {
    generatedAt: new Date().toISOString(),
    storedCount: socketRuntimeState.latencyReportsRecent.length,
    totalReceived: socketRuntimeState.latencyReports,
    rejected: socketRuntimeState.latencyReportsRejected,
    summaries: {
      overall: summarizeLatencyReports(recent),
      bySurface: summarizeBy(recent, (report) => report.surface),
      byRenderMode: summarizeBy(recent, (report) => report.renderMode),
    },
    recent,
    broadcastsRecent: socketRuntimeState.broadcastDiagnosticsRecent.slice(
      0,
      Math.max(1, Math.min(limit, MAX_BROADCAST_DIAGNOSTICS)),
    ),
  };
}

function getAuth(socket: Socket): ServerAuthContext | null {
  return (socket.data.auth as ServerAuthContext | undefined) ?? null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isShortString(value: unknown, maxLength = MAX_TEXT_LENGTH): value is string {
  return typeof value === 'string' && value.length <= maxLength;
}

// bible PMT 전체 절 목록 필드 검증 — 둘 다 없으면 통과(선택 필드), 있으면 형식·상한 확인
const MAX_PROMPT_VERSES = 300;
function isValidPromptVerses(payload: Record<string, unknown>): boolean {
  if (payload.promptVerses === undefined && payload.promptCurrentIndex === undefined) return true;
  return (
    Array.isArray(payload.promptVerses) &&
    payload.promptVerses.length <= MAX_PROMPT_VERSES &&
    payload.promptVerses.every((v) => isShortString(v)) &&
    typeof payload.promptCurrentIndex === 'number' &&
    Number.isInteger(payload.promptCurrentIndex) &&
    payload.promptCurrentIndex >= 0 &&
    payload.promptCurrentIndex < payload.promptVerses.length
  );
}

function isFiniteLatencyNumber(value: unknown, max = 600_000): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= -5_000 && value <= max;
}

function isOptionalLatencyNumber(value: unknown, max = 600_000): boolean {
  return value === undefined || isFiniteLatencyNumber(value, max);
}

function isFiniteTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 9_999_999_999_999;
}

function isValidLatencyReport(value: unknown): value is LatencyReportPayload {
  if (!isRecord(value) || !hasJsonSizeAtMost(value, 32 * 1024)) return false;
  if (!isShortString(value.localId, 256)) return false;
  if (value.surface !== 'output' && value.surface !== 'prompt' && value.surface !== 'broadcast') return false;
  if (!isShortString(value.traceId, 256)) return false;
  if (!isShortString(value.messageType, 64)) return false;
  if (!isShortString(value.renderMode, 64)) return false;
  if (!isShortString(value.targetSummary, 128)) return false;
  if (!isShortString(value.measuredAt, 64)) return false;
  if (!isFiniteTimestamp(value.sentAt) || !isFiniteTimestamp(value.receivedAt)) return false;

  return (
    (value.paintedAt === undefined || isFiniteTimestamp(value.paintedAt)) &&
    isOptionalLatencyNumber(value.totalMs) &&
    isOptionalLatencyNumber(value.controlPrepMs) &&
    isOptionalLatencyNumber(value.relayMs) &&
    isOptionalLatencyNumber(value.outputWaitMs) &&
    isOptionalLatencyNumber(value.renderMs) &&
    isOptionalLatencyNumber(value.elementCount, 10_000) &&
    isOptionalLatencyNumber(value.frameBytes, 32 * 1024 * 1024) &&
    (value.sectionId === undefined || isShortString(value.sectionId, 512)) &&
    isOptionalLatencyNumber(value.textLength, MAX_TEXT_LENGTH) &&
    (value.cachePhase === undefined || isShortString(value.cachePhase, 128)) &&
    (value.cacheDecision === undefined || isShortString(value.cacheDecision, 128)) &&
    (value.cacheReason === undefined || isShortString(value.cacheReason, 256)) &&
    (value.cacheKeyDigest === undefined || isShortString(value.cacheKeyDigest, 64)) &&
    isOptionalLatencyNumber(value.cacheAgeMs, 60 * 60 * 1000) &&
    isOptionalLatencyNumber(value.fixedLayerCount, 10_000) &&
    isOptionalLatencyNumber(value.ownElementCount, 10_000) &&
    isOptionalLatencyNumber(value.outputElementCount, 10_000) &&
    (value.hasOutputRouting === undefined || typeof value.hasOutputRouting === 'boolean') &&
    (value.hasOutputVideo === undefined || typeof value.hasOutputVideo === 'boolean') &&
    (value.outputOnlyFrame === undefined || typeof value.outputOnlyFrame === 'boolean') &&
    isOptionalLatencyNumber(value.transitionMs) &&
    isOptionalLatencyNumber(value.prePaintWaitMs) &&
    (value.paintPath === undefined || isShortString(value.paintPath, 64)) &&
    (value.paintBasePath === undefined || isShortString(value.paintBasePath, 64)) &&
    (value.paintOpaque === undefined || typeof value.paintOpaque === 'boolean') &&
    (value.paintHadReadableCamera === undefined || typeof value.paintHadReadableCamera === 'boolean') &&
    isOptionalLatencyNumber(value.paintActivateMs) &&
    isOptionalLatencyNumber(value.paintBaseMs) &&
    isOptionalLatencyNumber(value.paintFrameMs) &&
    isOptionalLatencyNumber(value.paintOverlayClearMs) &&
    isOptionalLatencyNumber(value.paintMaskClearMs) &&
    isOptionalLatencyNumber(value.paintTotalMs) &&
    isOptionalLatencyNumber(value.renderLoopBaseMs) &&
    isOptionalLatencyNumber(value.renderLoopLowerMs) &&
    isOptionalLatencyNumber(value.renderLoopSubtitleMs) &&
    isOptionalLatencyNumber(value.renderLoopOverlayMs) &&
    isOptionalLatencyNumber(value.renderLoopMaskMs) &&
    isOptionalLatencyNumber(value.renderLoopTotalMs) &&
    (value.renderLoopUseStaticCache === undefined || typeof value.renderLoopUseStaticCache === 'boolean') &&
    (value.renderLoopHasPreFrame === undefined || typeof value.renderLoopHasPreFrame === 'boolean') &&
    (value.renderLoopPreFrameCoversBase === undefined || typeof value.renderLoopPreFrameCoversBase === 'boolean') &&
    (value.renderLoopContinue === undefined || typeof value.renderLoopContinue === 'boolean')
  );
}

function storeLatencyReport(socket: Socket, report: LatencyReportPayload): void {
  socketRuntimeState.latencyReports++;
  socketRuntimeState.latencyReportsRecent.unshift({
    ...report,
    serverStoredAt: new Date().toISOString(),
    socketId: socket.id,
  });
  socketRuntimeState.latencyReportsRecent.length = Math.min(
    socketRuntimeState.latencyReportsRecent.length,
    MAX_LATENCY_REPORTS,
  );
}

function getFrameBytesForBroadcast(msg: SocketMessage): number | undefined {
  if (msg.type !== 'FRAME_UPDATE' && msg.type !== 'FRAME_CACHE') return undefined;
  return Buffer.byteLength(msg.payload.frame, 'utf-8');
}

function getSectionIdForBroadcast(msg: SocketMessage): string | undefined {
  if (msg.type === 'FRAME_CACHE' || msg.type === 'FRAME_SHOW') return msg.payload.sectionId;
  if (msg.type === 'VIDEO_COMMAND') return msg.payload.youtubeId;
  if (msg.type === 'CAMERA_SOURCE') return msg.payload.deviceId;
  return msg.trace?.sectionId;
}

function storeBroadcastDiagnostic(socket: Socket, msg: SocketMessage): void {
  if (msg.type === 'PING') return;

  const trace = msg.trace;
  socketRuntimeState.broadcastDiagnosticsRecent.unshift({
    serverSeenAt: new Date().toISOString(),
    socketId: socket.id,
    type: msg.type,
    targets: msg.targets && msg.targets.length > 0 ? msg.targets.join(',') : 'all',
    traceId: trace?.id,
    renderMode: trace?.renderMode,
    sectionId: getSectionIdForBroadcast(msg),
    elementCount: msg.type === 'ELEMENTS_UPDATE' ? msg.payload.elements.length : trace?.elementCount,
    frameBytes: getFrameBytesForBroadcast(msg) ?? trace?.frameBytes,
    textLength: msg.type === 'ELEMENTS_UPDATE'
      ? msg.payload.sectionText.length
      : msg.type === 'FRAME_UPDATE' || msg.type === 'FRAME_SHOW'
        ? msg.payload.sectionText.length
        : trace?.textLength,
    cachePhase: trace?.cachePhase,
    cacheDecision: trace?.cacheDecision,
    cacheReason: trace?.cacheReason,
    cacheKeyDigest: trace?.cacheKeyDigest,
    cacheAgeMs: trace?.cacheAgeMs,
    fixedLayerCount: trace?.fixedLayerCount,
    ownElementCount: trace?.ownElementCount,
    outputElementCount: trace?.outputElementCount,
    hasOutputRouting: trace?.hasOutputRouting,
    hasOutputVideo: trace?.hasOutputVideo,
    outputOnlyFrame: trace?.outputOnlyFrame,
  });
  socketRuntimeState.broadcastDiagnosticsRecent.length = Math.min(
    socketRuntimeState.broadcastDiagnosticsRecent.length,
    MAX_BROADCAST_DIAGNOSTICS,
  );
}

function summarizeBy(
  reports: StoredLatencyReport[],
  getKey: (report: StoredLatencyReport) => string,
): Record<string, LatencyReportSummary> {
  const groups = new Map<string, StoredLatencyReport[]>();
  for (const report of reports) {
    const key = getKey(report);
    const group = groups.get(key) ?? [];
    group.push(report);
    groups.set(key, group);
  }

  return Object.fromEntries(
    [...groups.entries()].map(([key, group]) => [key, summarizeLatencyReports(group)])
  );
}

function summarizeLatencyReports(reports: StoredLatencyReport[]): LatencyReportSummary {
  return {
    count: reports.length,
    total: summarizeMetric(reports, 'totalMs'),
    control: summarizeMetric(reports, 'controlPrepMs'),
    network: summarizeMetric(reports, 'outputWaitMs'),
    render: summarizeMetric(reports, 'renderMs'),
    relay: summarizeMetric(reports, 'relayMs'),
  };
}

function summarizeMetric(
  reports: StoredLatencyReport[],
  key: 'totalMs' | 'controlPrepMs' | 'outputWaitMs' | 'renderMs' | 'relayMs',
): LatencyMetricStats {
  const values = reports
    .map((report) => report[key])
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));

  if (values.length === 0) {
    return { count: 0, minMs: null, maxMs: null, avgMs: null, latestMs: null };
  }

  const sum = values.reduce((acc, value) => acc + value, 0);
  return {
    count: values.length,
    minMs: Math.round(Math.min(...values)),
    maxMs: Math.round(Math.max(...values)),
    avgMs: Math.round(sum / values.length),
    latestMs: Math.round(values[0]),
  };
}

function hasJsonSizeAtMost(value: unknown, maxBytes: number): boolean {
  try {
    return Buffer.byteLength(JSON.stringify(value), 'utf-8') <= maxBytes;
  } catch {
    return false;
  }
}

function isValidSocketMessage(value: unknown): value is SocketMessage {
  if (!isRecord(value) || !isShortString(value.type, 64) || !SOCKET_MESSAGE_TYPES.has(value.type)) {
    return false;
  }
  if (!hasJsonSizeAtMost(value, MAX_SOCKET_MESSAGE_BYTES)) return false;
  if (
    'targets' in value &&
    value.targets !== undefined &&
    (
      !Array.isArray(value.targets) ||
      value.targets.length > MAX_SOCKET_TARGETS ||
      value.targets.some((target) => typeof target !== 'string' || !SOCKET_MESSAGE_TARGETS.has(target))
    )
  ) {
    return false;
  }

  switch (value.type) {
    case 'PING':
    case 'PONG':
    case 'CLEAR_TEXT':
      return true;
    case 'BLACKOUT':
      return isRecord(value.payload) && typeof value.payload.active === 'boolean';
    case 'CAMERA_SOURCE':
      return isRecord(value.payload) && isShortString(value.payload.deviceId, 512);
    case 'VIDEO_COMMAND':
      return (
        isRecord(value.payload) &&
        isShortString(value.payload.youtubeId, 128) &&
        isShortString(value.payload.command, 64) &&
        (!('args' in value.payload) || Array.isArray(value.payload.args))
      );
    case 'SUBTITLE_UPDATE':
      return (
        isRecord(value.payload) &&
        isShortString(value.payload.text) &&
        isRecord(value.payload.style) &&
        isValidPromptVerses(value.payload) &&
        (value.payload.scripturePassage === undefined || isShortString(value.payload.scripturePassage, 256))
      );
    case 'ELEMENTS_UPDATE':
      return (
        isRecord(value.payload) &&
        Array.isArray(value.payload.elements) &&
        value.payload.elements.length <= MAX_CANVAS_ELEMENTS &&
        isShortString(value.payload.sectionText) &&
        isValidPromptVerses(value.payload) &&
        (value.payload.scripturePassage === undefined || isShortString(value.payload.scripturePassage, 256))
      );
    case 'FRAME_UPDATE':
      return (
        isRecord(value.payload) &&
        isShortString(value.payload.frame, MAX_SOCKET_MESSAGE_BYTES) &&
        isShortString(value.payload.sectionText) &&
        typeof value.payload.hasMotion === 'boolean'
      );
    case 'FRAME_CACHE':
      return (
        isRecord(value.payload) &&
        isShortString(value.payload.sectionId, 256) &&
        isShortString(value.payload.frame, MAX_SOCKET_MESSAGE_BYTES)
      );
    case 'FRAME_SHOW':
      return (
        isRecord(value.payload) &&
        isShortString(value.payload.sectionId, 256) &&
        isShortString(value.payload.sectionText) &&
        typeof value.payload.hasMotion === 'boolean'
      );
    default:
      return false;
  }
}

function isValidSocketId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= MAX_SOCKET_ID_LENGTH &&
    SOCKET_ID_PATTERN.test(value)
  );
}

function isValidWebRTCSignal(value: unknown): value is WebRTCSignal {
  if (!isRecord(value) || !hasJsonSizeAtMost(value, MAX_WEBRTC_SIGNAL_BYTES)) return false;
  if (value.kind !== 'offer' && value.kind !== 'answer' && value.kind !== 'ice') return false;
  if (!isValidSocketId(value.to)) return false;

  if (value.kind === 'offer' || value.kind === 'answer') {
    return isRecord(value.sdp) && isShortString(value.sdp.sdp, MAX_WEBRTC_SIGNAL_BYTES);
  }

  return isRecord(value.candidate);
}

function canRouteBroadcastSignal(socket: Socket): boolean {
  return socket.rooms.has(SOCKET_ROOMS.OUTPUT) || socket.rooms.has(SOCKET_ROOMS.VIEWER);
}

function canRouteCameraSignal(socket: Socket): boolean {
  return socket.rooms.has(SOCKET_ROOMS.CAMERAS_SOURCE) || socket.rooms.has(SOCKET_ROOMS.CAMERAS_VIEWER);
}

function rejectSocketEvent(socket: Socket, reason: string): void {
  socketRuntimeState.rejectedEvents++;
  const count = typeof socket.data.securityRejects === 'number'
    ? socket.data.securityRejects + 1
    : 1;
  socket.data.securityRejects = count;
  console.warn(`[socket] rejected ${reason} from ${socket.id}`);

  if (count >= 5) {
    socket.disconnect(true);
  }
}

function getHandshakeToken(socket: Socket): string | null {
  const authToken = socket.handshake.auth?.deviceToken;
  if (typeof authToken === 'string' && authToken.trim()) return authToken;

  const headerToken = socket.handshake.headers['x-device-token'];
  if (typeof headerToken === 'string' && headerToken.trim()) return headerToken;
  if (Array.isArray(headerToken) && typeof headerToken[0] === 'string') return headerToken[0];
  return null;
}

function getHeaderHostname(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return null;
  try {
    return new URL(raw).hostname.toLowerCase();
  } catch {
    return raw.split(':')[0]?.toLowerCase() || null;
  }
}

function isLoopbackHost(hostname: string | null): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

function isLoopbackAddress(address: string | undefined): boolean {
  if (!address) return false;
  return (
    address === '::1' ||
    address === '127.0.0.1' ||
    address === '::ffff:127.0.0.1' ||
    address.startsWith('127.')
  );
}

function getLocalRuntimeSocketAuth(socket: Socket): ServerAuthContext | null {
  if (process.env.UNOLIVE_DISABLE_LOCAL_RUNTIME_SOCKET === '1') return null;
  if (process.env.NODE_ENV === 'production' && process.env.UNOLIVE_ALLOW_LOCAL_RUNTIME_SOCKET !== '1') {
    return null;
  }

  const originHost = getHeaderHostname(socket.handshake.headers.origin);
  const requestHost = getHeaderHostname(socket.handshake.headers.host);
  const remoteAddress = socket.handshake.address;
  if (!isLoopbackAddress(remoteAddress)) return null;
  if (!isLoopbackHost(requestHost)) return null;
  if (originHost && !isLoopbackHost(originHost)) return null;

  return {
    kind: 'device',
    userId: 'local-runtime-socket',
    churchId: null,
    role: 'crew',
    deviceType: 'server',
  };
}

function canJoinRoom(auth: ServerAuthContext, room: string): boolean {
  if (auth.kind === 'dev') return true;

  const passiveRooms: string[] = [
    SOCKET_ROOMS.VIEWER,
    SOCKET_ROOMS.CAMERAS_VIEWER,
  ];
  if (passiveRooms.includes(room)) {
    return true;
  }

  const controlRooms: string[] = [
    SOCKET_ROOMS.COMPOSER,
    SOCKET_ROOMS.OUTPUT,
    SOCKET_ROOMS.CAMERAS_SOURCE,
  ];
  if (!controlRooms.includes(room)) return false;

  // A verified device token is the runtime capability for local show control.
  if (auth.kind === 'device') {
    if (auth.deviceType === 'server') return true;
    if (auth.deviceType === 'composer') return room === SOCKET_ROOMS.COMPOSER;
    return false;
  }

  return hasMinRole(auth, 'crew');
}

function canBroadcast(socket: Socket): boolean {
  const auth = getAuth(socket);
  if (!auth) return false;
  if (auth.kind === 'dev') return true;
  if (auth.kind === 'device' && (auth.deviceType === 'server' || auth.deviceType === 'composer')) {
    return socket.rooms.has(SOCKET_ROOMS.COMPOSER);
  }
  if (!hasMinRole(auth, 'crew')) return false;
  return socket.rooms.has(SOCKET_ROOMS.COMPOSER);
}

function canPong(socket: Socket): boolean {
  const auth = getAuth(socket);
  if (!auth) return false;
  if (auth.kind === 'dev') return true;
  if (auth.kind === 'device' && auth.deviceType === 'server') {
    return socket.rooms.has(SOCKET_ROOMS.OUTPUT);
  }
  if (!hasMinRole(auth, 'crew')) return false;
  return socket.rooms.has(SOCKET_ROOMS.OUTPUT);
}

export function setupSocketServer(io: SocketIOServer): void {
  io.use(async (socket, next) => {
    // 비동기 인증 중 예외가 unhandledRejection으로 새지 않도록 전체를 감싼다
    try {
      // [FIELD MODE]
      // 현장 복사본에서는 Socket.io handshake 도 Supabase 세션 확인 전에
      // dev 권한으로 바로 통과시킨다. 브라우저 쿠키가 남아 있으면 Supabase
      // refresh 요청이 먼저 실행되어 오프라인 현장에서 unauthorized/지연이 날 수 있다.
      const devAuth = getSocketDevAuth();
      if (devAuth) {
        socket.data.auth = devAuth;
        return next();
      }

      const token = getHandshakeToken(socket);

      if (token) {
        const auth = await verifyDeviceToken(token);
        if (auth) {
          socket.data.auth = auth;
          return next();
        }
      }

      const sessionAuth = await getAuthFromCookieHeader(socket.handshake.headers.cookie);
      if (sessionAuth) {
        socket.data.auth = sessionAuth;
        return next();
      }

      const localRuntimeAuth = getLocalRuntimeSocketAuth(socket);
      if (localRuntimeAuth) {
        socket.data.auth = localRuntimeAuth;
        return next();
      }

      next(new Error('unauthorized'));
    } catch (err) {
      console.error('[socket] handshake 인증 예외:', err);
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket: Socket) => {
    socketRuntimeState.activeSockets++;
    socketRuntimeState.connectedTotal++;
    refreshRoomCounts(io);

    // ── 룸 참가 ─────────────────────────────────────────────────────────────
    socket.on(SOCKET_EVENTS.JOIN_ROOM, (room: string) => {
      const auth = getAuth(socket);
      if (!auth) {
        socket.emit(SOCKET_EVENTS.JOIN_ROOM_RESULT, { room, ok: false, reason: 'unauthenticated' });
        return;
      }
      if (!canJoinRoom(auth, room)) {
        socket.emit(SOCKET_EVENTS.JOIN_ROOM_RESULT, {
          room,
          ok: false,
          reason: `forbidden:${auth.role}`,
        });
        return;
      }

      // 유효한 룸만 허용 (COMPOSER · OUTPUT · VIEWER)
      const allowedRooms: string[] = [
        SOCKET_ROOMS.COMPOSER,
        SOCKET_ROOMS.OUTPUT,
        SOCKET_ROOMS.VIEWER,
        SOCKET_ROOMS.CAMERAS_SOURCE,
        SOCKET_ROOMS.CAMERAS_VIEWER,
      ];
      if (!allowedRooms.includes(room)) {
        socket.emit(SOCKET_EVENTS.JOIN_ROOM_RESULT, { room, ok: false, reason: 'invalid-room' });
        return;
      }

      socket.join(room);
      refreshRoomCounts(io);
      socket.emit(SOCKET_EVENTS.JOIN_ROOM_RESULT, { room, ok: true });

      // Composer ↔ Output 페어링에만 PEER_JOINED 를 방출한다.
      // VIEWER 는 수동적 리스너이므로 상대방에게 존재를 알리지 않아
      // 기존 Composer↔Output 하트비트(PING/PONG)가 흐트러지지 않도록 한다.
      if (room === SOCKET_ROOMS.COMPOSER) {
        socket.to(SOCKET_ROOMS.OUTPUT).emit(SOCKET_EVENTS.PEER_JOINED, { room });
      } else if (room === SOCKET_ROOMS.OUTPUT) {
        socket.to(SOCKET_ROOMS.COMPOSER).emit(SOCKET_EVENTS.PEER_JOINED, { room });
        // [FEATURE: STATE_REPLAY] 늦게 합류한 출력창에 현재 상태 즉시 복원
        replayLastStateTo(socket);
      }
    });

    // ── Composer → Output + Viewer 브로드캐스트 릴레이 ───────────────────────
    // OUTPUT 은 최종 라이브 캔버스(PC2),
    // VIEWER 는 /media/broadcast 대시보드 미러 창(다중 접속 가능).
    socket.on(SOCKET_EVENTS.BROADCAST, (msg: SocketMessage) => {
      if (!canBroadcast(socket)) {
        rejectSocketEvent(socket, 'broadcast:forbidden');
        return;
      }
      if (!isValidSocketMessage(msg)) {
        rejectSocketEvent(socket, 'broadcast:invalid-payload');
        return;
      }
      socketRuntimeState.broadcastMessages++;
      const tracedMsg = attachServerTrace(msg);
      storeBroadcastDiagnostic(socket, tracedMsg);
      captureReplayState(tracedMsg); // [FEATURE: STATE_REPLAY]
      socket.to(SOCKET_ROOMS.OUTPUT).emit(SOCKET_EVENTS.BROADCAST, tracedMsg);
      socket.to(SOCKET_ROOMS.VIEWER).emit(SOCKET_EVENTS.BROADCAST, tracedMsg);
    });

    // ── Output → Composer PONG 릴레이 ────────────────────────────────────────
    socket.on(SOCKET_EVENTS.PONG, () => {
      if (!canPong(socket)) return;
      socket.to(SOCKET_ROOMS.COMPOSER).emit(SOCKET_EVENTS.PONG);
    });

    socket.on(SOCKET_EVENTS.LATENCY_REPORT, (report: unknown) => {
      if (!canPong(socket)) {
        rejectSocketEvent(socket, 'latency-report:forbidden');
        return;
      }
      if (!isValidLatencyReport(report)) {
        socketRuntimeState.latencyReportsRejected++;
        rejectSocketEvent(socket, 'latency-report:invalid-payload');
        return;
      }
      storeLatencyReport(socket, report);
    });

    // ─── WebRTC 시그널링 [FEATURE: BROADCAST_VIEWER / WEBRTC] ────────────────

    // Viewer 합류 → OUTPUT 룸 전체에 공지 (viewerSocketId 는 서버가 injection)
    socket.on(SOCKET_EVENTS.VIEWER_JOIN, () => {
      const auth = getAuth(socket);
      if (!auth || !socket.rooms.has(SOCKET_ROOMS.VIEWER)) {
        rejectSocketEvent(socket, 'viewer-join:forbidden');
        return;
      }

      socket.to(SOCKET_ROOMS.OUTPUT).emit(SOCKET_EVENTS.VIEWER_JOIN, {
        viewerSocketId: socket.id,
      });
    });

    // Output 준비 완료 → VIEWER 룸에 공지 (뷰어는 JOIN 재발송)
    socket.on(SOCKET_EVENTS.OUTPUT_READY, () => {
      if (!canPong(socket)) return;
      socket.to(SOCKET_ROOMS.VIEWER).emit(SOCKET_EVENTS.OUTPUT_READY);
    });

    // SDP / ICE 시그널 1:1 라우팅 — 서버가 from 을 권위 있게 덮어씀
    socket.on(SOCKET_EVENTS.WEBRTC_SIGNAL, (signal: WebRTCSignal) => {
      const auth = getAuth(socket);
      if (!auth || !canRouteBroadcastSignal(socket)) {
        rejectSocketEvent(socket, 'webrtc-signal:forbidden');
        return;
      }
      if (!isValidWebRTCSignal(signal)) {
        rejectSocketEvent(socket, 'webrtc-signal:invalid-payload');
        return;
      }
      socketRuntimeState.webrtcSignals++;
      const forwarded: WebRTCSignal = { ...signal, from: socket.id };
      io.to(signal.to).emit(SOCKET_EVENTS.WEBRTC_SIGNAL, forwarded);
    });

    // ─── [FEATURE: CAMERAS_RELAY] 서버 카메라 릴레이 시그널링 ──────────────
    //     /output 과 동일 패턴이지만 별도 이벤트·룸 사용하여 독립 운영
    socket.on(SOCKET_EVENTS.CAMERAS_VIEWER_JOIN, () => {
      const auth = getAuth(socket);
      if (!auth || !socket.rooms.has(SOCKET_ROOMS.CAMERAS_VIEWER)) {
        rejectSocketEvent(socket, 'cameras-viewer-join:forbidden');
        return;
      }

      socket.to(SOCKET_ROOMS.CAMERAS_SOURCE).emit(SOCKET_EVENTS.CAMERAS_VIEWER_JOIN, {
        viewerSocketId: socket.id,
      });
    });

    socket.on(SOCKET_EVENTS.CAMERAS_READY, () => {
      const auth = getAuth(socket);
      if (!auth || !socket.rooms.has(SOCKET_ROOMS.CAMERAS_SOURCE)) return;
      if (auth.kind !== 'device' && !hasMinRole(auth, 'crew')) return;

      socket.to(SOCKET_ROOMS.CAMERAS_VIEWER).emit(SOCKET_EVENTS.CAMERAS_READY);
    });

    socket.on(SOCKET_EVENTS.CAMERAS_WEBRTC_SIGNAL, (signal: WebRTCSignal) => {
      const auth = getAuth(socket);
      if (!auth || !canRouteCameraSignal(socket)) {
        rejectSocketEvent(socket, 'cameras-webrtc-signal:forbidden');
        return;
      }
      if (!isValidWebRTCSignal(signal)) {
        rejectSocketEvent(socket, 'cameras-webrtc-signal:invalid-payload');
        return;
      }
      socketRuntimeState.webrtcSignals++;
      const forwarded: WebRTCSignal = { ...signal, from: socket.id };
      io.to(signal.to).emit(SOCKET_EVENTS.CAMERAS_WEBRTC_SIGNAL, forwarded);
    });

    // ── 연결 해제 알림 ────────────────────────────────────────────────────────
    socket.on('disconnecting', () => {
      for (const room of socket.rooms) {
        if (room === socket.id) continue; // 기본 룸 제외
        if (room === SOCKET_ROOMS.COMPOSER) {
          socket.to(SOCKET_ROOMS.OUTPUT).emit(SOCKET_EVENTS.PEER_LEFT, { room });
        } else if (room === SOCKET_ROOMS.OUTPUT) {
          socket.to(SOCKET_ROOMS.COMPOSER).emit(SOCKET_EVENTS.PEER_LEFT, { room });
        } else if (room === SOCKET_ROOMS.VIEWER) {
          // Viewer 이탈 → Output 이 peer connection 을 정리하도록 통지
          socket.to(SOCKET_ROOMS.OUTPUT).emit(SOCKET_EVENTS.VIEWER_LEAVE, {
            viewerSocketId: socket.id,
          });
        } else if (room === SOCKET_ROOMS.CAMERAS_VIEWER) {
          // Cameras viewer 이탈
          socket.to(SOCKET_ROOMS.CAMERAS_SOURCE).emit(SOCKET_EVENTS.CAMERAS_VIEWER_LEAVE, {
            viewerSocketId: socket.id,
          });
        }
      }
    });

    socket.on('disconnect', () => {
      socketRuntimeState.activeSockets = Math.max(0, socketRuntimeState.activeSockets - 1);
      socketRuntimeState.disconnectedTotal++;
      refreshRoomCounts(io);
    });
  });
}
