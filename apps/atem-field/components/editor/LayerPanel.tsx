'use client';

/**
 * LayerPanel.tsx
 * 레이어 시각적 관리 패널
 *
 * [FEATURE: LAYER_ACTIONS]
 * - 현재 섹션의 모든 요소를 레이어 순서(맨앞→맨뒤)로 목록 표시
 * - 클릭하여 요소 선택
 * - 맨 앞으로 / 앞으로 / 뒤로 / 맨 뒤로 버튼으로 레이어 순서 변경
 * - 눈 아이콘으로 요소 가시성 토글
 * - 자물쇠 아이콘으로 요소 잠금 토글
 * - lib/layerActions.ts 의 reorderLayer 함수를 사용 (로직 분리)
 *
 * 사용처: BottomPanels.tsx (4번째 패널)
 */

import React from 'react';
import { useStore } from '@/lib/store';
import {
  CANVAS_LAYER_ROLE_OPTIONS,
  CANVAS_RENDER_TARGET_OPTIONS,
  CanvasElement,
  getDefaultLayerRoleForElement,
  getElementVisibleOn,
} from '@/lib/canvasTypes';
import { undoManager } from '@/lib/undoManager';
import {
  reorderLayer,
  getSortedByZIndex,
  getLayerActionAvailability,
  LayerAction,
} from '@/lib/layerActions';

/* ── 아이콘 헬퍼 ──────────────────────────────────── */
function TypeIcon({ type }: { type: string }) {
  if (type === 'text') {
    return (
      <span
        style={{
          fontFamily: 'serif',
          fontWeight: 700,
          fontSize: 12,
          color: '#60a5fa',
          lineHeight: 1,
          userSelect: 'none',
        }}
      >
        T
      </span>
    );
  }
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none" style={{ color: '#a78bfa' }}>
      <rect x="1" y="1" width="9" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function EyeIcon({ visible }: { visible: boolean }) {
  return visible ? (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
      <path d="M1 6s2-4 5-4 5 4 5 4-2 4-5 4-5-4-5-4z" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="6" cy="6" r="1.5" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  ) : (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
      <path d="M1 6s2-4 5-4 5 4 5 4-2 4-5 4-5-4-5-4z" stroke="currentColor" strokeWidth="1.2" opacity="0.3" />
      <line x1="2" y1="2" x2="10" y2="10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function LockIcon({ locked }: { locked: boolean }) {
  return locked ? (
    <svg width="10" height="11" viewBox="0 0 10 12" fill="none">
      <rect x="1" y="5" width="8" height="6" rx="1" stroke="currentColor" strokeWidth="1.2" />
      <path d="M3 5V3.5a2 2 0 0 1 4 0V5" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  ) : (
    <svg width="10" height="11" viewBox="0 0 10 12" fill="none" opacity="0.3">
      <rect x="1" y="5" width="8" height="6" rx="1" stroke="currentColor" strokeWidth="1.2" />
      <path d="M3 5V3.5a2 2 0 0 1 4 0V5" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

/* ── 레이어 액션 버튼 SVG ─────────────────────────── */
const LAYER_BTNS: {
  action: LayerAction;
  title: string;
  icon: React.ReactNode;
}[] = [
  {
    action: 'bringToFront',
    title: '맨 앞으로',
    icon: (
      <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
        <path d="M6.5 1v11M2.5 4l4-3 4 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        <line x1="1" y1="12" x2="12" y2="12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    action: 'bringForward',
    title: '앞으로',
    icon: (
      <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
        <path d="M6.5 3v7M3.5 6l3-3 3 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    action: 'sendBackward',
    title: '뒤로',
    icon: (
      <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
        <path d="M6.5 10V3M3.5 7l3 3 3-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    action: 'sendToBack',
    title: '맨 뒤로',
    icon: (
      <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
        <path d="M6.5 12V1M2.5 9l4 3 4-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        <line x1="1" y1="1" x2="12" y2="1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    ),
  },
];

/* ── 레이어 이름 생성 ─────────────────────────────── */
function elementLabel(el: CanvasElement, index: number): string {
  if (el.type === 'text') {
    const te = el as import('@/lib/canvasTypes').TextElement;
    const raw = te.content?.trim() || '';
    const preview = raw === '여기에 텍스트 입력' ? '' : raw.slice(0, 10);
    const fallback = te.linked ? '가사연결' : '';
    const label = preview || fallback;
    return label ? `텍스트: ${label}` : `텍스트 ${index + 1}`;
  }
  if (el.type === 'shape') {
    const se = el as import('@/lib/canvasTypes').ShapeElement;
    const typeMap: Record<string, string> = {
      rect: '사각형',
      ellipse: '원형',
      line: '라인',
      triangle: '삼각형',
    };
    return `${typeMap[se.shapeType] ?? '도형'} ${index + 1}`;
  }
  return `요소 ${index + 1}`;
}

function layerRoleLabel(el: CanvasElement): string {
  const role = el.layerRole ?? getDefaultLayerRoleForElement(el);
  return CANVAS_LAYER_ROLE_OPTIONS.find((option) => option.value === role)?.label ?? '레이어';
}

function targetShortLabels(el: CanvasElement): string {
  const targets = getElementVisibleOn(el);
  return CANVAS_RENDER_TARGET_OPTIONS
    .filter((option) => targets.includes(option.value))
    .map((option) => option.shortLabel)
    .join('/');
}

/* ── LayerPanel ─────────────────────────────────── */
export default function LayerPanel() {
  const {
    currentSetlistId,
    activeItemId,
    activeSectionId,
    setlists,
    selectedElementId,
    setSelectedElement,
    updateElement,
  } = useStore();

  const setlist = setlists.find((sl) => sl.id === currentSetlistId);
  const item    = setlist?.items.find((it) => it.id === activeItemId);
  const section = item?.sections.find((sec) => sec.id === activeSectionId);
  const elements: CanvasElement[] = section?.elements ?? [];

  const isReady = !!(currentSetlistId && activeItemId && activeSectionId);

  // 맨앞(최고 zIndex) → 맨뒤(최저 zIndex) 순으로 표시
  const layerList = [...getSortedByZIndex(elements)].reverse();

  // 레이어 액션 가능 여부
  const availability = getLayerActionAvailability(elements, selectedElementId ?? null);

  // ── 레이어 순서 변경 — [UNDO] ───────────────────
  function handleLayerAction(action: LayerAction) {
    if (!isReady || !selectedElementId) return;
    undoManager.pushState(elements);
    const updates = reorderLayer(elements, selectedElementId, action);
    updates.forEach(({ id, zIndex }) => {
      updateElement(currentSetlistId!, activeItemId!, activeSectionId!, id, { zIndex });
    });
  }

  // ── 가시성 토글 — [UNDO] ──────────────────────
  function handleToggleVisible(el: CanvasElement, e: React.MouseEvent) {
    e.stopPropagation();
    if (!isReady) return;
    undoManager.pushState(elements);
    updateElement(currentSetlistId!, activeItemId!, activeSectionId!, el.id, {
      visible: !el.visible,
    });
  }

  // ── 잠금 토글 — [UNDO] ───────────────────────
  function handleToggleLock(el: CanvasElement, e: React.MouseEvent) {
    e.stopPropagation();
    if (!isReady) return;
    undoManager.pushState(elements);
    updateElement(currentSetlistId!, activeItemId!, activeSectionId!, el.id, {
      locked: !el.locked,
    });
  }

  return (
    <div className="flex flex-col h-full select-none">

      {/* ── 레이어 순서 버튼 바 ── */}
      <div
        className="flex items-center gap-1 px-2 py-1.5 border-b border-[#1a1a1a] flex-shrink-0"
        style={{ background: '#111' }}
      >
        {LAYER_BTNS.map(({ action, title, icon }) => (
          <button
            key={action}
            onClick={() => handleLayerAction(action)}
            disabled={!availability[action]}
            title={title}
            className="
              flex items-center justify-center
              w-7 h-7 rounded
              border border-[#2a2a2a] bg-[#1a1a1a]
              text-gray-400 hover:text-white hover:bg-[#252525] hover:border-[#3a3a3a]
              disabled:opacity-25 disabled:cursor-not-allowed
              transition-colors
            "
          >
            {icon}
          </button>
        ))}

        {/* 액션 이름 레이블 (선택된 액션 힌트) */}
        <span className="ml-auto text-[9px] text-gray-600 pr-1">
          {!selectedElementId
            ? '요소를 선택하세요'
            : `레이어 ${elements.findIndex(e => e.id === selectedElementId) >= 0
                ? getSortedByZIndex(elements).findIndex(e => e.id === selectedElementId) + 1
                : '-'
              } / ${elements.length}`
          }
        </span>
      </div>

      {/* ── 레이어 목록 ── */}
      <div className="flex-1 overflow-y-auto">
        {elements.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-[10px] text-gray-700 text-center leading-relaxed">
              요소가 없습니다.<br />
              위 버튼으로 추가하세요.
            </p>
          </div>
        ) : (
          <ul className="py-1">
            {layerList.map((el, i) => {
              const isSelected = el.id === selectedElementId;
              return (
                <li
                  key={el.id}
                  onClick={() =>
                    setSelectedElement(isSelected ? null : el.id)
                  }
                  className={`
                    flex items-center gap-2 px-2 py-1.5 cursor-pointer
                    border-b border-[#141414] transition-colors
                    ${isSelected
                      ? 'bg-[#1c2b3a] border-l-2 border-l-blue-500'
                      : 'hover:bg-[#181818] border-l-2 border-l-transparent'
                    }
                  `}
                >
                  {/* 타입 아이콘 */}
                  <span className="flex-shrink-0 w-4 flex items-center justify-center">
                    <TypeIcon type={el.type} />
                  </span>

                  {/* 이름 */}
                  <div className="flex-1 min-w-0">
                    <div
                      className={`text-[10px] truncate ${
                        isSelected ? 'text-blue-300' : el.visible ? 'text-gray-300' : 'text-gray-600'
                      }`}
                    >
                      {elementLabel(el, layerList.length - 1 - i)}
                    </div>
                    <div className="text-[8px] text-gray-600 truncate">
                      {el.fixedLayer ? '고정 · ' : ''}{layerRoleLabel(el)} · {targetShortLabels(el)}
                    </div>
                  </div>

                  {/* zIndex 표시 */}
                  <span className="text-[8px] text-gray-600 w-4 text-center flex-shrink-0">
                    {el.zIndex}
                  </span>

                  {/* 가시성 버튼 */}
                  <button
                    onClick={(e) => handleToggleVisible(el, e)}
                    title={el.visible ? '숨기기' : '보이기'}
                    className={`
                      flex-shrink-0 w-5 h-5 flex items-center justify-center rounded
                      transition-colors
                      ${el.visible
                        ? 'text-gray-400 hover:text-white hover:bg-[#252525]'
                        : 'text-gray-700 hover:text-gray-400 hover:bg-[#252525]'
                      }
                    `}
                  >
                    <EyeIcon visible={el.visible} />
                  </button>

                  {/* 잠금 버튼 */}
                  <button
                    onClick={(e) => handleToggleLock(el, e)}
                    title={el.locked ? '잠금 해제' : '잠금'}
                    className={`
                      flex-shrink-0 w-5 h-5 flex items-center justify-center rounded
                      transition-colors
                      ${el.locked
                        ? 'text-amber-400 hover:text-white hover:bg-[#252525]'
                        : 'text-gray-700 hover:text-gray-400 hover:bg-[#252525]'
                      }
                    `}
                  >
                    <LockIcon locked={el.locked} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

    </div>
  );
}
