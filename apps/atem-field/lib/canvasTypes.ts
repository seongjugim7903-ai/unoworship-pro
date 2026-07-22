/**
 * canvasTypes.ts
 * 에디터 캔버스의 모든 요소 타입 정의
 * 위치·크기는 캔버스 % 기준 (0~100), 해상도 독립적
 */

// ─────────────────────────────────────────
// 그라데이션
// ─────────────────────────────────────────
export interface GradientStop {
  offset: number;   // 0~1
  color: string;    // hex
}

export interface GradientConfig {
  type: 'linear' | 'radial';
  angle: number;            // degrees (linear 전용)
  stops: GradientStop[];
}

export const DEFAULT_GRADIENT: GradientConfig = {
  type: 'linear',
  angle: 90,
  stops: [
    { offset: 0, color: '#3b82f6' },
    { offset: 1, color: '#8b5cf6' },
  ],
};

// ─────────────────────────────────────────
// 공통 베이스
// ─────────────────────────────────────────
/** 그라데이션 마스크 — 포토샵 레이어 마스크 스타일 (흰=보임, 검=투명) */
export interface GradientMaskConfig {
  enabled: boolean;
  type: 'linear' | 'radial';
  angle: number;           // degrees (0=→, 90=↓, 180=←, 270=↑)
  /** 마스크 스탑: offset(0~1), opacity(0=검정/투명, 1=흰/불투명) */
  stops: { offset: number; opacity: number }[];
}

export const DEFAULT_GRADIENT_MASK: GradientMaskConfig = {
  enabled: false,
  type: 'linear',
  angle: 0,
  stops: [
    { offset: 0, opacity: 1 },
    { offset: 1, opacity: 0 },
  ],
};

export interface BaseElement {
  id: string;
  type: ElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  zIndex: number;
  locked: boolean;
  visible: boolean;
  /** 모션 설정 — 시작 상태 → 최종 상태(현재 값) 전환 */
  motion?: MotionConfig;
  /** 소프트 브러시 지우개 마스크 (data URL) — 흰색=보임, 투명=지워짐 */
  eraserMask?: string;
  /** 클리핑 마스크: 이 요소가 다른 요소의 형태로 잘림. 마스크 역할 요소의 ID */
  clipMaskId?: string;
  /** 그라데이션 마스크 (포토샵 레이어 마스크) */
  gradientMask?: GradientMaskConfig;
  /** ProPresenter식 논리 레이어 분류. 렌더 순서는 zIndex가 담당하고, 이 값은 운영/라우팅 용도다. */
  layerRole?: CanvasLayerRole;
  /** 섹션이 바뀌어도 계속 송출되는 고정 레이어 요소 */
  fixedLayer?: boolean;
  /** 시스템 기본 스크린 마스크 프리셋 식별자 */
  screenMaskPreset?: 'safe-area';
  /** 이 요소를 표시할 출력 대상. 비어 있거나 없으면 기존 호환을 위해 모든 출력에 표시한다. */
  visibleOn?: CanvasRenderTarget[];
}

export type ElementType = 'text' | 'shape' | 'image' | 'video';

// ─────────────────────────────────────────
// ProPresenter식 논리 레이어/출력 라우팅
// ─────────────────────────────────────────
export type CanvasLayerRole =
  | 'background'
  | 'live-video'
  | 'lyrics'
  | 'props'
  | 'lower-third'
  | 'prompt-only'
  | 'mask';

export type CanvasRenderTarget = 'output' | 'prompt' | 'broadcast';

export const DEFAULT_RENDER_TARGETS: CanvasRenderTarget[] = ['output', 'prompt', 'broadcast'];

export const CANVAS_LAYER_ROLE_OPTIONS: { value: CanvasLayerRole; label: string }[] = [
  { value: 'background', label: '배경' },
  { value: 'live-video', label: '라이브 영상' },
  { value: 'lyrics', label: '가사/본문' },
  { value: 'props', label: '고정 요소' },
  { value: 'lower-third', label: '하단 자막' },
  { value: 'prompt-only', label: '프롬프트 전용' },
  { value: 'mask', label: '마스크' },
];

export const CANVAS_RENDER_TARGET_OPTIONS: { value: CanvasRenderTarget; label: string; shortLabel: string }[] = [
  { value: 'output', label: '회중 / 강대상 (Output 1)', shortLabel: '회중' },
  { value: 'prompt', label: '무대 / 찬양팀·목사 (Output 2)', shortLabel: '무대' },
  { value: 'broadcast', label: '방송 / 미러', shortLabel: '방송' },
];

export function getDefaultLayerRoleForElement(el: Pick<BaseElement, 'type'>): CanvasLayerRole {
  if (el.type === 'text') return 'lyrics';
  if (el.type === 'video') return 'live-video';
  return 'props';
}

export function getElementVisibleOn(el: Pick<BaseElement, 'visibleOn'>): CanvasRenderTarget[] {
  return el.visibleOn && el.visibleOn.length > 0
    ? el.visibleOn
    : DEFAULT_RENDER_TARGETS;
}

export function isElementVisibleOn(
  el: Pick<BaseElement, 'visibleOn'>,
  target?: CanvasRenderTarget,
): boolean {
  if (!target) return true;
  return getElementVisibleOn(el).includes(target);
}

export function hasCustomRenderTargets(elements: Pick<BaseElement, 'visibleOn'>[]): boolean {
  return elements.some((el) => {
    if (!el.visibleOn || el.visibleOn.length === 0) return false;
    return (
      el.visibleOn.length !== DEFAULT_RENDER_TARGETS.length ||
      DEFAULT_RENDER_TARGETS.some((target) => !el.visibleOn?.includes(target))
    );
  });
}

// ─────────────────────────────────────────
// 텍스트 요소
// ─────────────────────────────────────────
/** 텍스트 그림자 설정 */
export interface TextShadowConfig {
  color: string;    // hex + alpha
  offsetX: number;  // px
  offsetY: number;  // px
  blur: number;     // px
}

export const DEFAULT_TEXT_SHADOW: TextShadowConfig = {
  color: '#00000080',
  offsetX: 2,
  offsetY: 2,
  blur: 4,
};

/** 도형/이미지 박스 쉐도우 설정 (CSS box-shadow 대응) */
export interface BoxShadowConfig {
  color: string;    // hex + alpha
  offsetX: number;  // px
  offsetY: number;  // px
  blur: number;     // px
  spread: number;   // px
}

export const DEFAULT_BOX_SHADOW: BoxShadowConfig = {
  color: '#00000066',
  offsetX: 4,
  offsetY: 4,
  blur: 12,
  spread: 0,
};

/** 외부 광채 (Outer Glow) — 알파 채널을 따라 빛나는 효과 */
export interface OuterGlowConfig {
  color: string;      // hex + alpha
  blur: number;       // px (0~100)
  intensity: number;  // 반복 횟수 (1~5) — 높을수록 강한 발광
}

export const DEFAULT_OUTER_GLOW: OuterGlowConfig = {
  color: '#ffffff99',
  blur: 15,
  intensity: 2,
};

export interface TextElement extends BaseElement {
  type: 'text';
  content: string;
  linked: boolean;
  /** 자막 템플릿: 이 텍스트가 채울 콘텐츠 필드 역할(body/reference/book/chapter/verse/title 등). 없으면 정적(고정) 텍스트. */
  fieldRole?: string;
  fontFamily: string;
  fontSize: number;
  /** 폰트 두께 — 숫자(100~900) 또는 구 데이터 'normal'(=400)/'bold'(=700). 폰트별 지원 두께는 webFonts.getFontWeights */
  fontWeight: number | 'normal' | 'bold';
  fontStyle: 'normal' | 'italic';
  textAlign: 'left' | 'center' | 'right';
  verticalAlign: 'top' | 'middle' | 'bottom';
  lineHeight: number;
  letterSpacing: number;
  color: string;
  strokeColor: string;
  strokeWidth: number;
  useGradient: boolean;
  gradient: GradientConfig;
  /** 피그마 텍스트 사이징: 너비 자동 맞춤 (수동 리사이즈 시 false) */
  autoWidth: boolean;
  /** 피그마 텍스트 사이징: 높이 자동 맞춤 (수동 리사이즈 시 false) */
  autoHeight: boolean;
  /** 자막 자동 맞춤: 텍스트가 박스를 넘치면 폰트를 줄여 박스(폭·높이) 안에 맞춘다. 송출·미리보기 렌더에 적용. */
  autoFit?: boolean;
  /** 텍스트 그림자 (드롭 쉐도우) */
  useShadow?: boolean;
  shadow?: TextShadowConfig;
}

// ─────────────────────────────────────────
// 도형 요소
// ─────────────────────────────────────────
export type ShapeType = 'rect' | 'ellipse' | 'roundRect' | 'line';

/** 도형 이미지 채우기 (피그마 스타일) */
export interface ImageFillConfig {
  src: string;                          // Base64 data URL
  mode: 'fit-width' | 'fit-height';    // 기본: fit-width
  offsetX: number;                      // 0–1 (fit-height 모드에서 좌우 위치)
  offsetY: number;                      // 0–1 (fit-width 모드에서 상하 위치)
}

export interface ShapeElement extends BaseElement {
  type: 'shape';
  shapeType: ShapeType;
  fill: string;
  fillOpacity: number;
  stroke: string;
  strokeWidth: number;
  /** 전체 코너 래디우스 (4코너 동일) */
  cornerRadius: number;
  /** 개별 코너 래디우스 [topLeft, topRight, bottomRight, bottomLeft] — 설정 시 cornerRadius 무시 */
  cornerRadii?: [number, number, number, number];
  useGradient: boolean;
  gradient: GradientConfig;
  /** 이미지 채우기 — 설정 시 색상/그라데이션 대신 이미지로 도형 채움 */
  imageFill?: ImageFillConfig;
  /** 드롭 쉐도우 */
  useShadow?: boolean;
  shadow?: BoxShadowConfig;
  /** 외부 광채 */
  useGlow?: boolean;
  glow?: OuterGlowConfig;
}

/** 코너 래디우스 4개 값 반환 헬퍼 [TL, TR, BR, BL] */
export function resolveCornerRadii(el: { cornerRadius?: number; cornerRadii?: [number, number, number, number] }): [number, number, number, number] {
  if (el.cornerRadii) return el.cornerRadii;
  const r = el.cornerRadius ?? 0;
  return [r, r, r, r];
}

// ─────────────────────────────────────────
// 이미지 요소
// ─────────────────────────────────────────
export interface ImageElement extends BaseElement {
  type: 'image';
  src: string;
  objectFit: 'cover' | 'contain' | 'fill';
  /**
   * ATEM DSK/Luma Key용 이미지 출력 모드.
   * luma-invert는 레거시 이름이며, 실제 동작은 어두운 글자/악보선을 흰색으로 추출하고 나머지를 검정으로 만든다.
   */
  keyMode?: 'none' | 'luma-invert';
  /** 원본 이미지 정보. 인쇄 캔버스에서 현재 배치 크기 대비 유효 DPI를 계산할 때 사용 */
  imageMeta?: {
    sourceName?: string;
    naturalWidthPx: number;
    naturalHeightPx: number;
    assumedDpi?: number;
    hasEmbeddedDpi?: boolean;
  };
  /** 포토샵 스타일 블렌드 모드 (Canvas globalCompositeOperation) */
  blendMode?: GlobalCompositeOperation;
  /** 전체 코너 래디우스 */
  cornerRadius?: number;
  /** 개별 코너 래디우스 [topLeft, topRight, bottomRight, bottomLeft] */
  cornerRadii?: [number, number, number, number];
  /** 도형 테두리 (이미지에도 적용) */
  stroke?: string;
  strokeWidth?: number;
  /** 드롭 쉐도우 */
  useShadow?: boolean;
  shadow?: BoxShadowConfig;
  /** 외부 광채 */
  useGlow?: boolean;
  glow?: OuterGlowConfig;
}

// ─────────────────────────────────────────
// 영상 요소
// ─────────────────────────────────────────
export interface VideoElement extends BaseElement {
  type: 'video';
  src: string;
  youtubeId?: string;     // 유튜브 영상 ID (있으면 iframe 임베드)
  thumbnailUrl?: string;  // 유튜브 썸네일 URL
  loop: boolean;
  muted: boolean;
  autoplay: boolean;
}

// ─────────────────────────────────────────
// 모션 (2-Keyframe Transition)
// ─────────────────────────────────────────
export type MotionEasing =
  | 'linear'
  | 'ease-in'
  | 'ease-out'
  | 'ease-in-out'
  | 'bounce';

/** 요소별 모션 시작 상태 — 입력된 속성만 애니메이션 적용 */
export interface MotionConfig {
  /** @deprecated duration 대신 startTime + endTime 사용. 하위호환용 유지 */
  duration: number;
  /** 시퀀스 시작 시간 (초). 0 = 즉시 시작 */
  startTime: number;
  /** 시퀀스 종료 시간 (초). startTime + 전환시간 */
  endTime: number;
  /** 시퀀스 번호 (선택 순서). 1부터 시작, 미지정이면 0 */
  sequence: number;
  /** 가감속 */
  easing: MotionEasing;
  /** 시작 위치 (%) — 미입력 시 undefined → 애니메이션 없음 */
  startX?: number;
  startY?: number;
  /** 시작 크기 (%) */
  startWidth?: number;
  startHeight?: number;
  /** 시작 색상 (hex) — 텍스트·도형의 주 색상 */
  startColor?: string;
  /** 시작 회전 (deg) */
  startRotation?: number;
  /** 시작 투명도 (0~1) */
  startOpacity?: number;
  /** 시작 폰트 크기 (px) — 텍스트 전용 */
  startFontSize?: number;
  /** 4면 개별 스케일 — 사각 도형 전용 (센터 기준 반쪽 크기, %) */
  startLeftW?: number;    // 좌측 반쪽 너비
  startRightW?: number;   // 우측 반쪽 너비
  startTopH?: number;     // 상단 반쪽 높이
  startBottomH?: number;  // 하단 반쪽 높이
}

export const DEFAULT_MOTION: MotionConfig = {
  duration: 1,
  startTime: 0,
  endTime: 1,
  sequence: 0,
  easing: 'ease-out',
};

// ─────────────────────────────────────────
// 통합 유니온 타입
// ─────────────────────────────────────────
export type CanvasElement =
  | TextElement
  | ShapeElement
  | ImageElement
  | VideoElement;

// ─────────────────────────────────────────
// 팩토리 함수
// ─────────────────────────────────────────
function baseDefaults(overrides?: Partial<BaseElement>): Omit<BaseElement, 'type'> {
  return {
    id: `el-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    x: 10, y: 10, width: 80, height: 20,
    rotation: 0, opacity: 1,
    zIndex: 0, locked: false, visible: true,
    layerRole: 'props',
    fixedLayer: false,
    visibleOn: [...DEFAULT_RENDER_TARGETS],
    ...overrides,
  };
}

export function createTextElement(overrides?: Partial<TextElement>): TextElement {
  return {
    ...baseDefaults({
      x: 10, y: 10,
      // 초기 크기: "여기에 텍스트 입력" 48px bold 기준 ≈ 450px × 70px → %로 환산
      // 1920×1080 기준 → width ≈ 25%, height ≈ 6.5%
      width: 25,
      height: 6.5,
      ...overrides,
    }),
    type: 'text',
    layerRole: 'lyrics',
    content: '',
    linked: true,
    fontFamily: 'Noto Sans KR',
    fontSize: 48,
    fontWeight: 'bold',
    fontStyle: 'normal',
    textAlign: 'left',       // 피그마 기본: 좌측 정렬
    verticalAlign: 'top',    // 피그마 기본: 상단 정렬
    lineHeight: 1.3,
    letterSpacing: 0,
    color: '#ffffff',
    strokeColor: '#000000',
    strokeWidth: 4,
    useGradient: false,
    gradient: { ...DEFAULT_GRADIENT },
    autoWidth: true,
    autoHeight: true,
    ...overrides,
  };
}

export function createShapeElement(overrides?: Partial<ShapeElement>): ShapeElement {
  return {
    ...baseDefaults({ x: 20, y: 60, width: 60, height: 20, ...overrides }),
    type: 'shape',
    shapeType: 'rect',
    fill: '#000000',
    fillOpacity: 1,
    stroke: 'transparent',
    strokeWidth: 0,
    cornerRadius: 0,
    useGradient: false,
    gradient: { ...DEFAULT_GRADIENT },
    ...overrides,
  };
}

export function createImageElement(overrides?: Partial<ImageElement>): ImageElement {
  return {
    ...baseDefaults({ x: 10, y: 10, width: 40, height: 40, ...overrides }),
    type: 'image',
    src: '',
    objectFit: 'fill',
    ...overrides,
  };
}
