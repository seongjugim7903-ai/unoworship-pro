import type {
  SocketMessage,
  SocketMessageTarget,
  SocketTraceMeta,
  SocketTraceRenderMode,
} from './socketEvents';

const LATENCY_STORAGE_KEY = 'unoliveLatencyDebug';
const MAX_LATENCY_EVENTS = 8;

let traceSeq = 0;

export interface LatencyDiagnosticEntry {
  localId: string;
  surface: SocketMessageTarget;
  traceId: string;
  messageType: string;
  renderMode: SocketTraceRenderMode;
  targetSummary: string;
  sentAt: number;
  serverReceivedAt?: number;
  serverForwardedAt?: number;
  receivedAt: number;
  receivedPerfAt: number;
  paintedAt?: number;
  paintedPerfAt?: number;
  totalMs?: number;
  relayMs?: number;
  outputWaitMs?: number;
  renderMs?: number;
  controlPrepMs?: number;
  elementCount?: number;
  frameBytes?: number;
  sectionId?: string;
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
  transitionMs?: number;
  prePaintWaitMs?: number;
  paintPath?: string;
  paintBasePath?: string;
  paintOpaque?: boolean;
  paintHadReadableCamera?: boolean;
  paintActivateMs?: number;
  paintBaseMs?: number;
  paintFrameMs?: number;
  paintOverlayClearMs?: number;
  paintMaskClearMs?: number;
  paintTotalMs?: number;
  renderLoopBaseMs?: number;
  renderLoopLowerMs?: number;
  renderLoopSubtitleMs?: number;
  renderLoopOverlayMs?: number;
  renderLoopMaskMs?: number;
  renderLoopTotalMs?: number;
  renderLoopUseStaticCache?: boolean;
  renderLoopHasPreFrame?: boolean;
  renderLoopPreFrameCoversBase?: boolean;
  renderLoopContinue?: boolean;
}

export interface LatencyReportPayload {
  localId: string;
  surface: SocketMessageTarget;
  traceId: string;
  messageType: string;
  renderMode: SocketTraceRenderMode;
  targetSummary: string;
  measuredAt: string;
  sentAt: number;
  receivedAt: number;
  paintedAt?: number;
  totalMs?: number;
  controlPrepMs?: number;
  relayMs?: number;
  outputWaitMs?: number;
  renderMs?: number;
  elementCount?: number;
  frameBytes?: number;
  sectionId?: string;
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
  transitionMs?: number;
  prePaintWaitMs?: number;
  paintPath?: string;
  paintBasePath?: string;
  paintOpaque?: boolean;
  paintHadReadableCamera?: boolean;
  paintActivateMs?: number;
  paintBaseMs?: number;
  paintFrameMs?: number;
  paintOverlayClearMs?: number;
  paintMaskClearMs?: number;
  paintTotalMs?: number;
  renderLoopBaseMs?: number;
  renderLoopLowerMs?: number;
  renderLoopSubtitleMs?: number;
  renderLoopOverlayMs?: number;
  renderLoopMaskMs?: number;
  renderLoopTotalMs?: number;
  renderLoopUseStaticCache?: boolean;
  renderLoopHasPreFrame?: boolean;
  renderLoopPreFrameCoversBase?: boolean;
  renderLoopContinue?: boolean;
}

export function isLatencyDebugEnabled(): boolean {
  if (typeof window === 'undefined') return false;

  const params = new URLSearchParams(window.location.search);
  const queryValue = params.get('debugLatency');

  if (queryValue === '1' || queryValue === 'true') {
    window.localStorage.setItem(LATENCY_STORAGE_KEY, '1');
    return true;
  }

  if (queryValue === '0' || queryValue === 'false') {
    window.localStorage.removeItem(LATENCY_STORAGE_KEY);
    return false;
  }

  return window.localStorage.getItem(LATENCY_STORAGE_KEY) === '1';
}

export function createSocketTrace(msg: SocketMessage): SocketTraceMeta | undefined {
  if (msg.type === 'PING' || msg.type === 'PONG') {
    return undefined;
  }

  const now = Date.now();
  const renderMode = getTraceRenderMode(msg);
  traceSeq += 1;

  return {
    id: `${now.toString(36)}-${traceSeq.toString(36)}`,
    source: 'composer',
    sentAt: now,
    messageType: msg.type,
    renderMode,
    targetSummary: summarizeTargets(msg.targets),
    ...summarizePayload(msg),
  };
}

export function attachServerTrace(msg: SocketMessage): SocketMessage {
  if (!msg.trace) return msg;

  const now = Date.now();
  return {
    ...msg,
    trace: {
      ...msg.trace,
      serverReceivedAt: msg.trace.serverReceivedAt ?? now,
      serverForwardedAt: now,
    },
  } as SocketMessage;
}

export function createLatencyEntry(
  msg: SocketMessage,
  surface: SocketMessageTarget,
): LatencyDiagnosticEntry | null {
  if (!msg.trace) return null;

  const receivedAt = Date.now();
  const receivedPerfAt = performance.now();
  const relayMs = msg.trace.serverForwardedAt && msg.trace.serverReceivedAt
    ? msg.trace.serverForwardedAt - msg.trace.serverReceivedAt
    : undefined;
  const outputWaitMs = msg.trace.serverForwardedAt
    ? receivedAt - msg.trace.serverForwardedAt
    : undefined;

  return {
    localId: `${surface}-${msg.trace.id}-${receivedPerfAt.toFixed(3)}`,
    surface,
    traceId: msg.trace.id,
    messageType: msg.trace.messageType,
    renderMode: msg.trace.renderMode,
    targetSummary: msg.trace.targetSummary,
    sentAt: msg.trace.sentAt,
    serverReceivedAt: msg.trace.serverReceivedAt,
    serverForwardedAt: msg.trace.serverForwardedAt,
    receivedAt,
    receivedPerfAt,
    relayMs,
    outputWaitMs,
    controlPrepMs: msg.trace.controlPrepMs,
    elementCount: msg.trace.elementCount,
    frameBytes: msg.trace.frameBytes,
    sectionId: msg.trace.sectionId,
    textLength: msg.trace.textLength,
    cachePhase: msg.trace.cachePhase,
    cacheDecision: msg.trace.cacheDecision,
    cacheReason: msg.trace.cacheReason,
    cacheKeyDigest: msg.trace.cacheKeyDigest,
    cacheAgeMs: msg.trace.cacheAgeMs,
    fixedLayerCount: msg.trace.fixedLayerCount,
    ownElementCount: msg.trace.ownElementCount,
    outputElementCount: msg.trace.outputElementCount,
    hasOutputRouting: msg.trace.hasOutputRouting,
    hasOutputVideo: msg.trace.hasOutputVideo,
    outputOnlyFrame: msg.trace.outputOnlyFrame,
  };
}

export function completeLatencyEntry(entry: LatencyDiagnosticEntry): LatencyDiagnosticEntry {
  const paintedAt = Date.now();
  const paintedPerfAt = performance.now();

  return {
    ...entry,
    paintedAt,
    paintedPerfAt,
    totalMs: paintedAt - entry.sentAt,
    renderMs: paintedPerfAt - entry.receivedPerfAt,
  };
}

export function upsertLatencyEntry(
  entries: LatencyDiagnosticEntry[],
  next: LatencyDiagnosticEntry,
): LatencyDiagnosticEntry[] {
  const filtered = entries.filter((entry) => entry.localId !== next.localId);
  return [next, ...filtered].slice(0, MAX_LATENCY_EVENTS);
}

export function formatLatencyMs(value: number | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '-';
  return `${Math.round(value)}ms`;
}

export function toLatencyReportPayload(entry: LatencyDiagnosticEntry): LatencyReportPayload {
  return {
    localId: entry.localId,
    surface: entry.surface,
    traceId: entry.traceId,
    messageType: entry.messageType,
    renderMode: entry.renderMode,
    targetSummary: entry.targetSummary,
    measuredAt: new Date(entry.paintedAt ?? entry.receivedAt).toISOString(),
    sentAt: entry.sentAt,
    receivedAt: entry.receivedAt,
    paintedAt: entry.paintedAt,
    totalMs: entry.totalMs,
    controlPrepMs: entry.controlPrepMs,
    relayMs: entry.relayMs,
    outputWaitMs: entry.outputWaitMs,
    renderMs: entry.renderMs,
    elementCount: entry.elementCount,
    frameBytes: entry.frameBytes,
    sectionId: entry.sectionId,
    textLength: entry.textLength,
    cachePhase: entry.cachePhase,
    cacheDecision: entry.cacheDecision,
    cacheReason: entry.cacheReason,
    cacheKeyDigest: entry.cacheKeyDigest,
    cacheAgeMs: entry.cacheAgeMs,
    fixedLayerCount: entry.fixedLayerCount,
    ownElementCount: entry.ownElementCount,
    outputElementCount: entry.outputElementCount,
    hasOutputRouting: entry.hasOutputRouting,
    hasOutputVideo: entry.hasOutputVideo,
    outputOnlyFrame: entry.outputOnlyFrame,
    transitionMs: entry.transitionMs,
    prePaintWaitMs: entry.prePaintWaitMs,
    paintPath: entry.paintPath,
    paintBasePath: entry.paintBasePath,
    paintOpaque: entry.paintOpaque,
    paintHadReadableCamera: entry.paintHadReadableCamera,
    paintActivateMs: entry.paintActivateMs,
    paintBaseMs: entry.paintBaseMs,
    paintFrameMs: entry.paintFrameMs,
    paintOverlayClearMs: entry.paintOverlayClearMs,
    paintMaskClearMs: entry.paintMaskClearMs,
    paintTotalMs: entry.paintTotalMs,
    renderLoopBaseMs: entry.renderLoopBaseMs,
    renderLoopLowerMs: entry.renderLoopLowerMs,
    renderLoopSubtitleMs: entry.renderLoopSubtitleMs,
    renderLoopOverlayMs: entry.renderLoopOverlayMs,
    renderLoopMaskMs: entry.renderLoopMaskMs,
    renderLoopTotalMs: entry.renderLoopTotalMs,
    renderLoopUseStaticCache: entry.renderLoopUseStaticCache,
    renderLoopHasPreFrame: entry.renderLoopHasPreFrame,
    renderLoopPreFrameCoversBase: entry.renderLoopPreFrameCoversBase,
    renderLoopContinue: entry.renderLoopContinue,
  };
}

function getTraceRenderMode(msg: SocketMessage): SocketTraceRenderMode {
  switch (msg.type) {
    case 'SUBTITLE_UPDATE':
      return 'subtitle';
    case 'ELEMENTS_UPDATE':
      return 'elements';
    case 'FRAME_UPDATE':
      return 'frame-update';
    case 'FRAME_SHOW':
      return 'frame-show';
    case 'VIDEO_COMMAND':
      return 'command';
    case 'BLACKOUT':
    case 'CLEAR_TEXT':
    case 'CAMERA_SOURCE':
      return 'control';
    case 'FRAME_CACHE':
      return 'frame-cache';
    default:
      return 'control';
  }
}

function summarizeTargets(targets: SocketMessage['targets']): string {
  return targets && targets.length > 0 ? targets.join(',') : 'all';
}

function summarizePayload(msg: SocketMessage): Partial<SocketTraceMeta> {
  switch (msg.type) {
    case 'SUBTITLE_UPDATE':
      return { textLength: msg.payload.text.length };
    case 'ELEMENTS_UPDATE':
      return {
        elementCount: msg.payload.elements.length,
        textLength: msg.payload.sectionText.length,
      };
    case 'FRAME_UPDATE':
      return {
        frameBytes: msg.payload.frame.length,
        textLength: msg.payload.sectionText.length,
      };
    case 'FRAME_SHOW':
    case 'FRAME_CACHE':
      return { sectionId: msg.payload.sectionId };
    case 'VIDEO_COMMAND':
      return { sectionId: msg.payload.youtubeId };
    case 'CAMERA_SOURCE':
      return { sectionId: msg.payload.deviceId };
    default:
      return {};
  }
}
