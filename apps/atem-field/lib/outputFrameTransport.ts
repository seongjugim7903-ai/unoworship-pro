import { CanvasElement, isElementVisibleOn } from './canvasTypes';
import { renderElements, renderScreenMasks } from './canvasRenderer';
import { createSocketTrace } from './latencyDiagnostics';
import type { SocketMessage, SocketMessageTarget, SocketTraceMeta } from './socketEvents';

const OUTPUT_FRAME_WIDTH = 1920;
const OUTPUT_FRAME_HEIGHT = 1080;
const MAX_SHARED_OUTPUT_FRAME_CACHE_ENTRIES = 40;

export type SharedOutputFrameCacheEntry = {
  frame: string;
  text: string;
  bytes: number;
  cacheKey: string;
  cachedAt: number;
};

const SHARED_OUTPUT_FRAME_CACHE_GLOBAL_KEY = '__unoliveSharedOutputFrameCache';

type UnoLiveSharedOutputFrameCacheGlobal = typeof globalThis & {
  [SHARED_OUTPUT_FRAME_CACHE_GLOBAL_KEY]?: Map<string, SharedOutputFrameCacheEntry>;
};

const sharedOutputFrameCache =
  ((globalThis as UnoLiveSharedOutputFrameCacheGlobal)[SHARED_OUTPUT_FRAME_CACHE_GLOBAL_KEY] ??=
    new Map<string, SharedOutputFrameCacheEntry>());

function estimateDataUrlBytes(dataUrl: string): number {
  const commaIndex = dataUrl.indexOf(',');
  const payload = commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : dataUrl;
  return Math.ceil(payload.length * 0.75);
}

function trimSharedOutputFrameCache(): void {
  while (sharedOutputFrameCache.size > MAX_SHARED_OUTPUT_FRAME_CACHE_ENTRIES) {
    const oldestKey = sharedOutputFrameCache.keys().next().value;
    if (!oldestKey) return;
    sharedOutputFrameCache.delete(oldestKey);
  }
}

export function createOutputFrameCacheKey(
  sectionId: string,
  elements: CanvasElement[],
  sectionText: string,
): string {
  // 성능: base64 data URL 을 통째로 JSON.stringify 하면 매 송출마다 50~200ms CPU 스파이크가 난다.
  // 프레임에 영향을 주는 필드만 FNV 로 스트리밍 해싱하고, 대용량 data URL(이미지·마스크)은
  // 길이 + 앞뒤 지문만 섞어 O(1) 로 처리한다. 같은 콘텐츠 → 같은 키(캐시 일관), 서로 다른 콘텐츠 →
  // 서로 다른 키(64비트 결합 해시로 충돌 무시 가능).
  let h1 = 2166136261;
  let h2 = 2246822519;
  const mix = (s: string): void => {
    for (let i = 0; i < s.length; i += 1) {
      const c = s.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 16777619);
      h2 = Math.imul(h2 ^ c, 2654435761);
    }
    h1 = Math.imul(h1 ^ 0x9e, 16777619); // 필드 구분자
  };
  const mixValue = (k: string, s: string): void => {
    mix(k);
    if (s.length > 256 && s.startsWith('data:')) {
      mix('§');
      mix(String(s.length));
      mix(s.slice(0, 96));
      mix(s.slice(-96));
    } else {
      mix(s);
    }
  };

  mix(sectionId);
  mix(sectionText);
  for (const el of elements) {
    for (const k in el) {
      const v = (el as unknown as Record<string, unknown>)[k];
      if (v === undefined || v === null) continue;
      const t = typeof v;
      if (t === 'string') mixValue(k, v as string);
      else if (t === 'number' || t === 'boolean') {
        mix(k);
        mix(String(v));
      } else {
        mix(k);
        mix(JSON.stringify(v));
      }
    }
  }

  return `${sectionId}:${elements.length}:${(h1 >>> 0).toString(36)}:${(h2 >>> 0).toString(36)}`;
}

export function digestOutputFrameCacheKey(cacheKey: string): string {
  let hash = 2166136261;
  for (let i = 0; i < cacheKey.length; i += 1) {
    hash ^= cacheKey.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function withOutputCacheTrace(
  msg: SocketMessage,
  cacheInfo: Partial<Pick<
    SocketTraceMeta,
    | 'cachePhase'
    | 'cacheDecision'
    | 'cacheReason'
    | 'cacheKeyDigest'
    | 'cacheAgeMs'
    | 'fixedLayerCount'
    | 'ownElementCount'
    | 'outputElementCount'
    | 'hasOutputRouting'
    | 'hasOutputVideo'
    | 'outputOnlyFrame'
  >>,
): SocketMessage {
  const trace = msg.trace ?? createSocketTrace(msg);
  return trace ? ({ ...msg, trace: { ...trace, ...cacheInfo } } as SocketMessage) : msg;
}

export function setSharedOutputFrameCacheEntry({
  sectionId,
  frame,
  text,
  cacheKey,
}: {
  sectionId: string;
  frame: string;
  text: string;
  cacheKey: string;
}): void {
  sharedOutputFrameCache.delete(sectionId);
  sharedOutputFrameCache.set(sectionId, {
    frame,
    text,
    cacheKey,
    bytes: estimateDataUrlBytes(frame),
    cachedAt: Date.now(),
  });
  trimSharedOutputFrameCache();
}

export function getSharedOutputFrameCacheEntry(
  sectionId: string,
  cacheKey: string,
): SharedOutputFrameCacheEntry | undefined {
  const entry = sharedOutputFrameCache.get(sectionId);
  if (!entry || entry.cacheKey !== cacheKey) return undefined;
  return entry;
}

export function touchSharedOutputFrameCacheEntry(
  sectionId: string,
  entry: SharedOutputFrameCacheEntry,
): void {
  sharedOutputFrameCache.delete(sectionId);
  sharedOutputFrameCache.set(sectionId, { ...entry, cachedAt: Date.now() });
}

export function clearSharedOutputFrameCache(): void {
  sharedOutputFrameCache.clear();
}

export function targetsIncludeOutput(targets?: SocketMessageTarget[]): boolean {
  return !targets || targets.length === 0 || targets.includes('output');
}

export function withoutOutputTarget(targets?: SocketMessageTarget[]): SocketMessageTarget[] {
  if (!targets || targets.length === 0) return ['prompt', 'broadcast'];
  return targets.filter((target) => target !== 'output');
}

export function hasSocketTargets(targets?: SocketMessageTarget[]): boolean {
  return !targets || targets.length > 0;
}

export function hasOutputVisibleVideo(elements: CanvasElement[]): boolean {
  return elements.some((el) => (
    el.type === 'video' &&
    el.visible &&
    isElementVisibleOn(el, 'output')
  ));
}

export function canPrerenderOutputFrameForElements({
  elements,
  hasMotion,
  targets,
}: {
  elements: CanvasElement[];
  hasMotion: boolean;
  targets?: SocketMessageTarget[];
}): boolean {
  return (
    targetsIncludeOutput(targets) &&
    !hasMotion &&
    !hasOutputVisibleVideo(elements)
  );
}

export function renderOutputFrameDataUrl(
  elements: CanvasElement[],
  sectionText: string,
): string | null {
  const canvas = createRenderedOutputFrameCanvas(elements, sectionText);
  return canvas ? canvas.toDataURL('image/webp', 0.85) : null;
}

export function renderOutputFrameDataUrlAsync(
  elements: CanvasElement[],
  sectionText: string,
): Promise<string | null> {
  const canvas = createRenderedOutputFrameCanvas(elements, sectionText);
  if (!canvas) return Promise.resolve(null);

  return new Promise<string | null>((resolve) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        resolve(canvas.toDataURL('image/webp', 0.85));
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(canvas.toDataURL('image/webp', 0.85));
      reader.readAsDataURL(blob);
    }, 'image/webp', 0.85);
  });
}

function createRenderedOutputFrameCanvas(
  elements: CanvasElement[],
  sectionText: string,
): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;

  const canvas = document.createElement('canvas');
  canvas.width = OUTPUT_FRAME_WIDTH;
  canvas.height = OUTPUT_FRAME_HEIGHT;

  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  renderElements(ctx, elements, sectionText, OUTPUT_FRAME_WIDTH, OUTPUT_FRAME_HEIGHT, {
    target: 'output',
  });

  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = OUTPUT_FRAME_WIDTH;
  maskCanvas.height = OUTPUT_FRAME_HEIGHT;
  const maskCtx = maskCanvas.getContext('2d');
  if (maskCtx) {
    renderScreenMasks(maskCtx, elements, OUTPUT_FRAME_WIDTH, OUTPUT_FRAME_HEIGHT, 'output');
    ctx.drawImage(maskCanvas, 0, 0);
  }

  return canvas;
}
