// 템플릿 요소를 오프스크린 캔버스에 그려 썸네일 data URL(JPEG)을 만든다

import type { CanvasElement } from '@/lib/canvasTypes';
import { preloadImages, renderElements } from '@/lib/canvasRenderer';

const SOURCE_W = 1920;
const SOURCE_H = 1080;

/**
 * 요소 배열을 축소 렌더해 썸네일 data URL 을 반환한다(브라우저 전용).
 * 실패해도 예외 없이 빈 문자열을 반환한다.
 */
export async function renderTemplateThumbnail(
  elements: CanvasElement[],
  sampleText = '',
  width = 320,
): Promise<string> {
  if (typeof document === 'undefined') return '';
  const height = Math.round((width * SOURCE_H) / SOURCE_W);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  try {
    await preloadImages(elements);
  } catch {
    // 이미지 로드 실패해도 나머지 요소는 그린다
  }

  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, width, height);
  ctx.save();
  ctx.scale(width / SOURCE_W, height / SOURCE_H);
  try {
    renderElements(ctx, elements, sampleText, SOURCE_W, SOURCE_H);
  } catch {
    // 렌더 실패 시 검은 배경만 남긴다
  }
  ctx.restore();

  try {
    return canvas.toDataURL('image/jpeg', 0.5);
  } catch {
    return '';
  }
}
