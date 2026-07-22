/**
 * lib/imageProcessing/shapeFill.ts
 * 도형 이미지 채우기 — 피그마 스타일
 *
 * 두 가지 모드:
 *   fit-width  (기본): 이미지를 도형 너비에 맞추고, offsetY 로 상하 위치 조절
 *   fit-height       : 이미지를 도형 높이에 맞추고, offsetX 로 좌우 위치 조절
 *
 * 이미지 비율을 유지하면서 도형 클리핑 영역 안에 렌더링.
 */

import type { ImageFillConfig } from '@/lib/canvasTypes';

/**
 * 도형 영역(w×h) 내에서 이미지의 그리기 좌표를 계산합니다.
 *
 * @param fill  ImageFillConfig (mode, offset)
 * @param natW  이미지 원본 너비
 * @param natH  이미지 원본 높이
 * @param boxW  도형 영역 너비 (px)
 * @param boxH  도형 영역 높이 (px)
 * @returns     { dx, dy, dw, dh } — drawImage 좌표 (도형 좌상단 기준)
 */
export function calcImageFillRect(
  fill: ImageFillConfig,
  natW: number,
  natH: number,
  boxW: number,
  boxH: number,
): { dx: number; dy: number; dw: number; dh: number } {
  const imgAspect = natW / natH;

  if (fill.mode === 'fit-width') {
    // 이미지 너비 = 도형 너비, 높이는 비율 유지
    const dw = boxW;
    const dh = boxW / imgAspect;
    const dx = 0;
    // offsetY: 0 = 상단 정렬, 0.5 = 중앙, 1 = 하단 정렬
    const maxShift = dh - boxH;
    const dy = maxShift > 0 ? -(fill.offsetY * maxShift) : (boxH - dh) / 2;
    return { dx, dy, dw, dh };
  } else {
    // fit-height: 이미지 높이 = 도형 높이, 너비는 비율 유지
    const dh = boxH;
    const dw = boxH * imgAspect;
    const dy = 0;
    // offsetX: 0 = 좌측 정렬, 0.5 = 중앙, 1 = 우측 정렬
    const maxShift = dw - boxW;
    const dx = maxShift > 0 ? -(fill.offsetX * maxShift) : (boxW - dw) / 2;
    return { dx, dy, dw, dh };
  }
}

/** ImageFillConfig 기본값 생성 */
export function createDefaultImageFill(src: string): ImageFillConfig {
  return {
    src,
    mode: 'fit-width',
    offsetX: 0.5,
    offsetY: 0.5,
  };
}
