/**
 * settingsStore.ts
 * 설정(Settings) 전용 Zustand 스토어
 *
 * UnoLive 기존 store(lib/store.ts)와 독립적으로 동작:
 * - localStorage persist로 사용자 설정 유지
 * - 카테고리별 update 액션 제공
 * - 카테고리별 reset 액션 제공
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import {
  SettingsState,
  GeneralSettings,
  EditorSettings,
  OutputSettings,
  BroadcastGlobalSettings,
  DEFAULT_SETTINGS_STATE,
  DEFAULT_GENERAL_SETTINGS,
  DEFAULT_EDITOR_SETTINGS,
  DEFAULT_OUTPUT_SETTINGS,
  DEFAULT_BROADCAST_GLOBAL_SETTINGS,
} from './settingsTypes';

// ─────────────────────────────────────────
// 노옵 스토리지 (SSR 가드)
// ─────────────────────────────────────────
const noopStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

// ─────────────────────────────────────────
// Store 인터페이스
// ─────────────────────────────────────────
interface SettingsStoreState extends SettingsState {
  // ── update 액션 ──
  updateGeneral: (patch: Partial<GeneralSettings>) => void;
  updateEditor: (patch: Partial<EditorSettings>) => void;
  updateOutput: (patch: Partial<OutputSettings>) => void;
  updateBroadcastGlobal: (patch: Partial<BroadcastGlobalSettings>) => void;

  // ── reset 액션 ──
  resetGeneral: () => void;
  resetEditor: () => void;
  resetOutput: () => void;
  resetBroadcastGlobal: () => void;
  resetAll: () => void;
}

// ─────────────────────────────────────────
// Store 구현
// ─────────────────────────────────────────
export const useSettingsStore = create<SettingsStoreState>()(
  persist(
    (set) => ({
      // ── 초기 상태 ──
      ...DEFAULT_SETTINGS_STATE,

      // ── update ──
      updateGeneral: (patch) =>
        set((state) => ({ general: { ...state.general, ...patch } })),

      updateEditor: (patch) =>
        set((state) => ({ editor: { ...state.editor, ...patch } })),

      updateOutput: (patch) =>
        set((state) => ({ output: { ...state.output, ...patch } })),

      updateBroadcastGlobal: (patch) =>
        set((state) => ({
          broadcastGlobal: { ...state.broadcastGlobal, ...patch },
        })),

      // ── reset ──
      resetGeneral: () => set({ general: { ...DEFAULT_GENERAL_SETTINGS } }),
      resetEditor: () => set({ editor: { ...DEFAULT_EDITOR_SETTINGS } }),
      resetOutput: () => set({ output: { ...DEFAULT_OUTPUT_SETTINGS } }),
      resetBroadcastGlobal: () =>
        set({ broadcastGlobal: { ...DEFAULT_BROADCAST_GLOBAL_SETTINGS } }),
      resetAll: () => set({ ...DEFAULT_SETTINGS_STATE }),
    }),
    {
      name: 'unoLive-settings-store',
      storage: createJSONStorage(() =>
        typeof window !== 'undefined' ? localStorage : noopStorage
      ),
      // 전체 카테고리 영속화
      partialize: (state) => ({
        general: state.general,
        editor: state.editor,
        output: state.output,
        broadcastGlobal: state.broadcastGlobal,
      }),
    }
  )
);
