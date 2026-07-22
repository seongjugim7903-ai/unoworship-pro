/**
 * canvasRenderer.ts
 * CanvasElement[] → Canvas 2D 컴포지터 (출력 창 전용)
 */

import {
  CanvasElement,
  TextElement,
  ShapeElement,
  ImageElement,
  VideoElement,
  GradientConfig,
  CanvasRenderTarget,
  isElementVisibleOn,
  resolveCornerRadii,
} from './canvasTypes';
import { calcImageFillRect } from './imageProcessing/shapeFill';
import { getTextElementContent } from './sectionText';

// ─────────────────────────────────────────
// 이미지 캐시 — src(Base64/URL) → HTMLImageElement
// ─────────────────────────────────────────
const MAX_IMAGE_CACHE_ENTRIES = 120;
const imageCache = new Map<string, HTMLImageElement>();
const MAX_KEY_IMAGE_CACHE_ENTRIES = 80;
const keyImageCache = new Map<string, HTMLCanvasElement>();

function releaseImage(img: HTMLImageElement): void {
  img.onload = null;
  img.onerror = null;
  img.removeAttribute('src');
}

function trimImageCache(): void {
  while (imageCache.size > MAX_IMAGE_CACHE_ENTRIES) {
    const oldestKey = imageCache.keys().next().value;
    if (!oldestKey) return;
    const oldest = imageCache.get(oldestKey);
    if (oldest) releaseImage(oldest);
    imageCache.delete(oldestKey);
  }
}

function setCachedImage(src: string, img: HTMLImageElement): void {
  imageCache.delete(src);
  imageCache.set(src, img);
  trimImageCache();
}

function touchCachedImage(src: string, img: HTMLImageElement): void {
  imageCache.delete(src);
  imageCache.set(src, img);
}

function waitForCachedImage(img: HTMLImageElement): Promise<void> {
  if (img.complete) return Promise.resolve();

  return new Promise((resolve) => {
    const finish = () => {
      img.removeEventListener('load', finish);
      img.removeEventListener('error', finish);
      resolve();
    };

    img.addEventListener('load', finish, { once: true });
    img.addEventListener('error', finish, { once: true });
  });
}

function trimKeyImageCache(): void {
  while (keyImageCache.size > MAX_KEY_IMAGE_CACHE_ENTRIES) {
    const oldestKey = keyImageCache.keys().next().value;
    if (!oldestKey) return;
    keyImageCache.delete(oldestKey);
  }
}

function getKeyImageCache(src: string): HTMLCanvasElement | null {
  const cached = keyImageCache.get(src);
  if (!cached) return null;
  keyImageCache.delete(src);
  keyImageCache.set(src, cached);
  return cached;
}

function setKeyImageCache(src: string, canvas: HTMLCanvasElement): void {
  keyImageCache.delete(src);
  keyImageCache.set(src, canvas);
  trimKeyImageCache();
}

/** 이미지 로드 (캐시 + 비동기 프리로드) */
function getCachedImage(src: string): HTMLImageElement | null {
  const cached = imageCache.get(src);
  if (cached && cached.complete && cached.naturalWidth > 0) {
    touchCachedImage(src, cached);
    return cached;
  }

  if (!cached) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = src;
    setCachedImage(src, img);
  }
  return null; // 아직 로딩 중 — 다음 프레임에 그려짐
}

/**
 * [FEATURE: IMAGE_PRELOAD] 이미지 배열을 캐시에 등록 (출력 모니터에서 미리 수신)
 * IMAGE_PRELOAD 소켓 메시지 수신 시 호출
 */
export function preloadImageSrcs(images: { id: string; src: string }[]): Promise<number> {
  let newlyLoaded = 0;
  const uniqueSrcs = [...new Set(images.map(({ src }) => src).filter(Boolean))];
  const promises = uniqueSrcs.map((src) => {
    const cached = imageCache.get(src);
    if (cached && cached.complete && cached.naturalWidth > 0) {
      touchCachedImage(src, cached);
      return Promise.resolve();
    }
    if (cached) return waitForCachedImage(cached);

    return new Promise<void>((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => { newlyLoaded++; resolve(); };
      img.onerror = () => resolve();
      img.src = src;
      setCachedImage(src, img);
    });
  });

  return Promise.all(promises).then(() => newlyLoaded);
}

/**
 * 이미지 요소들의 src 를 프리로드하고, 새로 로드된 개수를 반환
 * SectionCard 축소판에서 이미지 로드 완료 후 다시 그리기 위해 사용
 */
export function preloadImages(elements: CanvasElement[]): Promise<number> {
  // 이미지 요소 src + 도형 imageFill src 모두 수집
  const imageSrcs: string[] = [];
  for (const el of elements) {
    if (!el.visible) continue;
    if (el.type === 'image') imageSrcs.push(el.src);
    if (el.type === 'shape' && el.imageFill?.src) imageSrcs.push(el.imageFill.src);
    if (el.type === 'video' && el.thumbnailUrl) imageSrcs.push(el.thumbnailUrl);
  }

  if (imageSrcs.length === 0) return Promise.resolve(0);

  let newlyLoaded = 0;
  const uniqueSrcs = [...new Set(imageSrcs)];
  const promises = uniqueSrcs.map((src) => {
    const cached = imageCache.get(src);
    if (cached && cached.complete && cached.naturalWidth > 0) {
      touchCachedImage(src, cached);
      return Promise.resolve();
    }
    if (cached) return waitForCachedImage(cached);

    return new Promise<void>((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => { newlyLoaded++; resolve(); };
      img.onerror = () => resolve();
      img.src = src;
      setCachedImage(src, img);
    });
  });

  return Promise.all(promises).then(() => newlyLoaded);
}

/**
 * 이미지 캐시 통계 반환 (디버깅용)
 */
export function getImageCacheStats(): { total: number; loaded: number; maxEntries: number } {
  let loaded = 0;
  imageCache.forEach((img) => {
    if (img.complete && img.naturalWidth > 0) loaded++;
  });
  return { total: imageCache.size, loaded, maxEntries: MAX_IMAGE_CACHE_ENTRIES };
}

export function clearImageCache(): void {
  imageCache.forEach(releaseImage);
  imageCache.clear();
}

// ─────────────────────────────────────────
// 오프스크린 캔버스 (지우개 마스크 합성용)
// ─────────────────────────────────────────
let _offscreenCanvas: HTMLCanvasElement | null = null;

function getOffscreenCanvas(w: number, h: number): HTMLCanvasElement {
  if (!_offscreenCanvas || _offscreenCanvas.width !== w || _offscreenCanvas.height !== h) {
    _offscreenCanvas = document.createElement('canvas');
    _offscreenCanvas.width = w;
    _offscreenCanvas.height = h;
  }
  return _offscreenCanvas;
}

// 클리핑 마스크 전용 오프스크린 캔버스
let _clipMaskCanvas: HTMLCanvasElement | null = null;

function getClipMaskCanvas(w: number, h: number): HTMLCanvasElement {
  if (!_clipMaskCanvas || _clipMaskCanvas.width !== w || _clipMaskCanvas.height !== h) {
    _clipMaskCanvas = document.createElement('canvas');
    _clipMaskCanvas.width = w;
    _clipMaskCanvas.height = h;
  }
  return _clipMaskCanvas;
}

// ─────────────────────────────────────────
// 진입점
// ─────────────────────────────────────────
export interface RenderElementsOptions {
  /** z-index 필터: 'below' = video 미만만, 'above' = video 초과만, undefined = 전부 */
  mode?: 'below' | 'above';
  videoZIndex?: number;
  /** 출력 대상 필터. 없으면 기존처럼 모든 요소 렌더 */
  target?: CanvasRenderTarget;
  /** true면 스크린 마스크 요소도 렌더한다. 일반 렌더에서는 항상 제외한다. */
  includeScreenMasks?: boolean;
  /** ATEM Linear Key용 흑백 키 매트 렌더링. 이미지 drawImage에 흰색 실루엣 필터를 적용한다. */
  atemKeyMode?: boolean;
}

export function isScreenMaskElement(el: CanvasElement): boolean {
  return el.layerRole === 'mask';
}

export function isElementForcedAboveVideo(el: CanvasElement): boolean {
  if (!el.fixedLayer) return false;
  return (
    el.layerRole !== 'background' &&
    el.layerRole !== 'live-video' &&
    el.layerRole !== 'mask'
  );
}

export function getScreenMaskElements(
  elements: CanvasElement[],
  target?: CanvasRenderTarget,
): CanvasElement[] {
  return elements.filter((el) => (
    el.visible &&
    isScreenMaskElement(el) &&
    isElementVisibleOn(el, target)
  ));
}

export function renderScreenMasks(
  ctx: CanvasRenderingContext2D,
  elements: CanvasElement[],
  canvasWidth: number,
  canvasHeight: number,
  target?: CanvasRenderTarget,
): void {
  const maskElements = getScreenMaskElements(elements, target);
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);
  if (maskElements.length === 0) return;

  renderElements(ctx, maskElements, '', canvasWidth, canvasHeight, {
    target,
    includeScreenMasks: true,
  });
}

export function renderElements(
  ctx: CanvasRenderingContext2D,
  elements: CanvasElement[],
  sectionText: string,
  canvasWidth: number,
  canvasHeight: number,
  options?: RenderElementsOptions
): void {
  const sorted = [...elements].filter(Boolean).sort((a, b) => a.zIndex - b.zIndex);

  // 클리핑 마스크 관계 맵: maskId → clipped elements
  const clippedByMap = new Map<string, CanvasElement[]>();
  const clippedIds = new Set<string>();
  for (const el of sorted) {
    if (el.clipMaskId) {
      clippedIds.add(el.id);
      const arr = clippedByMap.get(el.clipMaskId) ?? [];
      arr.push(el);
      clippedByMap.set(el.clipMaskId, arr);
    }
  }

  for (const el of sorted) {
    if (!el.visible) continue;
    if (!isElementVisibleOn(el, options?.target)) continue;
    if (!options?.includeScreenMasks && isScreenMaskElement(el)) continue;
    // 클리핑 된 요소는 마스크 요소 렌더 시 함께 처리 → 개별 스킵
    if (clippedIds.has(el.id)) continue;
    // z-index 필터 적용
    if (options?.mode && typeof options.videoZIndex === 'number') {
      const forceAboveVideo = isElementForcedAboveVideo(el);
      if (options.mode === 'below' && (forceAboveVideo || el.zIndex >= options.videoZIndex)) continue;
      if (options.mode === 'above' && !forceAboveVideo && el.zIndex <= options.videoZIndex) continue;
    }

    // ── 클리핑 마스크 합성: 이 요소를 마스크로 사용하는 요소들 렌더 ──
    const clippedEls = clippedByMap.get(el.id);
    if (clippedEls && clippedEls.length > 0) {
      renderClipMaskGroup(
        ctx,
        el,
        clippedEls,
        sectionText,
        canvasWidth,
        canvasHeight,
        options?.target,
        Boolean(options?.atemKeyMode),
      );
      // 마스크 요소 자체는 렌더하지 않음 (마스크 형태만 클리핑에 사용)
      continue;
    }

    ctx.save();
    ctx.globalAlpha = el.opacity;
    // 이미지 블렌드 모드 적용 (포토샵 스타일)
    if (el.type === 'image' && (el as ImageElement).blendMode) {
      ctx.globalCompositeOperation = (el as ImageElement).blendMode!;
    }
    applyTransform(ctx, el, canvasWidth, canvasHeight);

    // 지우개 마스크 또는 그라데이션 마스크가 있으면 offscreen canvas 에서 합성
    const hasEraserMask = !!el.eraserMask;
    const hasGradientMask = !!el.gradientMask?.enabled;
    const needsOffscreen = hasEraserMask || hasGradientMask;
    let renderCtx = ctx;
    let offscreen: HTMLCanvasElement | null = null;

    if (needsOffscreen) {
      offscreen = getOffscreenCanvas(canvasWidth, canvasHeight);
      const oCtx = offscreen.getContext('2d')!;
      oCtx.clearRect(0, 0, canvasWidth, canvasHeight);
      oCtx.save();
      oCtx.globalAlpha = 1;
      applyTransform(oCtx, el, canvasWidth, canvasHeight);
      renderCtx = oCtx;
    }

    switch (el.type) {
      case 'text':
        renderTextElement(renderCtx, el as TextElement, sectionText, canvasWidth, canvasHeight);
        break;
      case 'shape':
        renderShapeElement(renderCtx, el as ShapeElement, canvasWidth, canvasHeight);
        break;
      case 'image':
        renderImageElement(renderCtx, el as ImageElement, canvasWidth, canvasHeight, Boolean(options?.atemKeyMode));
        break;
      case 'video':
        renderVideoElement(renderCtx, el as VideoElement, canvasWidth, canvasHeight);
        break;
    }

    // 마스크 적용: offscreen 에서 destination-in 으로 마스크 합성
    if (needsOffscreen && offscreen) {
      const oCtx = offscreen.getContext('2d')!;
      oCtx.restore(); // applyTransform save 복구

      const ex = (el.x / 100) * canvasWidth;
      const ey = (el.y / 100) * canvasHeight;
      const ew = (el.width / 100) * canvasWidth;
      const eh = (el.height / 100) * canvasHeight;

      // 지우개 마스크 적용
      if (hasEraserMask) {
        const maskImg = getCachedImage(el.eraserMask!);
        if (maskImg) {
          oCtx.globalCompositeOperation = 'destination-in';
          oCtx.drawImage(maskImg, ex, ey, ew, eh);
          oCtx.globalCompositeOperation = 'source-over';
        }
      }

      // 그라데이션 마스크 적용
      if (hasGradientMask && el.gradientMask) {
        oCtx.globalCompositeOperation = 'destination-in';
        const gm = el.gradientMask;
        const cx = ex + ew / 2;
        const cy = ey + eh / 2;
        let grad: CanvasGradient;

        if (gm.type === 'radial') {
          const radius = Math.max(ew, eh) / 2;
          grad = oCtx.createRadialGradient(cx, cy, 0, cx, cy, radius);
        } else {
          // linear: angle → 시작/끝점 계산
          const rad = (gm.angle * Math.PI) / 180;
          const halfW = ew / 2;
          const halfH = eh / 2;
          const dx = Math.cos(rad) * halfW;
          const dy = Math.sin(rad) * halfH;
          grad = oCtx.createLinearGradient(cx - dx, cy - dy, cx + dx, cy + dy);
        }

        for (const stop of gm.stops) {
          // opacity 1 = 흰(불투명) → alpha 1, opacity 0 = 검(투명) → alpha 0
          grad.addColorStop(stop.offset, `rgba(0,0,0,${stop.opacity})`);
        }
        oCtx.fillStyle = grad;
        oCtx.fillRect(ex, ey, ew, eh);
        oCtx.globalCompositeOperation = 'source-over';
      }

      ctx.drawImage(offscreen, 0, 0);
    }

    ctx.restore();
  }
}

// ─────────────────────────────────────────
// 좌표 변환
// ─────────────────────────────────────────
function applyTransform(
  ctx: CanvasRenderingContext2D,
  el: CanvasElement,
  cw: number,
  ch: number
): void {
  if (el.rotation === 0) return;
  const x  = (el.x  / 100) * cw;
  const y  = (el.y  / 100) * ch;
  const w  = (el.width  / 100) * cw;
  const h  = (el.height / 100) * ch;
  const cx = x + w / 2;
  const cy = y + h / 2;
  ctx.translate(cx, cy);
  ctx.rotate((el.rotation * Math.PI) / 180);
  ctx.translate(-cx, -cy);
}

// ─────────────────────────────────────────
// 그라데이션 생성 헬퍼
// ─────────────────────────────────────────
function makeGradient(
  ctx: CanvasRenderingContext2D,
  config: GradientConfig,
  x: number, y: number, w: number, h: number
): CanvasGradient {
  let gradient: CanvasGradient;

  if (config.type === 'radial') {
    gradient = ctx.createRadialGradient(
      x + w / 2, y + h / 2, 0,
      x + w / 2, y + h / 2, Math.max(w, h) / 2
    );
  } else {
    // linear: angle → x1/y1/x2/y2
    const rad = ((config.angle - 90) * Math.PI) / 180;
    const cx  = x + w / 2;
    const cy  = y + h / 2;
    const len = Math.sqrt(w * w + h * h) / 2;
    gradient = ctx.createLinearGradient(
      cx - Math.cos(rad) * len, cy - Math.sin(rad) * len,
      cx + Math.cos(rad) * len, cy + Math.sin(rad) * len
    );
  }

  for (const stop of config.stops) {
    gradient.addColorStop(stop.offset, stop.color);
  }
  return gradient;
}

// ─────────────────────────────────────────
// 텍스트 요소
// ─────────────────────────────────────────
function renderTextElement(
  ctx: CanvasRenderingContext2D,
  el: TextElement,
  sectionText: string,
  cw: number,
  ch: number
): void {
  const displayText = getTextElementContent(el, sectionText);
  if (!displayText) return;

  const x = (el.x      / 100) * cw;
  const y = (el.y      / 100) * ch;
  const w = (el.width  / 100) * cw;
  const h = (el.height / 100) * ch;

  // 좌우 여백 2% — editor 와 동일
  const hPad = Math.ceil(el.fontSize * 0.02);

  ctx.letterSpacing = `${el.letterSpacing}px`;
  ctx.textAlign    = el.textAlign;
  ctx.textBaseline = 'middle';

  // [FEATURE: FIGMA_TEXT_BOX]
  //   auto-width 텍스트는 기존처럼 줄바꿈 없이 내용 폭에 맞춘다.
  //   수동으로 폭을 잡은 텍스트 박스는 에디터와 동일하게 박스 안에서 줄바꿈한다.
  // [FEATURE: SUBTITLE_AUTOFIT]
  //   autoFit 이면 박스를 넘칠 때 폰트를 줄여 박스(폭·높이) 안에 맞춘다(줄바꿈·높이맞춤 강제).
  const autoFit = !!el.autoFit;
  const isAutoWidth = autoFit ? false : (el.autoWidth ?? true);
  const isAutoHeight = autoFit ? false : (el.autoHeight ?? true);
  const wrapWidth = Math.max(1, w - hPad * 2);

  const fontOf = (fs: number) =>
    `${el.fontStyle} ${el.fontWeight} ${fs}px "${el.fontFamily}", sans-serif`;
  // 프레임마다 재계산하면 rAF 렌더 루프에서 CPU가 폭주(렌더러 크래시)하므로 캐시한다.
  const fontSize = autoFit ? fitFontSize(ctx, el, displayText, wrapWidth, h) : el.fontSize;
  ctx.font = fontOf(fontSize);
  const fitScale = el.fontSize > 0 ? fontSize / el.fontSize : 1;

  const lines = isAutoWidth ? displayText.split('\n') : wrapText(ctx, displayText, wrapWidth);
  const lh = fontSize * el.lineHeight;
  const totalH = lines.length * lh;

  // 가장 긴 줄의 렌더 너비 측정
  let maxLineW = 0;
  for (const line of lines) {
    if (!line) continue;
    const mw = ctx.measureText(line).width;
    if (mw > maxLineW) maxLineW = mw;
  }
  // 실제 시각 너비 = auto-width는 긴 줄에 맞춰 확장, fixed-width는 설계 박스 유지.
  const contentW = maxLineW + hPad * 2;
  const effectiveW = isAutoWidth ? Math.max(w, contentW) : w;

  let startY: number;
  if (el.verticalAlign === 'top')        startY = y + lh / 2;
  else if (el.verticalAlign === 'bottom') startY = y + h - totalH + lh / 2;
  else                                    startY = y + h / 2 - totalH / 2 + lh / 2;

  // anchorX: textAlign 기준 앵커 지점 (설계한 박스 위치 기준, 확장 전)
  const anchorX =
    el.textAlign === 'left'  ? x + hPad       :
    el.textAlign === 'right' ? x + w - hPad   : x + w / 2;

  // 클립 박스 — auto-width는 effectiveW 기준으로 확장, fixed-width는 박스 내부로 제한.
  const clipX =
    el.textAlign === 'left'  ? x :
    el.textAlign === 'right' ? x + w - effectiveW :
                               x + w / 2 - effectiveW / 2;
  const clipY = isAutoHeight ? Math.min(y, startY - lh / 2) : y;
  const clipH = isAutoHeight ? Math.max(h, totalH + lh) : h;

  ctx.save();
  ctx.beginPath();
  ctx.rect(clipX, clipY, effectiveW, clipH);
  ctx.clip();

  // 그라데이션 또는 단색
  const fillStyle = el.useGradient && el.gradient
    ? makeGradient(ctx, el.gradient, x, y, w, h)
    : el.color;

  // 드롭 쉐도우 설정
  const hasShadow = el.useShadow && el.shadow;
  if (hasShadow) {
    ctx.shadowColor   = el.shadow!.color;
    ctx.shadowOffsetX = el.shadow!.offsetX;
    ctx.shadowOffsetY = el.shadow!.offsetY;
    ctx.shadowBlur    = el.shadow!.blur;
  }

  lines.forEach((line, i) => {
    const ly = startY + i * lh;
    if (el.strokeWidth > 0) {
      // 외곽선에는 그림자 적용하지 않음 (이중 그림자 방지)
      if (hasShadow) {
        ctx.shadowColor = 'transparent';
      }
      ctx.strokeStyle = el.strokeColor;
      ctx.lineWidth   = el.strokeWidth * fitScale;
      ctx.lineJoin    = 'round';
      ctx.strokeText(line, anchorX, ly);
      // fillText 에만 그림자 복원
      if (hasShadow) {
        ctx.shadowColor   = el.shadow!.color;
        ctx.shadowOffsetX = el.shadow!.offsetX;
        ctx.shadowOffsetY = el.shadow!.offsetY;
        ctx.shadowBlur    = el.shadow!.blur;
      }
    }
    ctx.fillStyle = fillStyle;
    ctx.fillText(line, anchorX, ly);
  });

  // 그림자 리셋
  if (hasShadow) {
    ctx.shadowColor   = 'transparent';
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    ctx.shadowBlur    = 0;
  }

  // 텍스트 클리핑 복원
  ctx.restore();
}

// ─────────────────────────────────────────
// 도형 요소
// ─────────────────────────────────────────
function renderShapeElement(
  ctx: CanvasRenderingContext2D,
  el: ShapeElement,
  cw: number,
  ch: number
): void {
  const x  = (el.x      / 100) * cw;
  const y  = (el.y      / 100) * ch;
  const w  = (el.width  / 100) * cw;
  const h  = (el.height / 100) * ch;

  const fillStyle = el.useGradient && el.gradient
    ? makeGradient(ctx, el.gradient, x, y, w, h)
    : hexToRgba(el.fill, el.fillOpacity);

  const strokeStyle = el.strokeWidth > 0 && el.stroke !== 'transparent' ? el.stroke : null;

  // 코너 래디우스 해석
  const radii = resolveCornerRadii(el);
  const hasCornerRadius = radii.some((r) => r > 0);

  // 도형 경로 생성 헬퍼
  function buildShapePath() {
    ctx.beginPath();
    switch (el.shapeType) {
      case 'rect':
        if (hasCornerRadius) {
          roundRectPath(ctx, x, y, w, h, radii);
        } else {
          ctx.rect(x, y, w, h);
        }
        break;
      case 'roundRect':
        roundRectPath(ctx, x, y, w, h, radii);
        break;
      case 'ellipse':
        ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
        break;
    }
  }

  // ── 외부 광채 (Outer Glow) ──
  const hasGlow = el.useGlow && el.glow;
  if (hasGlow) {
    ctx.save();
    ctx.shadowColor   = el.glow!.color;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    ctx.shadowBlur    = el.glow!.blur;
    const passes = Math.min(el.glow!.intensity || 1, 5);
    for (let i = 0; i < passes; i++) {
      buildShapePath();
      ctx.fillStyle = fillStyle;
      ctx.fill();
    }
    ctx.restore();
  }

  // ── 드롭 쉐도우 설정 ──
  const hasShadow = el.useShadow && el.shadow;
  if (hasShadow) {
    ctx.shadowColor   = el.shadow!.color;
    ctx.shadowOffsetX = el.shadow!.offsetX;
    ctx.shadowOffsetY = el.shadow!.offsetY;
    ctx.shadowBlur    = el.shadow!.blur;
    // spread 는 Canvas2D 에서 직접 지원하지 않으므로 무시 (CSS box-shadow 전용)
  }

  // 라인은 이미지 채우기 불가 — 기존 로직
  if (el.shapeType === 'line') {
    ctx.beginPath();
    ctx.moveTo(x, y + h / 2);
    ctx.lineTo(x + w, y + h / 2);
    ctx.strokeStyle = el.useGradient && el.gradient
      ? makeGradient(ctx, el.gradient, x, y, w, h)
      : el.stroke;
    ctx.lineWidth  = Math.max(el.strokeWidth, 0.5);
    ctx.lineCap    = 'round';
    ctx.stroke();
    if (hasShadow) { ctx.shadowColor = 'transparent'; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0; ctx.shadowBlur = 0; }
    return;
  }

  // ── 이미지 채우기 (피그마 스타일) ──
  if (el.imageFill) {
    const fillImg = getCachedImage(el.imageFill.src);
    if (fillImg) {
      // 쉐도우를 먼저 채움으로 찍기 (clip 안에서는 shadow 안 보임)
      if (hasShadow) {
        buildShapePath();
        ctx.fillStyle = 'rgba(0,0,0,0)';
        ctx.fill();
        // 쉐도우 리셋 후 이미지 그리기
        ctx.shadowColor = 'transparent';
        ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0; ctx.shadowBlur = 0;
      }

      ctx.save();
      buildShapePath();
      ctx.clip();
      const rect = calcImageFillRect(
        el.imageFill,
        fillImg.naturalWidth, fillImg.naturalHeight,
        w, h,
      );
      ctx.drawImage(fillImg, x + rect.dx, y + rect.dy, rect.dw, rect.dh);
      ctx.restore();

      // 테두리는 클리핑 밖에서 그리기
      if (strokeStyle) {
        buildShapePath();
        ctx.strokeStyle = strokeStyle;
        ctx.lineWidth   = el.strokeWidth;
        ctx.stroke();
      }
      if (hasShadow) { ctx.shadowColor = 'transparent'; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0; ctx.shadowBlur = 0; }
      return;
    }
    // 이미지 로딩 중이면 기본 채움으로 폴백
  }

  // ── 기본 채움 (색상/그라데이션) ──
  buildShapePath();

  if (el.fill !== 'transparent' || (el.useGradient && el.gradient)) {
    ctx.fillStyle = fillStyle;
    ctx.fill();
  }
  if (strokeStyle) {
    // 테두리에 그림자 이중 적용 방지
    if (hasShadow) ctx.shadowColor = 'transparent';
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth   = el.strokeWidth;
    ctx.stroke();
  }

  // 그림자 리셋
  if (hasShadow) {
    ctx.shadowColor   = 'transparent';
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    ctx.shadowBlur    = 0;
  }
}

// ─────────────────────────────────────────
// 헬퍼
// ─────────────────────────────────────────
/**
 * 단어 경계 우선 줄바꿈 (CSS `word-break: keep-all` + `overflow-wrap: break-word` 와 동일 동작).
 *   1. 띄어쓰기/공백으로 토큰 분할
 *   2. 토큰 단위로 한 줄에 쌓다가 maxWidth 초과하면 다음 줄로
 *   3. 한 토큰이 maxWidth 보다 길면 그 토큰만 char-by-char 로 쪼갬
 *
 * 이전 char-by-char 구현은 editor CSS 와 결과가 달라서 "editor 2줄 → output 3줄"
 * 같은 불일치가 생겼음. 단어 경계를 먼저 존중해서 브라우저 동작과 일치시킴.
 */
// [FEATURE: SUBTITLE_AUTOFIT] autoFit 폰트 크기 계산 결과 캐시 — (텍스트·박스·폰트) 동일하면 재계산 안 함.
const _fitCache = new Map<string, number>();

/** 박스(폭 wrapWidth · 높이 boxH)에 맞는 폰트 크기를 찾는다. 결과는 캐시. */
function fitFontSize(
  ctx: CanvasRenderingContext2D,
  el: TextElement,
  displayText: string,
  wrapWidth: number,
  boxH: number,
): number {
  const key = `${el.fontStyle}|${el.fontWeight}|${el.fontFamily}|${el.fontSize}|${el.lineHeight}|${el.letterSpacing}|${Math.round(wrapWidth)}|${Math.round(boxH)}|${displayText}`;
  const cached = _fitCache.get(key);
  if (cached !== undefined) return cached;

  let fontSize = el.fontSize;
  const minFont = Math.max(10, el.fontSize * 0.3);
  for (let i = 0; i < 24; i++) {
    ctx.font = `${el.fontStyle} ${el.fontWeight} ${fontSize}px "${el.fontFamily}", sans-serif`;
    const measured = wrapText(ctx, displayText, wrapWidth);
    const th = measured.length * fontSize * el.lineHeight;
    if (th <= boxH || fontSize <= minFont) break;
    fontSize = Math.max(minFont, fontSize * 0.9);
  }

  if (_fitCache.size > 1000) _fitCache.clear();
  _fitCache.set(key, fontSize);
  return fontSize;
}

// 워십 생성기(성경문구 넘침 분할)에서도 동일 규칙으로 측정할 수 있게 export
export function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const result: string[] = [];

  const wrapLong = (word: string): string[] => {
    // 토큰 하나가 maxWidth 보다 길 때 char-by-char 로 쪼갬
    const out: string[] = [];
    let cur = '';
    for (const ch of word) {
      if (cur && ctx.measureText(cur + ch).width > maxWidth) {
        out.push(cur);
        cur = ch;
      } else {
        cur += ch;
      }
    }
    if (cur) out.push(cur);
    return out;
  };

  for (const para of text.split('\n')) {
    if (!para.trim()) { result.push(''); continue; }
    // 공백 기준 분할 — 공백 토큰도 유지해서 rebuild 시 복원
    const tokens = para.split(/(\s+)/).filter((t) => t.length > 0);

    let cur = '';
    for (const tok of tokens) {
      const candidate = cur + tok;
      if (ctx.measureText(candidate).width <= maxWidth) {
        cur = candidate;
        continue;
      }
      // 현재 줄에 tok 를 얹으면 넘침
      if (cur) {
        result.push(cur.replace(/\s+$/, ''));
        cur = '';
      }
      // tok 자체가 한 줄에도 안 맞으면 char-by-char 분할
      if (ctx.measureText(tok).width > maxWidth) {
        const chunks = wrapLong(tok);
        // 마지막 chunk 만 다음 라인 시작으로 이어짐
        for (let i = 0; i < chunks.length - 1; i++) result.push(chunks[i]);
        cur = chunks[chunks.length - 1] ?? '';
      } else {
        cur = tok.replace(/^\s+/, '');
      }
    }
    if (cur) result.push(cur);
  }
  return result;
}

function hexToRgba(hex: string, alpha: number): string {
  if (!hex || hex === 'transparent') return 'transparent';
  if (!hex.startsWith('#') || hex.length < 7) return hex;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function getImageCanvasFilter(el: ImageElement, isKeyMode = false): string {
  if (el.keyMode === 'luma-invert') {
    return 'none';
  }
  if (isKeyMode) {
    return 'none';
  }
  return 'none';
}

function getLumaKeyExtractedImage(src: string, img: HTMLImageElement): HTMLCanvasElement {
  const cacheKey = `dark-to-white:${src}:${img.naturalWidth}x${img.naturalHeight}`;
  const cached = getKeyImageCache(cacheKey);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;

  const kCtx = canvas.getContext('2d', { willReadFrequently: true });
  if (!kCtx) return canvas;

  kCtx.drawImage(img, 0, 0);
  const imageData = kCtx.getImageData(0, 0, canvas.width, canvas.height);
  const { data } = imageData;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const chroma = max - min;
    const luma = (r * 0.299) + (g * 0.587) + (b * 0.114);

    const isDarkInk = (
      a > 24 &&
      (
        luma < 82 ||
        (luma < 135 && chroma < 70) ||
        (luma < 158 && chroma < 34)
      )
    );
    const value = isDarkInk ? 255 : 0;
    data[i] = value;
    data[i + 1] = value;
    data[i + 2] = value;
    data[i + 3] = 255;
  }

  kCtx.putImageData(imageData, 0, 0);
  setKeyImageCache(cacheKey, canvas);
  return canvas;
}

type ImageDrawable = HTMLImageElement | HTMLCanvasElement;

function drawImageWithObjectFit(
  ctx: CanvasRenderingContext2D,
  imageSource: ImageDrawable,
  objectFit: ImageElement['objectFit'],
  x: number,
  y: number,
  w: number,
  h: number,
  sourceWidth: number,
  sourceHeight: number,
  shouldClipCover: boolean,
): void {
  switch (objectFit) {
    case 'cover': {
      const scale = Math.max(w / sourceWidth, h / sourceHeight);
      const sw = sourceWidth * scale;
      const sh = sourceHeight * scale;
      if (shouldClipCover) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, w, h);
        ctx.clip();
      }
      ctx.drawImage(imageSource, x + (w - sw) / 2, y + (h - sh) / 2, sw, sh);
      if (shouldClipCover) ctx.restore();
      break;
    }
    case 'contain': {
      const scale = Math.min(w / sourceWidth, h / sourceHeight);
      const sw = sourceWidth * scale;
      const sh = sourceHeight * scale;
      ctx.drawImage(imageSource, x + (w - sw) / 2, y + (h - sh) / 2, sw, sh);
      break;
    }
    case 'fill':
    default:
      ctx.drawImage(imageSource, x, y, w, h);
      break;
  }
}

function drawImageAlphaMatte(
  ctx: CanvasRenderingContext2D,
  imageSource: ImageDrawable,
  objectFit: ImageElement['objectFit'],
  x: number,
  y: number,
  w: number,
  h: number,
  sourceWidth: number,
  sourceHeight: number,
): void {
  const matteWidth = Math.max(1, Math.ceil(w));
  const matteHeight = Math.max(1, Math.ceil(h));
  const matteCanvas = document.createElement('canvas');
  matteCanvas.width = matteWidth;
  matteCanvas.height = matteHeight;

  const matteCtx = matteCanvas.getContext('2d');
  if (!matteCtx) return;

  drawImageWithObjectFit(
    matteCtx,
    imageSource,
    objectFit,
    0,
    0,
    matteWidth,
    matteHeight,
    sourceWidth,
    sourceHeight,
    objectFit === 'cover',
  );
  matteCtx.globalCompositeOperation = 'source-in';
  matteCtx.fillStyle = '#ffffff';
  matteCtx.fillRect(0, 0, matteWidth, matteHeight);
  matteCtx.globalCompositeOperation = 'source-over';

  ctx.drawImage(matteCanvas, x, y, w, h);
}

// ─────────────────────────────────────────
// 이미지 요소
// ─────────────────────────────────────────
function renderImageElement(
  ctx: CanvasRenderingContext2D,
  el: ImageElement,
  cw: number,
  ch: number,
  isKeyMode = false
): void {
  const img = getCachedImage(el.src);
  if (!img) return; // 아직 로딩 중 → 다음 프레임에 표시
  const imageSource = el.keyMode === 'luma-invert'
    ? getLumaKeyExtractedImage(el.src, img)
    : img;
  const sourceWidth = imageSource instanceof HTMLCanvasElement ? imageSource.width : imageSource.naturalWidth;
  const sourceHeight = imageSource instanceof HTMLCanvasElement ? imageSource.height : imageSource.naturalHeight;

  const x = (el.x / 100) * cw;
  const y = (el.y / 100) * ch;
  const w = (el.width / 100) * cw;
  const h = (el.height / 100) * ch;

  // 코너 래디우스 클리핑
  const radii = resolveCornerRadii(el);
  const hasRadius = radii.some((r) => r > 0);

  // ── 외부 광채 (Outer Glow) ──
  // Canvas shadowBlur는 이미지의 알파 채널을 따라감 → 배경 제거된 인물 윤곽에 발광
  const hasGlow = el.useGlow && el.glow;
  if (hasGlow) {
    ctx.save();
    ctx.shadowColor   = el.glow!.color;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    ctx.shadowBlur    = el.glow!.blur;
    const passes = Math.min(el.glow!.intensity || 1, 5);
    for (let i = 0; i < passes; i++) {
      ctx.drawImage(imageSource, x, y, w, h);
    }
    ctx.restore();
    // 광채만 남기고 이미지는 아래에서 다시 그림 → globalCompositeOperation 트릭 불필요
    // (광채 위에 원본을 덮어 그리면 자연스러움)
  }

  // ── 드롭 쉐도우 ──
  const hasShadow = el.useShadow && el.shadow;
  if (hasShadow) {
    // clip 안에서는 shadow 안 보이므로 미리 도형 채움으로 쉐도우 찍기
    ctx.shadowColor   = el.shadow!.color;
    ctx.shadowOffsetX = el.shadow!.offsetX;
    ctx.shadowOffsetY = el.shadow!.offsetY;
    ctx.shadowBlur    = el.shadow!.blur;
    ctx.beginPath();
    if (hasRadius) {
      roundRectPath(ctx, x, y, w, h, radii);
    } else {
      ctx.rect(x, y, w, h);
    }
    ctx.fillStyle = 'rgba(0,0,0,0)';
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0; ctx.shadowBlur = 0;
  }

  if (hasRadius) {
    ctx.save();
    ctx.beginPath();
    roundRectPath(ctx, x, y, w, h, radii);
    ctx.clip();
  }

  const previousFilter = ctx.filter;
  const imageFilter = getImageCanvasFilter(el, isKeyMode);
  if (imageFilter !== 'none') {
    ctx.filter = previousFilter && previousFilter !== 'none'
      ? `${previousFilter} ${imageFilter}`
      : imageFilter;
  }

  try {
    if (isKeyMode && el.keyMode !== 'luma-invert') {
      drawImageAlphaMatte(ctx, imageSource, el.objectFit, x, y, w, h, sourceWidth, sourceHeight);
    } else {
      drawImageWithObjectFit(
        ctx,
        imageSource,
        el.objectFit,
        x,
        y,
        w,
        h,
        sourceWidth,
        sourceHeight,
        el.objectFit === 'cover' && !hasRadius,
      );
    }
  } finally {
    ctx.filter = previousFilter;
  }

  if (hasRadius) ctx.restore();

  // ── 테두리 ──
  const imgStrokeW = el.strokeWidth ?? 0;
  if (imgStrokeW > 0 && el.stroke && el.stroke !== 'transparent') {
    ctx.beginPath();
    if (hasRadius) {
      roundRectPath(ctx, x, y, w, h, radii);
    } else {
      ctx.rect(x, y, w, h);
    }
    ctx.strokeStyle = el.stroke;
    ctx.lineWidth   = imgStrokeW;
    ctx.stroke();
  }
}

// ─────────────────────────────────────────
// 영상 요소 (썸네일 또는 플레이스홀더)
// ─────────────────────────────────────────
function renderVideoElement(
  ctx: CanvasRenderingContext2D,
  el: VideoElement,
  cw: number,
  ch: number
): void {
  const x = (el.x / 100) * cw;
  const y = (el.y / 100) * ch;
  const w = (el.width / 100) * cw;
  const h = (el.height / 100) * ch;

  // 썸네일 이미지가 있으면 렌더링
  if (el.thumbnailUrl) {
    const img = getCachedImage(el.thumbnailUrl);
    if (img) {
      ctx.drawImage(img, x, y, w, h);
      return;
    }
  }

  // 썸네일 로딩 전 or 없을 때 → 어두운 플레이스홀더
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(x, y, w, h);

  // ▶ 아이콘
  const iconSize = Math.min(w, h) * 0.15;
  const cx = x + w / 2;
  const cy = y + h / 2;
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.beginPath();
  ctx.moveTo(cx - iconSize / 2, cy - iconSize / 2);
  ctx.lineTo(cx + iconSize / 2, cy);
  ctx.lineTo(cx - iconSize / 2, cy + iconSize / 2);
  ctx.closePath();
  ctx.fill();
}

// ─────────────────────────────────────────
// 클리핑 마스크 합성
// ─────────────────────────────────────────
/**
 * 마스크 요소의 형태로 콘텐츠 요소들을 클리핑하여 렌더링.
 * 1) 오프스크린에 콘텐츠 렌더
 * 2) destination-in 으로 마스크 형태만 남김
 * 3) 메인 캔버스에 합성
 */
function renderClipMaskGroup(
  ctx: CanvasRenderingContext2D,
  maskEl: CanvasElement,
  clippedEls: CanvasElement[],
  sectionText: string,
  cw: number,
  ch: number,
  target?: CanvasRenderTarget,
  isKeyMode = false,
): void {
  const clipCanvas = getClipMaskCanvas(cw, ch);
  const cCtx = clipCanvas.getContext('2d')!;

  for (const content of clippedEls) {
    if (!content.visible) continue;
    if (!isElementVisibleOn(content, target)) continue;

    cCtx.clearRect(0, 0, cw, ch);

    // ── 1단계: 콘텐츠 ��소 렌더 ──
    cCtx.save();
    cCtx.globalAlpha = content.opacity;
    applyTransform(cCtx, content, cw, ch);
    switch (content.type) {
      case 'text':
        renderTextElement(cCtx, content as TextElement, sectionText, cw, ch);
        break;
      case 'shape':
        renderShapeElement(cCtx, content as ShapeElement, cw, ch);
        break;
      case 'image':
        renderImageElement(cCtx, content as ImageElement, cw, ch, isKeyMode);
        break;
      case 'video':
        renderVideoElement(cCtx, content as VideoElement, cw, ch);
        break;
    }
    cCtx.restore();

    // ── 2단계: 마스크 형태로 클리핑 (destination-in) ──
    cCtx.save();
    cCtx.globalCompositeOperation = 'destination-in';
    cCtx.globalAlpha = 1;
    applyTransform(cCtx, maskEl, cw, ch);

    // 마스크 요소의 형태를 불투명하게 채움
    const mx = (maskEl.x / 100) * cw;
    const my = (maskEl.y / 100) * ch;
    const mw = (maskEl.width / 100) * cw;
    const mh = (maskEl.height / 100) * ch;

    if (maskEl.type === 'shape') {
      const shape = maskEl as ShapeElement;
      const radii = resolveCornerRadii(shape);
      cCtx.beginPath();
      if (shape.shapeType === 'ellipse') {
        cCtx.ellipse(mx + mw / 2, my + mh / 2, mw / 2, mh / 2, 0, 0, Math.PI * 2);
      } else {
        const hasR = radii.some((r) => r > 0);
        if (hasR) {
          roundRectPath(cCtx, mx, my, mw, mh, radii);
        } else {
          cCtx.rect(mx, my, mw, mh);
        }
      }
      cCtx.fillStyle = '#000';
      cCtx.fill();
    } else if (maskEl.type === 'image') {
      // 이미지 마스크: 이미지 자체의 알파 채널을 마스크로 사용
      const maskImg = getCachedImage((maskEl as ImageElement).src);
      if (maskImg) {
        const imgRadii = resolveCornerRadii(maskEl as ImageElement);
        const hasR = imgRadii.some((r) => r > 0);
        if (hasR) {
          cCtx.beginPath();
          roundRectPath(cCtx, mx, my, mw, mh, imgRadii);
          cCtx.clip();
        }
        cCtx.drawImage(maskImg, mx, my, mw, mh);
      } else {
        // 이미지 로드 전: 사각형 폴백
        cCtx.fillStyle = '#000';
        cCtx.fillRect(mx, my, mw, mh);
      }
    } else if (maskEl.type === 'text') {
      // 텍스트 마스크: 실제 글자 형태(글리프)를 불투명하게 채워서 클리핑
      const textEl = maskEl as TextElement;
      const displayText = getTextElementContent(textEl, sectionText);
      if (displayText) {
        cCtx.font = `${textEl.fontStyle} ${textEl.fontWeight} ${textEl.fontSize}px "${textEl.fontFamily}", sans-serif`;
        cCtx.letterSpacing = `${textEl.letterSpacing}px`;
        cCtx.textAlign = textEl.textAlign;
        cCtx.textBaseline = 'middle';

        const lines = wrapText(cCtx, displayText, mw);
        const lh = textEl.fontSize * textEl.lineHeight;
        const totalH = lines.length * lh;

        let startY: number;
        if (textEl.verticalAlign === 'top') startY = my + lh / 2;
        else if (textEl.verticalAlign === 'bottom') startY = my + mh - totalH + lh / 2;
        else startY = my + mh / 2 - totalH / 2 + lh / 2;

        const anchorX =
          textEl.textAlign === 'left'  ? mx :
          textEl.textAlign === 'right' ? mx + mw : mx + mw / 2;

        cCtx.fillStyle = '#000';
        lines.forEach((line, i) => {
          cCtx.fillText(line, anchorX, startY + i * lh);
        });
      } else {
        cCtx.fillStyle = '#000';
        cCtx.fillRect(mx, my, mw, mh);
      }
    } else {
      // 비디오 등: 사각형으로 클리핑
      cCtx.fillStyle = '#000';
      cCtx.fillRect(mx, my, mw, mh);
    }

    cCtx.restore();

    // ── 3단계: 메인 캔버스에 합성 ──
    ctx.drawImage(clipCanvas, 0, 0);
  }
}

/** 4코너 개별 래디우스 지원 roundRect 경로 [TL, TR, BR, BL] */
function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  radii: [number, number, number, number],
): void {
  const maxR = Math.min(w / 2, h / 2);
  const tl = Math.min(radii[0], maxR);
  const tr = Math.min(radii[1], maxR);
  const br = Math.min(radii[2], maxR);
  const bl = Math.min(radii[3], maxR);

  ctx.moveTo(x + tl, y);
  ctx.lineTo(x + w - tr, y);
  ctx.arcTo(x + w, y, x + w, y + tr, tr);
  ctx.lineTo(x + w, y + h - br);
  ctx.arcTo(x + w, y + h, x + w - br, y + h, br);
  ctx.lineTo(x + bl, y + h);
  ctx.arcTo(x, y + h, x, y + h - bl, bl);
  ctx.lineTo(x, y + tl);
  ctx.arcTo(x, y, x + tl, y, tl);
  ctx.closePath();
}
