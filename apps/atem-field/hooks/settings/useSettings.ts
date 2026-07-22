'use client';

/**
 * useSettings.ts
 * 설정(Settings) 접근 훅 — 카테고리별 getter/setter 편의 API
 *
 * 사용 예:
 *   const { general, updateGeneral } = useSettings();
 *   updateGeneral({ theme: 'light' });
 */

import { useSettingsStore } from '@/lib/settings/settingsStore';

export function useSettings() {
  const general = useSettingsStore((s) => s.general);
  const editor = useSettingsStore((s) => s.editor);
  const output = useSettingsStore((s) => s.output);
  const broadcastGlobal = useSettingsStore((s) => s.broadcastGlobal);

  const updateGeneral = useSettingsStore((s) => s.updateGeneral);
  const updateEditor = useSettingsStore((s) => s.updateEditor);
  const updateOutput = useSettingsStore((s) => s.updateOutput);
  const updateBroadcastGlobal = useSettingsStore((s) => s.updateBroadcastGlobal);

  const resetGeneral = useSettingsStore((s) => s.resetGeneral);
  const resetEditor = useSettingsStore((s) => s.resetEditor);
  const resetOutput = useSettingsStore((s) => s.resetOutput);
  const resetBroadcastGlobal = useSettingsStore((s) => s.resetBroadcastGlobal);
  const resetAll = useSettingsStore((s) => s.resetAll);

  return {
    // state
    general,
    editor,
    output,
    broadcastGlobal,

    // update
    updateGeneral,
    updateEditor,
    updateOutput,
    updateBroadcastGlobal,

    // reset
    resetGeneral,
    resetEditor,
    resetOutput,
    resetBroadcastGlobal,
    resetAll,
  };
}
