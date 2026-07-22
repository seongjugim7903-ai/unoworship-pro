'use client';

/**
 * 찬양대 전용 PMT 레이아웃 선택기
 *
 * SetlistPanel 아이템 행에 배치되는 "PMT" 버튼 + 드롭다운.
 * 기본 찬양대 프리셋과 디자인 등록 모달에서 등록한 교회별 커스텀 레이아웃을 함께 표시한다.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '@/lib/store';
import { CHOIR_PROMPT_LAYOUTS } from '@/lib/prompt/choirPromptLayouts';
import type { PromptLayoutType, PromptSendMode } from '@/lib/types';

interface PromptOption {
  id: string;
  label: string;
  hasDesign: boolean;
  disabled?: boolean;
}

interface Props {
  setlistId: string;
  itemId: string;
  currentLayout?: string;
  currentSendMode?: PromptSendMode;
  /** 프로그램 타입 (choir, conti, sermon, bulletin, special) - 해당 타입의 커스텀 레이아웃만 표시 */
  programType?: string;
}

const MENU_WIDTH = 220;
const MENU_MARGIN = 8;

function buildBaseOptions(): PromptOption[] {
  const base: PromptOption[] = [{ id: 'none', label: '없음 (강대상과 동일)', hasDesign: false }];

  for (const preset of CHOIR_PROMPT_LAYOUTS) {
    if (preset.type === 'none') continue;
    base.push({
      id: preset.type,
      label: preset.label,
      hasDesign: true,
      disabled: !preset.enabled,
    });
  }

  return base;
}

export default function ChoirPromptLayoutSelector({
  setlistId,
  itemId,
  currentLayout = 'none',
  currentSendMode = 'normal',
  programType,
}: Props) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<PromptOption[]>(() => buildBaseOptions());
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const updateItem = useStore((state) => state.updateItem);

  const updateMenuPosition = useCallback(() => {
    if (typeof window === 'undefined') return;
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;

    const left = Math.min(
      window.innerWidth - MENU_WIDTH - MENU_MARGIN,
      Math.max(MENU_MARGIN, rect.right - MENU_WIDTH),
    );
    const top = Math.min(
      window.innerHeight - MENU_MARGIN,
      Math.max(MENU_MARGIN, rect.top),
    );
    setMenuPosition({ left, top });
  }, []);

  const refreshOptions = useCallback(async () => {
    const base = buildBaseOptions();

    const collectFromData = (programKey: string, data: {
      prompt?: { default?: { elements?: unknown[] }; cover?: { elements?: unknown[] } };
      promptLayouts?: Array<{ id: string; name: string; sections?: { default?: { elements?: unknown[] }; cover?: { elements?: unknown[] } } }>;
    } | undefined) => {
      const promptDefaultHas = Array.isArray(data?.prompt?.default?.elements) && (data?.prompt?.default?.elements?.length ?? 0) > 0;
      const promptCoverHas = Array.isArray(data?.prompt?.cover?.elements) && (data?.prompt?.cover?.elements?.length ?? 0) > 0;
      if (promptDefaultHas || promptCoverHas) {
        base.push({
          id: `prompt-base-${programKey}`,
          label: programType ? '중층 기본 레이아웃' : `${programKey} · 중층 기본`,
          hasDesign: true,
        });
      }

      if (!data?.promptLayouts) return;
      for (const layout of data.promptLayouts) {
        const defaultHas = Array.isArray(layout.sections?.default?.elements) && (layout.sections?.default?.elements?.length ?? 0) > 0;
        const coverHas = Array.isArray(layout.sections?.cover?.elements) && (layout.sections?.cover?.elements?.length ?? 0) > 0;
        base.push({
          id: layout.id,
          label: layout.name,
          hasDesign: defaultHas || coverHas,
        });
      }
    };

    try {
      const res = await fetch('/api/designs');
      if (res.ok) {
        const { designs } = await res.json();
        if (programType) {
          collectFromData(programType, designs[programType]);
        } else {
          for (const [programKey, data] of Object.entries(designs) as Array<[string, Parameters<typeof collectFromData>[1]]>) {
            collectFromData(programKey, data);
          }
        }
      }
    } catch { /* keep built-in options */ }

    setOptions(base);
  }, [programType]);

  useEffect(() => {
    if (!open) return;
    const handler = (event: MouseEvent) => {
      const target = event.target as Node;
      if (containerRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleWindowChange = () => updateMenuPosition();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    window.addEventListener('resize', handleWindowChange);
    window.addEventListener('scroll', handleWindowChange, true);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('resize', handleWindowChange);
      window.removeEventListener('scroll', handleWindowChange, true);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, updateMenuPosition]);

  const isActive = currentLayout !== 'none';
  const isPromptOnly = currentSendMode === 'prompt-only';
  const selectedLabel = options.find((option) => option.id === currentLayout)?.label;
  const firstPromptDesignId = options.find((option) =>
    option.id !== 'none' && option.disabled !== true && option.hasDesign
  )?.id;

  const togglePromptOnly = () => {
    const nextMode: PromptSendMode = isPromptOnly ? 'normal' : 'prompt-only';
    const updates: { promptSendMode: PromptSendMode; promptLayout?: PromptLayoutType } = {
      promptSendMode: nextMode,
    };
    if (nextMode === 'prompt-only' && currentLayout === 'none' && firstPromptDesignId) {
      updates.promptLayout = firstPromptDesignId as PromptLayoutType;
    }
    updateItem(setlistId, itemId, updates);
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative flex-shrink-0">
      <button
        ref={buttonRef}
        onClick={(event) => {
          event.stopPropagation();
          if (!open) {
            updateMenuPosition();
            void refreshOptions();
          }
          setOpen((value) => !value);
        }}
        className={`text-[9px] font-bold px-1.5 py-0.5 rounded transition-colors ${
          isPromptOnly
            ? 'bg-sky-600 text-white'
            : isActive
              ? 'bg-emerald-600 text-white'
              : 'bg-[#333] text-gray-500 hover:text-gray-300'
        }`}
        title={`찬양대 PMT${isPromptOnly ? ': 프롬프트 전용 송출' : selectedLabel ? `: ${selectedLabel}` : ''}`}
      >
        PMT
      </button>

      {open && menuPosition && typeof document !== 'undefined' && createPortal(
        <div
          ref={menuRef}
          className="fixed z-[10000] bg-[#222] border border-[#444] rounded-lg shadow-2xl py-1 max-h-[70vh] overflow-y-auto"
          style={{ left: menuPosition.left, top: menuPosition.top, width: MENU_WIDTH }}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="px-3 py-1.5 text-[10px] text-gray-500 font-medium border-b border-[#333]">
            찬양대 PMT 레이아웃
          </div>
          <button
            onClick={togglePromptOnly}
            className={`w-full text-left px-3 py-2 text-xs transition-colors flex items-start gap-2 border-b border-[#333] ${
              isPromptOnly
                ? 'bg-sky-600/20 text-sky-300'
                : 'text-gray-300 hover:bg-[#333]'
            }`}
          >
            <span className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${
              isPromptOnly ? 'bg-sky-300' : 'bg-transparent'
            }`} />
            <span className="min-w-0">
              <span className="block font-medium">프롬프트 전용 송출</span>
              <span className="block text-[10px] leading-4 text-gray-500">
                선택한 PMT 디자인으로 중층만 업데이트
              </span>
            </span>
          </button>
          {options.map((option) => {
            const isSelected = currentLayout === option.id;
            const isDisabled = option.disabled === true;
            return (
              <button
                key={option.id}
                disabled={isDisabled}
                onClick={() => {
                  if (isDisabled) return;
                  // 토글: 이미 선택된 항목을 다시 클릭하면 해제('none'), 아니면 선택.
                  const next: PromptLayoutType = isSelected ? 'none' : (option.id as PromptLayoutType);
                  updateItem(setlistId, itemId, { promptLayout: next });
                  setOpen(false);
                }}
                className={`w-full text-left px-3 py-1.5 text-xs transition-colors flex items-center gap-2 ${
                  isDisabled
                    ? 'text-gray-600 cursor-not-allowed'
                    : isSelected
                    ? 'bg-emerald-600/20 text-emerald-400'
                    : 'text-gray-300 hover:bg-[#333]'
                }`}
              >
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                  isSelected ? 'bg-emerald-400' : 'bg-transparent'
                }`} />
                <span className="flex items-center gap-1.5">
                  <span>{option.label}</span>
                  {isDisabled && (
                    <span className="text-[9px] text-gray-600">(준비중)</span>
                  )}
                  {!isDisabled && option.id !== 'none' && !option.hasDesign && (
                    <span className="text-[9px] text-gray-600">(미등록)</span>
                  )}
                </span>
              </button>
            );
          })}
          {options.length <= 1 && (
            <div className="px-3 py-2 text-[10px] text-gray-600 italic">
              디자인 등록에서 교회별 PMT 레이아웃을 추가하세요
            </div>
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}
