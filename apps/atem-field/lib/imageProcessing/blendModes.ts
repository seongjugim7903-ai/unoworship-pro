/**
 * lib/imageProcessing/blendModes.ts
 * 포토샵 스타일 블렌드 모드 정의
 *
 * Canvas 2D globalCompositeOperation 을 그대로 활용.
 * 별도 연산 없이 브라우저 GPU 가속으로 실시간 적용.
 */

export interface BlendModeInfo {
  /** Canvas globalCompositeOperation 값 */
  value: GlobalCompositeOperation;
  /** 한글 라벨 */
  label: string;
  /** 분류 그룹 */
  group: '기본' | '어둡게' | '밝게' | '대비' | '비교' | '색상';
}

/** 포토샵 인기 블렌드 모드 — 실무에서 가장 많이 사용되는 15종 */
export const BLEND_MODES: BlendModeInfo[] = [
  // ── 기본 ──
  { value: 'source-over',  label: '기본 (Normal)',    group: '기본' },

  // ── 어둡게 계열 ──
  { value: 'darken',       label: '어둡게',           group: '어둡게' },
  { value: 'multiply',     label: '곱하기',           group: '어둡게' },
  { value: 'color-burn',   label: '색상 번',          group: '어둡게' },

  // ── 밝게 계열 ──
  { value: 'lighten',      label: '밝게',             group: '밝게' },
  { value: 'screen',       label: '스크린',           group: '밝게' },
  { value: 'color-dodge',  label: '색상 닷지',        group: '밝게' },

  // ── 대비 계열 ──
  { value: 'overlay',      label: '오버레이',         group: '대비' },
  { value: 'soft-light',   label: '소프트 라이트',     group: '대비' },
  { value: 'hard-light',   label: '하드 라이트',       group: '대비' },

  // ── 비교 계열 ──
  { value: 'difference',   label: '차이',             group: '비교' },
  { value: 'exclusion',    label: '제외',             group: '비교' },

  // ── 색상 계열 ──
  { value: 'hue',          label: '색조',             group: '색상' },
  { value: 'saturation',   label: '채도',             group: '색상' },
  { value: 'color',        label: '색상',             group: '색상' },
  { value: 'luminosity',   label: '광도',             group: '색상' },
];

/** 기본 블렌드 모드 */
export const DEFAULT_BLEND_MODE: GlobalCompositeOperation = 'source-over';
