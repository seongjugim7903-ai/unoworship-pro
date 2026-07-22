/**
 * settingsTypes.ts
 * 설정(Settings) 도메인 타입 정의
 *
 * 카테고리별로 분리 — 추후 각 카테고리는 독립적으로 확장 가능.
 * Broadcast 등 특정 도메인 전용 설정은 해당 도메인 store에 유지하고,
 * 여기서는 UI·UX 및 크로스컷팅(cross-cutting) 설정만 다룬다.
 */

// ─────────────────────────────────────────
// 설정 카테고리 키
// ─────────────────────────────────────────
export type SettingsCategory =
  | 'general'
  | 'editor'
  | 'output'
  | 'broadcast'
  | 'shortcuts'
  | 'about';

// ─────────────────────────────────────────
// 일반 (General)
// ─────────────────────────────────────────
export type AppTheme = 'dark' | 'light' | 'system';
export type AppLanguage = 'ko' | 'en';

export interface GeneralSettings {
  language: AppLanguage;
  theme: AppTheme;
  /** 자동 저장 간격 (초). 0 = 비활성화 */
  autoSaveInterval: number;
  /** 시작 시 마지막 워십 자동 로드 */
  restoreLastSession: boolean;
}

export const DEFAULT_GENERAL_SETTINGS: GeneralSettings = {
  language: 'ko',
  theme: 'dark',
  autoSaveInterval: 30,
  restoreLastSession: true,
};

// ─────────────────────────────────────────
// 에디터 (Editor)
// ─────────────────────────────────────────
export interface EditorSettings {
  /** 그리드 표시 */
  showGrid: boolean;
  /** 스마트 가이드 표시 (요소 간 정렬 가이드) */
  showSmartGuides: boolean;
  /** 요소 스냅 (드래그/리사이즈 시) */
  snapEnabled: boolean;
  /** 스냅 임계값 (px) */
  snapThreshold: number;
  /** 화살표 넛지 단위 (%) */
  nudgeUnit: number;
  /** Shift + 화살표 넛지 단위 (%) */
  nudgeUnitLarge: number;
  /** 텍스트 편집 완료 시 빈 텍스트 자동 삭제 */
  autoDeleteEmptyText: boolean;
}

export const DEFAULT_EDITOR_SETTINGS: EditorSettings = {
  showGrid: false,
  showSmartGuides: true,
  snapEnabled: true,
  snapThreshold: 6,
  nudgeUnit: 0.1,
  nudgeUnitLarge: 1,
  autoDeleteEmptyText: true,
};

// ─────────────────────────────────────────
// 아웃풋 (Output) — 송출 창(Output Window) 관련
// ─────────────────────────────────────────
export type OutputResolution = '1080p' | '720p' | '4k';
export type OutputTransition = 'none' | 'fade' | 'slide' | 'cut';

export interface OutputSettings {
  resolution: OutputResolution;
  /** 풀스크린으로 띄울 모니터 인덱스 (-1 = 미지정) */
  fullscreenMonitor: number;
  /** 섹션 전환 효과 */
  transition: OutputTransition;
  /** 전환 지속시간 (ms) */
  transitionDuration: number;
  /** 아웃풋 배경색 (요소 없는 영역) */
  backgroundColor: string;
}

export const DEFAULT_OUTPUT_SETTINGS: OutputSettings = {
  resolution: '1080p',
  fullscreenMonitor: -1,
  transition: 'fade',
  transitionDuration: 300,
  backgroundColor: '#000000',
};

// ─────────────────────────────────────────
// 송출 (Broadcast) — 글로벌 정책 (세부 설정은 broadcastStore)
// ─────────────────────────────────────────
export interface BroadcastGlobalSettings {
  /** 라이브 종료 전 확인 대화상자 */
  confirmOnStopLive: boolean;
  /** 녹화 종료 시 자동 다운로드 */
  autoDownloadRecording: boolean;
  /** 라이브 연결 실패 시 자동 재연결 */
  autoReconnect: boolean;
  /** 자동 재연결 시도 횟수 */
  reconnectAttempts: number;
}

export const DEFAULT_BROADCAST_GLOBAL_SETTINGS: BroadcastGlobalSettings = {
  confirmOnStopLive: true,
  autoDownloadRecording: true,
  autoReconnect: true,
  reconnectAttempts: 3,
};

// ─────────────────────────────────────────
// 단축키 (Shortcuts) — 현재는 참조용, 커스터마이즈는 Phase 2
// ─────────────────────────────────────────
export interface ShortcutEntry {
  id: string;
  label: string;
  /** 예: "Ctrl+Z", "Shift+ArrowLeft" */
  keys: string;
  category: 'edit' | 'selection' | 'transform' | 'broadcast' | 'view';
}

// ─────────────────────────────────────────
// 전체 Settings 상태
// ─────────────────────────────────────────
export interface SettingsState {
  general: GeneralSettings;
  editor: EditorSettings;
  output: OutputSettings;
  broadcastGlobal: BroadcastGlobalSettings;
}

export const DEFAULT_SETTINGS_STATE: SettingsState = {
  general: { ...DEFAULT_GENERAL_SETTINGS },
  editor: { ...DEFAULT_EDITOR_SETTINGS },
  output: { ...DEFAULT_OUTPUT_SETTINGS },
  broadcastGlobal: { ...DEFAULT_BROADCAST_GLOBAL_SETTINGS },
};
