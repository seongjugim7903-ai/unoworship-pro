import { CanvasElement, CanvasLayerRole, TextElement } from './canvasTypes';

// ── 섹션 텍스트 추출 헬퍼 ──────────────────────────────────────────────────
// section.text 가 비어있으면 캔버스 텍스트 요소(el.content)에서 가사를 추출.
// 프롬프트 레이아웃 등 section 의 "표시 텍스트"가 필요한 곳에서 사용.
export function extractSectionDisplayText(section: { text: string; elements: CanvasElement[] }): string {
  if (section.text) return section.text;
  // section.text 가 비어있으면 텍스트 요소의 content 에서 추출
  return section.elements
    .filter((el): el is TextElement => el.type === 'text' && el.visible !== false)
    .map((el) => el.content)
    .filter(Boolean)
    .join('\n');
}

// ── 프롬프트 모니터 레이아웃 ────────────────────────────────────────────────
// 각 세트리스트 아이템별로 프롬프트 모니터에 다른 레이아웃을 선택할 수 있음.
// 'none' = 강대상과 동일 (기본값)
export type BuiltInPromptLayoutType =
  | 'none'
  | 'black-white'      // 블랙바탕 흰색글자 (가사 전용)
  | 'scripture'        // 말씀본문 — 본문 중앙 크게 + 아래→위 슬라이드 [FEATURE: SCRIPTURE_PMT]
  | 'youtube-dance'    // 안무영상 (향후)
  | 'bible'            // 성경본문 (향후)
  | 'layout4'          // 예비 4
  | 'layout5';         // 예비 5

/** 디자인 등록 모달에서 생성되는 중층 모니터 커스텀 레이아웃 ID */
export type CustomPromptLayoutType = `prompt-${string}`;

export type PromptLayoutType = BuiltInPromptLayoutType | CustomPromptLayoutType;

export type PromptSendMode =
  | 'normal'
  | 'prompt-only';

export type SectionCueOutputTarget =
  | 'default'
  | 'all'
  | 'output'
  | 'prompt'
  | 'broadcast';

export type SectionCueBlackoutAction =
  | 'auto-off'
  | 'keep'
  | 'on';

export type SectionCuePromptLayout =
  | 'program-default'
  | BuiltInPromptLayoutType;

export type SectionCueTransitionType =
  | 'default'
  | 'cut'
  | 'fade'
  | 'slide'
  | 'dip-to-black';

export interface SectionCueMacro {
  enabled: boolean;
  outputTarget?: SectionCueOutputTarget;
  blackout?: SectionCueBlackoutAction;
  promptLayout?: SectionCuePromptLayout;
  transition?: {
    type: SectionCueTransitionType;
    duration: number;
  };
  hiddenLayerRoles?: CanvasLayerRole[];
}

export interface SubtitleStyle {
  /* ── 텍스트 ─────────────────── */
  fontFamily:    string;
  fontSize:      number;
  color:         string;
  fontWeight:    'normal' | 'bold';
  fontStyle:     'normal' | 'italic';
  textAlign:     'left' | 'center' | 'right';
  lineHeight:    number;   // 배수 (1.0 ~ 2.5)
  letterSpacing: number;   // px

  /* ── 외곽선 ─────────────────── */
  strokeColor: string;
  strokeWidth: number;

  /* ── 위치 ───────────────────── */
  positionX: number;   // 0.0 (좌) ~ 1.0 (우)
  positionY: number;   // 0.0 (상) ~ 1.0 (하)

  /* ── 배경 바 ────────────────── */
  backgroundBar:     boolean;
  backgroundBarColor: string;
  backgroundOpacity: number;

  /* ── 전체 투명도 ─────────────── */
  opacity: number;     // 0.0 ~ 1.0
}

export interface Section {
  id: string;
  label: string;
  text: string;
  colorMark: string;
  elements: CanvasElement[];   // 이 섹션의 캔버스 요소 목록
  cueMacro?: SectionCueMacro;   // 섹션 송출 시 함께 실행되는 Cue/Macro 설정
  workspaceRole?: 'layer-output-editor' | 'program-background';
  bookmarked?: boolean;         // 책갈피 표시(후렴 등 빠른 이동용) — 카드 우상단 원 마커
}

export interface SetlistItem {
  id: string;
  title: string;
  sections: Section[];
  style?: Partial<SubtitleStyle>;
  promptLayout?: PromptLayoutType;  // 프롬프트 모니터 레이아웃 오버라이드
  promptSendMode?: PromptSendMode;  // normal=전체 송출, prompt-only=프롬프트 모니터 전용 송출
  workspaceRole?: 'layer-output-editor';
  /** 켜면 프로그램 배경 모션/시퀀스를 첫 콘텐츠 섹션에서만 1회 재생(이후 섹션은 정적). */
  backgroundMotionOnce?: boolean;
  /** [FEATURE: HIDDEN_SCRIPTURE] 말씀찾기(본문) 숨김 프로그램 — 리스트에 숨기고 송출 중에만 표시. features/hidden-scripture 참조. */
  hiddenScripture?: boolean;
}

export interface Setlist {
  id: string;
  name: string;
  date: string;
  items: SetlistItem[];
  createdAt: number;
}

// ─── ATEM 연동 설정 ──────────────────────────────────────────────────────────

export interface AtemSettings {
  /** ATEM 연동 활성화 여부 */
  enabled: boolean;
  /** ATEM 스위처 IP 주소 */
  ip: string;
  /** 자막 미디어 풀 슬롯 (0-based) */
  mediaSlot: number;
  /** DSK 번호 (0-based) */
  dskIndex: number;
}

export const DEFAULT_ATEM_SETTINGS: AtemSettings = {
  enabled: false,
  ip: '192.168.0.100',
  mediaSlot: 0,
  dskIndex: 0,
};

// ─── 앱 전역 상태 ─────────────────────────────────────────────────────────────

export interface AppState {
  currentSetlistId: string | null;
  activeItemId:     string | null;
  activeSectionId:  string | null;
  isBlackout:       boolean;
  isOutputConnected: boolean;
  globalStyle:      SubtitleStyle;
  /** ATEM 스위처 연동 설정 */
  atemSettings:     AtemSettings;
  /** 모션 편집 모드 활성 여부 */
  isMotionMode:     boolean;
}

export const DEFAULT_SUBTITLE_STYLE: SubtitleStyle = {
  fontFamily:         'Noto Sans KR',
  fontSize:           48,
  color:              '#ffffff',
  fontWeight:         'bold',
  fontStyle:          'normal',
  textAlign:          'center',
  lineHeight:         1.3,
  letterSpacing:      0,
  strokeColor:        '#000000',
  strokeWidth:        4,
  positionX:          0.5,
  positionY:          0.75,
  backgroundBar:      false,
  backgroundBarColor: '#000000',
  backgroundOpacity:  0.5,
  opacity:            1.0,
};
