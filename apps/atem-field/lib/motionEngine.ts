/**
 * motionEngine.ts
 * 모션 보간(Interpolation) 엔진
 *
 * 요소의 시작 상태(MotionConfig) → 최종 상태(현재 속성값)를
 * duration 동안 easing 곡선에 따라 보간하여 프레임별 속성값 반환
 */

import { CanvasElement, MotionConfig, MotionEasing } from './canvasTypes';

// ─────────────────────────────────────────
// Easing 함수들
// ─────────────────────────────────────────
function easeLinear(t: number): number {
  return t;
}

function easeIn(t: number): number {
  return t * t * t;
}

function easeOut(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function easeInOut(t: number): number {
  return t < 0.5
    ? 4 * t * t * t
    : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function easeBounce(t: number): number {
  const n1 = 7.5625;
  const d1 = 2.75;
  let x = t;
  if (x < 1 / d1) return n1 * x * x;
  if (x < 2 / d1) return n1 * (x -= 1.5 / d1) * x + 0.75;
  if (x < 2.5 / d1) return n1 * (x -= 2.25 / d1) * x + 0.9375;
  return n1 * (x -= 2.625 / d1) * x + 0.984375;
}

export function getEasingFn(type: MotionEasing): (t: number) => number {
  switch (type) {
    case 'linear': return easeLinear;
    case 'ease-in': return easeIn;
    case 'ease-out': return easeOut;
    case 'ease-in-out': return easeInOut;
    case 'bounce': return easeBounce;
    default: return easeOut;
  }
}

// ─────────────────────────────────────────
// 색상 보간 헬퍼
// ─────────────────────────────────────────
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return `#${clamp(r).toString(16).padStart(2, '0')}${clamp(g).toString(16).padStart(2, '0')}${clamp(b).toString(16).padStart(2, '0')}`;
}

function lerpColor(from: string, to: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(from);
  const [r2, g2, b2] = hexToRgb(to);
  return rgbToHex(
    r1 + (r2 - r1) * t,
    g1 + (g2 - g1) * t,
    b1 + (b2 - b1) * t,
  );
}

// ─────────────────────────────────────────
// 메인 보간 함수
// ─────────────────────────────────────────

/**
 * 모션이 적용된 요소의 현재 프레임 속성을 계산
 * @param element 최종 상태의 요소
 * @param motion  시작 상태 설정
 * @param elapsed 경과 시간 (초)
 * @returns 보간된 속성이 적용된 요소 (원본 불변)
 */
export function interpolateElement(
  element: CanvasElement,
  motion: MotionConfig,
  elapsed: number,
): CanvasElement {
  const { easing } = motion;

  // 시퀀스 기반 시작/종료 시간 (하위호환: startTime/endTime 없으면 0~duration)
  const tStart = motion.startTime ?? 0;
  const tEnd   = motion.endTime ?? (tStart + (motion.duration ?? 1));
  const span   = tEnd - tStart;

  // 시작 전이면 0%, 종료 후면 100%
  let rawT: number;
  if (elapsed <= tStart) rawT = 0;
  else if (elapsed >= tEnd || span <= 0) rawT = 1;
  else rawT = (elapsed - tStart) / span;

  const easeFn = getEasingFn(easing);
  const t = easeFn(rawT);

  const lerp = (from: number, to: number) => from + (to - from) * t;

  const updates: Partial<CanvasElement> = {};
  const u = updates as Record<string, unknown>;

  // ─── 위치 (사용자가 명시적으로 지정한 경우) ───
  if (motion.startX !== undefined) {
    u.x = lerp(motion.startX, element.x);
  }
  if (motion.startY !== undefined) {
    u.y = lerp(motion.startY, element.y);
  }

  // ─── 크기 — 센터 기준 스케일 ───
  // 최종 상태의 센터를 기준으로 크기가 변하면 위치도 자동 보정
  const finalCx = element.x + element.width / 2;
  const finalCy = element.y + element.height / 2;

  if (element.type === 'text' && motion.startFontSize !== undefined) {
    // 텍스트: fontSize 비율로 바운딩 박스도 비례 스케일
    const curFontSize = lerp(motion.startFontSize, element.fontSize);
    u.fontSize = curFontSize;
    const scale = element.fontSize > 0 ? curFontSize / element.fontSize : 1;
    const curW = element.width * scale;
    const curH = element.height * scale;
    u.width = curW;
    u.height = curH;
    // 센터 유지 (startX/Y 가 없을 때만 자동 보정)
    if (motion.startX === undefined) u.x = finalCx - curW / 2;
    if (motion.startY === undefined) u.y = finalCy - curH / 2;
  } else {
    // 4면 개별 스케일 (사각 도형 전용) — startLeftW/startRightW/startTopH/startBottomH
    const has4Side =
      motion.startLeftW !== undefined ||
      motion.startRightW !== undefined ||
      motion.startTopH !== undefined ||
      motion.startBottomH !== undefined;

    if (has4Side) {
      // 최종 반쪽 크기
      const finalHalfW = element.width / 2;
      const finalHalfH = element.height / 2;
      // 각 면 보간 (미지정 면은 최종값 유지)
      const curLeftW   = motion.startLeftW   !== undefined ? lerp(motion.startLeftW,   finalHalfW) : finalHalfW;
      const curRightW  = motion.startRightW  !== undefined ? lerp(motion.startRightW,  finalHalfW) : finalHalfW;
      const curTopH    = motion.startTopH    !== undefined ? lerp(motion.startTopH,    finalHalfH) : finalHalfH;
      const curBottomH = motion.startBottomH !== undefined ? lerp(motion.startBottomH, finalHalfH) : finalHalfH;
      // 새 x, y, width, height 계산
      u.x = finalCx - curLeftW;
      u.y = finalCy - curTopH;
      u.width = curLeftW + curRightW;
      u.height = curTopH + curBottomH;
      // startX/Y 가 있으면 위치를 오버라이드 (이동 + 4면 스케일 조합)
      if (motion.startX !== undefined) u.x = lerp(motion.startX, element.x);
      if (motion.startY !== undefined) u.y = lerp(motion.startY, element.y);
    } else {
      // 도형/이미지: width, height 직접 보간 + 센터 유지
      const curW = motion.startWidth !== undefined ? lerp(motion.startWidth, element.width) : element.width;
      const curH = motion.startHeight !== undefined ? lerp(motion.startHeight, element.height) : element.height;
      if (motion.startWidth !== undefined) {
        u.width = curW;
        if (motion.startX === undefined) u.x = finalCx - curW / 2;
      }
      if (motion.startHeight !== undefined) {
        u.height = curH;
        if (motion.startY === undefined) u.y = finalCy - curH / 2;
      }
    }
  }

  // 회전
  if (motion.startRotation !== undefined) {
    u.rotation = lerp(motion.startRotation, element.rotation);
  }

  // 색상 — 텍스트는 color, 도형은 fill
  if (motion.startColor !== undefined) {
    if (element.type === 'text') {
      u.color = lerpColor(motion.startColor, element.color, t);
    } else if (element.type === 'shape') {
      u.fill = lerpColor(motion.startColor, element.fill, t);
    }
  }

  // 투명도
  if (motion.startOpacity !== undefined) {
    u.opacity = lerp(motion.startOpacity, element.opacity);
  }

  return { ...element, ...updates } as CanvasElement;
}

/**
 * 전체 요소 배열에 모션 보간 적용
 * @param elements 최종 상태 요소 배열
 * @param elapsed  경과 시간 (초)
 * @returns 보간된 요소 배열
 */
export function interpolateElements(
  elements: CanvasElement[],
  elapsed: number,
): CanvasElement[] {
  return elements.map((el) => {
    if (!el.motion) return el;
    return interpolateElement(el, el.motion, elapsed);
  });
}

/**
 * 요소 배열에 모션이 설정된 요소가 하나라도 있는지 확인
 */
export function hasMotion(elements: CanvasElement[]): boolean {
  return elements.some((el) => {
    if (!el.motion) return false;
    const m = el.motion;
    return (
      m.startX !== undefined ||
      m.startY !== undefined ||
      m.startWidth !== undefined ||
      m.startHeight !== undefined ||
      m.startColor !== undefined ||
      m.startRotation !== undefined ||
      m.startOpacity !== undefined ||
      m.startFontSize !== undefined ||
      m.startLeftW !== undefined ||
      m.startRightW !== undefined ||
      m.startTopH !== undefined ||
      m.startBottomH !== undefined
    );
  });
}

/**
 * 모션이 있는 요소들의 최대 duration 반환 (초)
 */
export function maxMotionDuration(elements: CanvasElement[]): number {
  let max = 0;
  for (const el of elements) {
    if (el.motion) {
      // 시퀀스 종료 시간 기준 (하위호환: endTime 없으면 duration)
      const end = el.motion.endTime ?? (el.motion.startTime ?? 0) + (el.motion.duration ?? 1);
      if (end > max) max = end;
    }
  }
  return max;
}
