/**
 * lib/clipMaskStyle.ts
 * 클리핑 마스크 시각화 헬퍼 — DOM 기반 렌더러(iframe 오버레이 포함)에서
 * clipMaskId 로 참조되는 마스크 요소의 모양에 맞는 CSS 를 계산한다.
 *
 * [FEATURE: CLIP_MASK / SHAPE_YOUTUBE_CLIP]
 *
 * 적용 대상:
 *   - components/composer/EditorCanvas.tsx  (에디터 미리보기)
 *   - components/output/OutputCanvas.tsx    (강대상 송출 iframe 오버레이)
 *   - components/prompt/PromptCanvas.tsx    (중층 송출 iframe 오버레이)
 *   - components/media/broadcast/BroadcastFeedMirror.tsx (대시보드 미러)
 *
 * 왜 필요한가:
 *   Canvas 렌더러(lib/canvasRenderer.ts) 는 thumbnail 만 클리핑 처리하고,
 *   실제 라이브 iframe 은 별도 DOM 오버레이로 덮어씁니다. 그 오버레이에
 *   CSS mask 를 적용하지 않으면 도형 밖 영역까지 사각형 그대로 iframe 이 보입니다.
 */

import type { CSSProperties } from 'react';
import type { CanvasElement, ShapeElement, ImageElement } from './canvasTypes';
import { resolveCornerRadii } from './canvasTypes';

/**
 * 마스크 요소의 모양으로 컨테이너를 잘라주는 CSS 속성을 반환.
 * maskEl 이 null/undefined 면 빈 객체 반환 (마스크 미적용).
 */
export function getClipMaskContainerStyle(
  maskEl: CanvasElement | null | undefined
): CSSProperties {
  if (!maskEl) return {};

  // 도형 마스크
  if (maskEl.type === 'shape') {
    const shape = maskEl as ShapeElement;
    if (shape.shapeType === 'ellipse') {
      return { clipPath: 'ellipse(50% 50% at 50% 50%)' };
    }
    const radii = resolveCornerRadii(shape);
    const hasRadius = radii.some((r) => r > 0);
    if (hasRadius) {
      return { borderRadius: `${radii[0]}px ${radii[1]}px ${radii[2]}px ${radii[3]}px` };
    }
    return {};
  }

  // 이미지 마스크 — 이미지의 알파 채널을 마스크로 사용
  //   (lib/canvasRenderer.ts renderClipMaskGroup 의 drawImage + destination-in 과 일치)
  if (maskEl.type === 'image') {
    const img = maskEl as ImageElement;
    const radii = resolveCornerRadii(img);
    const hasRadius = radii.some((r) => r > 0);
    const style: CSSProperties & Record<string, string> = {
      maskImage:          `url("${img.src}")`,
      WebkitMaskImage:    `url("${img.src}")`,
      maskSize:           '100% 100%',
      WebkitMaskSize:     '100% 100%',
      maskRepeat:         'no-repeat',
      WebkitMaskRepeat:   'no-repeat',
      maskPosition:       'center',
      WebkitMaskPosition: 'center',
    };
    if (hasRadius) {
      style.borderRadius = `${radii[0]}px ${radii[1]}px ${radii[2]}px ${radii[3]}px`;
    }
    return style;
  }

  // text 마스크는 TextClipMaskView 가 전용 경로로 처리하므로 여기서는 미지원.
  // 영상이 텍스트로 마스킹되는 경우는 현재 시나리오상 없음.
  return {};
}

/**
 * 주어진 요소의 clipMaskId 로 마스크 요소를 찾아 CSS 를 반환.
 * clipMaskId 가 없으면 빈 객체.
 */
export function getClipMaskStyleFor(
  el: CanvasElement,
  allElements: CanvasElement[]
): CSSProperties {
  if (!el.clipMaskId) return {};
  const mask = allElements.find((e) => e.id === el.clipMaskId);
  return getClipMaskContainerStyle(mask);
}
