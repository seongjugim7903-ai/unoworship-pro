'use client';

import { useMemo, useState } from 'react';
import type {
  Section,
  SectionCueBlackoutAction,
  SectionCueMacro,
  SectionCueOutputTarget,
  SectionCuePromptLayout,
  SectionCueTransitionType,
} from '@/lib/types';
import { CUE_MACRO_LAYER_OPTIONS } from '@/lib/sectionCueMacro';
import type { CanvasLayerRole } from '@/lib/canvasTypes';

interface SectionCueMacroModalProps {
  section: Section;
  onClose: () => void;
  onSave: (cueMacro: SectionCueMacro | undefined) => void;
}

const OUTPUT_OPTIONS: { value: SectionCueOutputTarget; label: string }[] = [
  { value: 'default', label: '프로그램 기본값' },
  { value: 'all', label: 'MAIN + SUB 같이' },
  { value: 'output', label: 'MAIN만 / 강대상' },
  { value: 'prompt', label: 'SUB만 / 중상층' },
  { value: 'broadcast', label: 'BRD만' },
];

const BLACKOUT_OPTIONS: { value: SectionCueBlackoutAction; label: string }[] = [
  { value: 'auto-off', label: '송출 시 블랙 해제' },
  { value: 'keep', label: '현재 상태 유지' },
  { value: 'on', label: '블랙 켜기' },
];

const PROMPT_LAYOUT_OPTIONS: { value: SectionCuePromptLayout; label: string }[] = [
  { value: 'program-default', label: '프로그램 기본값' },
  { value: 'none', label: '일반 출력과 동일' },
  { value: 'black-white', label: '블랙 + 흰색 가사' },
  { value: 'bible', label: '본문/설교용' },
];

const TRANSITION_OPTIONS: { value: SectionCueTransitionType; label: string }[] = [
  { value: 'default', label: '전역 전환값' },
  { value: 'cut', label: 'Cut' },
  { value: 'fade', label: 'Fade' },
  { value: 'slide', label: 'Slide' },
  { value: 'dip-to-black', label: 'Dip to Black' },
];

export default function SectionCueMacroModal({
  section,
  onClose,
  onSave,
}: SectionCueMacroModalProps) {
  const initial = section.cueMacro;
  const [enabled, setEnabled] = useState(initial?.enabled ?? true);
  const [outputTarget, setOutputTarget] = useState<SectionCueOutputTarget>(
    initial?.outputTarget ?? 'default'
  );
  const [blackout, setBlackout] = useState<SectionCueBlackoutAction>(
    initial?.blackout ?? 'auto-off'
  );
  const [promptLayout, setPromptLayout] = useState<SectionCuePromptLayout>(
    initial?.promptLayout ?? 'program-default'
  );
  const [transitionType, setTransitionType] = useState<SectionCueTransitionType>(
    initial?.transition?.type ?? 'default'
  );
  const [transitionDuration, setTransitionDuration] = useState(
    initial?.transition?.duration ?? 500
  );
  const [hiddenLayerRoles, setHiddenLayerRoles] = useState<CanvasLayerRole[]>(
    initial?.hiddenLayerRoles ?? []
  );

  const sectionName = useMemo(() => (
    section.label || section.text.split('\n')[0] || '섹션'
  ), [section.label, section.text]);

  const toggleHiddenLayer = (role: CanvasLayerRole) => {
    setHiddenLayerRoles((current) => (
      current.includes(role)
        ? current.filter((value) => value !== role)
        : [...current, role]
    ));
  };

  const save = () => {
    onSave({
      enabled,
      outputTarget,
      blackout,
      promptLayout,
      transition: {
        type: transitionType,
        duration: transitionType === 'cut' ? 0 : transitionDuration,
      },
      hiddenLayerRoles,
    });
  };

  return (
    <div
      className="fixed inset-0 z-[10020] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-[520px] max-w-[calc(100vw-32px)] rounded-lg border border-[#3a3a3a] bg-[#171717] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#2a2a2a] px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white">Cue/Macro 설정</p>
            <p className="mt-0.5 truncate text-[11px] text-gray-500">{sectionName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded px-2 py-1 text-xs text-gray-500 hover:bg-white/10 hover:text-gray-200"
          >
            닫기
          </button>
        </div>

        <div className="space-y-4 px-4 py-4">
          <label className="flex items-center justify-between rounded border border-[#2a2a2a] bg-[#111] px-3 py-2">
            <span className="text-xs font-medium text-gray-200">이 섹션에서 Cue/Macro 실행</span>
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="h-4 w-4 accent-sky-500"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1">
              <span className="text-[11px] text-gray-500">출력 대상</span>
              <select
                value={outputTarget}
                onChange={(e) => setOutputTarget(e.target.value as SectionCueOutputTarget)}
                className="h-9 w-full rounded border border-[#333] bg-[#101010] px-2 text-xs text-gray-200 outline-none focus:border-sky-500"
              >
                {OUTPUT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>

            <label className="space-y-1">
              <span className="text-[11px] text-gray-500">블랙아웃</span>
              <select
                value={blackout}
                onChange={(e) => setBlackout(e.target.value as SectionCueBlackoutAction)}
                className="h-9 w-full rounded border border-[#333] bg-[#101010] px-2 text-xs text-gray-200 outline-none focus:border-sky-500"
              >
                {BLACKOUT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>

            <label className="space-y-1">
              <span className="text-[11px] text-gray-500">프롬프트 레이아웃</span>
              <select
                value={promptLayout}
                onChange={(e) => setPromptLayout(e.target.value as SectionCuePromptLayout)}
                className="h-9 w-full rounded border border-[#333] bg-[#101010] px-2 text-xs text-gray-200 outline-none focus:border-sky-500"
              >
                {PROMPT_LAYOUT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>

            <label className="space-y-1">
              <span className="text-[11px] text-gray-500">전환 효과</span>
              <select
                value={transitionType}
                onChange={(e) => setTransitionType(e.target.value as SectionCueTransitionType)}
                className="h-9 w-full rounded border border-[#333] bg-[#101010] px-2 text-xs text-gray-200 outline-none focus:border-sky-500"
              >
                {TRANSITION_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
          </div>

          {transitionType !== 'default' && transitionType !== 'cut' && (
            <label className="block space-y-1">
              <span className="text-[11px] text-gray-500">전환 시간</span>
              <input
                type="number"
                min={100}
                max={5000}
                step={50}
                value={transitionDuration}
                onChange={(e) => setTransitionDuration(Number(e.target.value))}
                className="h-9 w-full rounded border border-[#333] bg-[#101010] px-2 text-xs text-gray-200 outline-none focus:border-sky-500"
              />
            </label>
          )}

          <div>
            <p className="mb-2 text-[11px] text-gray-500">이 섹션에서 숨길 레이어</p>
            <div className="grid grid-cols-2 gap-2">
              {CUE_MACRO_LAYER_OPTIONS.map((option) => (
                <label
                  key={option.value}
                  className="flex items-center gap-2 rounded border border-[#2a2a2a] bg-[#101010] px-3 py-2 text-xs text-gray-300"
                >
                  <input
                    type="checkbox"
                    checked={hiddenLayerRoles.includes(option.value)}
                    onChange={() => toggleHiddenLayer(option.value)}
                    className="h-3.5 w-3.5 accent-sky-500"
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-[#2a2a2a] px-4 py-3">
          <button
            type="button"
            onClick={() => onSave(undefined)}
            className="rounded border border-red-500/30 px-3 py-1.5 text-xs text-red-300 hover:bg-red-500/15"
          >
            설정 해제
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded border border-[#333] px-3 py-1.5 text-xs text-gray-400 hover:bg-white/10 hover:text-gray-200"
            >
              취소
            </button>
            <button
              type="button"
              onClick={save}
              className="rounded border border-sky-500 bg-sky-500/20 px-3 py-1.5 text-xs font-semibold text-sky-100 hover:bg-sky-500/30"
            >
              저장
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
