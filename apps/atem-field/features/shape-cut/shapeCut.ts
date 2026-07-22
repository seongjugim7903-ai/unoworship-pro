// 도형 불리언(교차) — 아래 도형(칼) 형태로 위 도형을 잘라 단일 이미지 data URL 로 굽는다.
//   아래 도형은 그대로 유지(프레임), 위 도형은 잘린 이미지 요소로 교체하는 데 쓴다.
//   렌더 fidelity(fill/그라데이션/stroke)를 위해 기존 canvasRenderer 를 오프스크린에 재사용.
import { renderElements } from '@/lib/canvasRenderer';
import type { ShapeElement } from '@/lib/canvasTypes';

const CANVAS_W = 1920;
const CANVAS_H = 1080;

export interface CutImageResult {
  /** PNG data URL — 위 도형 ∩ 아래 도형 형태 (그 외 영역 투명) */
  src: string;
  /** 결과 이미지 요소의 위치·크기 (위 도형과 동일, 캔버스 % 기준) */
  x: number;
  y: number;
  width: number;
  height: number;
}

function makeCanvas(w: number, h: number): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/**
 * 위 도형(top)을 아래 도형(bottom) 형태로 잘라 이미지로 만든다.
 * @returns 잘린 이미지 정보. 겹침이 없거나 캔버스 사용 불가 시 null.
 * 주의: 회전(rotation)은 MVP 범위 밖 — 회전되지 않은 도형 기준으로 정확.
 */
export function cutTopShapeToImage(top: ShapeElement, bottom: ShapeElement): CutImageResult | null {
  // 1. 위 도형을 전체 캔버스에 렌더 (원본 fill/그라데이션/stroke 유지)
  const topCanvas = makeCanvas(CANVAS_W, CANVAS_H);
  const topCtx = topCanvas?.getContext('2d');
  if (!topCanvas || !topCtx) return null;
  renderElements(
    topCtx,
    [{ ...top, clipMaskId: undefined, visible: true } as ShapeElement],
    '',
    CANVAS_W,
    CANVAS_H,
  );

  // 2. 아래 도형을 "불투명 실루엣"으로 별도 캔버스에 렌더 (색/투명도 무시, 형태만)
  const maskCanvas = makeCanvas(CANVAS_W, CANVAS_H);
  const maskCtx = maskCanvas?.getContext('2d');
  if (!maskCanvas || !maskCtx) return null;
  const silhouette: ShapeElement = {
    ...bottom,
    clipMaskId: undefined,
    visible: true,
    fill: '#000000',
    fillOpacity: 1,
    useGradient: false,
    strokeWidth: 0,
    useShadow: false,
    useGlow: false,
    imageFill: undefined,
  };
  renderElements(maskCtx, [silhouette], '', CANVAS_W, CANVAS_H);

  // 3. destination-in: 위 도형을 아래 실루엣이 있는 영역만 남김 (= 교차)
  topCtx.globalCompositeOperation = 'destination-in';
  topCtx.drawImage(maskCanvas, 0, 0);
  topCtx.globalCompositeOperation = 'source-over';

  // 4. 위 도형 bounds 로 크롭 → 결과 이미지 = 위 도형과 동일 위치/크기
  const px = Math.round((top.x / 100) * CANVAS_W);
  const py = Math.round((top.y / 100) * CANVAS_H);
  const pw = Math.max(1, Math.round((top.width / 100) * CANVAS_W));
  const ph = Math.max(1, Math.round((top.height / 100) * CANVAS_H));

  const out = makeCanvas(pw, ph);
  const outCtx = out?.getContext('2d');
  if (!out || !outCtx) return null;
  outCtx.drawImage(topCanvas, px, py, pw, ph, 0, 0, pw, ph);

  return {
    src: out.toDataURL('image/png'),
    x: top.x,
    y: top.y,
    width: top.width,
    height: top.height,
  };
}
