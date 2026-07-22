// 모션 프리셋 — 최종 상태(현재 디자인)는 건드리지 않고 시작값만 자동 입력

import { CanvasElement, MotionConfig } from '@/lib/canvasTypes';

export interface MotionPreset {
  id: string;
  label: string;
  /** 최종 상태 요소를 받아 모션 시작값을 계산 (기존 타이밍·시퀀스는 호출부가 보존) */
  apply: (el: CanvasElement) => Partial<MotionConfig>;
}

/** 슬라이드 이동 거리 (%) */
const SLIDE_OFFSET = 18;
/** 줌인 시작 배율 */
const ZOOM_SCALE = 0.5;
/** 팝 시작 배율 */
const POP_SCALE = 0.4;

function zoomStart(el: CanvasElement, scale: number): Partial<MotionConfig> {
  if (el.type === 'text') {
    return { startFontSize: Math.max(1, Math.round(el.fontSize * scale)) };
  }
  return { startWidth: el.width * scale, startHeight: el.height * scale };
}

export const MOTION_PRESETS: MotionPreset[] = [
  {
    id: 'fade',
    label: '페이드인',
    apply: () => ({ startOpacity: 0, easing: 'ease-out' }),
  },
  {
    id: 'slide-from-left',
    label: '왼쪽에서',
    apply: (el) => ({ startX: el.x - SLIDE_OFFSET, startOpacity: 0, easing: 'ease-out' }),
  },
  {
    id: 'slide-from-right',
    label: '오른쪽에서',
    apply: (el) => ({ startX: el.x + SLIDE_OFFSET, startOpacity: 0, easing: 'ease-out' }),
  },
  {
    id: 'slide-from-bottom',
    label: '아래에서',
    apply: (el) => ({ startY: el.y + SLIDE_OFFSET, startOpacity: 0, easing: 'ease-out' }),
  },
  {
    id: 'slide-from-top',
    label: '위에서',
    apply: (el) => ({ startY: el.y - SLIDE_OFFSET, startOpacity: 0, easing: 'ease-out' }),
  },
  {
    id: 'zoom-in',
    label: '줌인',
    apply: (el) => ({ ...zoomStart(el, ZOOM_SCALE), startOpacity: 0, easing: 'ease-out' }),
  },
  {
    id: 'pop',
    label: '팝 (튕김)',
    apply: (el) => ({ ...zoomStart(el, POP_SCALE), easing: 'bounce' }),
  },
];
