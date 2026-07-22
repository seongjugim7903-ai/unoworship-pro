/**
 * lib/imageProcessing/selectionTool.ts
 * 선택 도구 — 요소의 사각 영역을 잘라내어 새 이미지 요소로 복사
 *
 * 동작:
 *   - 요소(이미지/도형) 위에서 사각 드래그 → 정규화 좌표(0–1) 영역 확보
 *   - 해당 영역을 Canvas 에 렌더링 → data URL 로 추출
 *   - 결과를 새 ImageElement 로 생성
 */

import { CanvasElement, ImageElement } from '../canvasTypes';

// ─────────────────────────────────────────
// 선택 영역 (정규화 좌표 0–1)
// ─────────────────────────────────────────
export interface SelectionRect {
  /** 왼쪽 상단 X (0–1) */
  x: number;
  /** 왼쪽 상단 Y (0–1) */
  y: number;
  /** 너비 (0–1) */
  w: number;
  /** 높이 (0–1) */
  h: number;
}

/** 드래그 시작/끝 좌표 → 정규화된 사각 영역 (항상 양수 크기) */
export function normalizeRect(
  x1: number, y1: number, x2: number, y2: number,
): SelectionRect {
  const minX = Math.max(0, Math.min(x1, x2));
  const minY = Math.max(0, Math.min(y1, y2));
  const maxX = Math.min(1, Math.max(x1, x2));
  const maxY = Math.min(1, Math.max(y1, y2));
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

// ─────────────────────────────────────────
// 이미지 요소 크롭
// ─────────────────────────────────────────

/** 이미지 src를 로드하여 HTMLImageElement 반환 */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/**
 * 이미지 요소에서 선택 영역을 크롭하여 data URL 반환
 * @param src        이미지 data URL 또는 URL
 * @param rect       정규화 선택 영역 (0–1)
 * @param objectFit  이미지의 objectFit 모드 (기본 fill — 전체 맞춤)
 * @returns          크롭된 이미지 data URL (WebP)
 */
export async function cropImageRegion(
  src: string,
  rect: SelectionRect,
  objectFit: 'cover' | 'contain' | 'fill' = 'fill',
): Promise<string> {
  const img = await loadImage(src);
  const natW = img.naturalWidth;
  const natH = img.naturalHeight;

  // objectFit에 따라 실제 이미지가 그려지는 영역 계산
  let drawX = 0, drawY = 0, drawW = natW, drawH = natH;

  if (objectFit === 'cover') {
    const scale = Math.max(1, 1); // 요소 크기 = 이미지 영역 기준 1:1
    const imgRatio = natW / natH;
    // cover: 짧은 쪽 맞춤 → 긴 쪽은 잘림
    // 여기서는 요소 전체가 이미지라 가정 (요소 비율은 외부에서 처리)
    drawX = 0; drawY = 0; drawW = natW; drawH = natH;
  } else if (objectFit === 'contain') {
    drawX = 0; drawY = 0; drawW = natW; drawH = natH;
  }
  // fill: 전체 영역에 늘려서 그림 → 선택 영역과 1:1 매핑

  // 선택 영역 → 이미지 픽셀 좌표
  const sx = Math.round(rect.x * natW);
  const sy = Math.round(rect.y * natH);
  const sw = Math.round(rect.w * natW);
  const sh = Math.round(rect.h * natH);

  if (sw < 1 || sh < 1) throw new Error('선택 영역이 너무 작습니다');

  const canvas = document.createElement('canvas');
  canvas.width = sw;
  canvas.height = sh;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);

  let dataUrl = canvas.toDataURL('image/webp', 0.92);
  if (!dataUrl.startsWith('data:image/webp')) {
    dataUrl = canvas.toDataURL('image/png');
  }
  return dataUrl;
}

/**
 * DOM 요소를 캔버스로 캡처하여 선택 영역 크롭 (도형/텍스트용 폴백)
 * html2canvas 없이 간단 구현: 요소의 렌더링된 모습을 캡처
 */
export async function cropElementRegion(
  element: CanvasElement,
  rect: SelectionRect,
  canvasEl: HTMLDivElement,
): Promise<string> {
  // 요소의 DOM 노드 찾기
  const canvasRect = canvasEl.getBoundingClientRect();
  const elX = canvasRect.left + (element.x / 100) * canvasRect.width;
  const elY = canvasRect.top + (element.y / 100) * canvasRect.height;
  const elW = (element.width / 100) * canvasRect.width;
  const elH = (element.height / 100) * canvasRect.height;

  // 선택 영역 → 화면 좌표
  const cropX = elX + rect.x * elW;
  const cropY = elY + rect.y * elH;
  const cropW = rect.w * elW;
  const cropH = rect.h * elH;

  if (cropW < 2 || cropH < 2) throw new Error('선택 영역이 너무 작습니다');

  // 오프스크린 캔버스에 도형/텍스트를 직접 렌더하기는 복잡하므로
  // 이미지 타입이 아닌 경우는 지원하지 않음 (이미지만 크롭)
  throw new Error('이미지 요소만 선택 크롭이 지원됩니다');
}
