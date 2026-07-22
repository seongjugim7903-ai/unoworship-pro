/**
 * gradientMaskCss.ts
 * 그라데이션 마스크 → CSS mask-image 변환 헬퍼
 *
 * 포토샵 레이어 마스크 스타일:
 *   흰색 = 보임 (opacity 1) → alpha 1
 *   검정색 = 안보임 (opacity 0) → alpha 0
 */

import { GradientMaskConfig } from './canvasTypes';

/**
 * GradientMaskConfig → CSS mask-image 문자열 반환
 * eraser mask가 있을 경우 두 마스크를 합성 (교차: 둘 다 보이는 영역만 표시)
 */
export function buildMaskStyle(
  gradientMask?: GradientMaskConfig,
  eraserMask?: string,
): React.CSSProperties {
  const masks: string[] = [];

  // 그라데이션 마스크
  if (gradientMask?.enabled) {
    const gm = gradientMask;
    const stopsStr = gm.stops
      .map((s) => `rgba(0,0,0,${s.opacity}) ${(s.offset * 100).toFixed(1)}%`)
      .join(', ');

    if (gm.type === 'radial') {
      masks.push(`radial-gradient(ellipse at center, ${stopsStr})`);
    } else {
      // CSS linear-gradient: angle은 CSS 기준 (0deg=↑, 90deg=→)
      // 우리 angle: 0=→, 90=↓  →  CSS 변환: cssAngle = 90 + angle
      const cssAngle = 90 + gm.angle;
      masks.push(`linear-gradient(${cssAngle}deg, ${stopsStr})`);
    }
  }

  // 지우개 마스크
  if (eraserMask) {
    masks.push(`url(${eraserMask})`);
  }

  if (masks.length === 0) return {};

  const maskImage = masks.join(', ');
  const maskSize = masks.map(() => '100% 100%').join(', ');
  // composite: intersect — 두 마스크의 교집합 (둘 다 불투명한 부분만 보임)
  const maskComposite = masks.length > 1 ? 'intersect' : undefined;
  const webkitMaskComposite = masks.length > 1 ? 'source-in' : undefined;

  return {
    WebkitMaskImage: maskImage,
    WebkitMaskSize: maskSize,
    WebkitMaskComposite: webkitMaskComposite,
    maskImage,
    maskSize,
    maskComposite,
  } as React.CSSProperties;
}
