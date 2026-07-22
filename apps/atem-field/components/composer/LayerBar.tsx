'use client';

/**
 * LayerBar.tsx
 * 에디터 상단 60px — 요소 추가 버튼 + 레이어 순서 표시
 */

import React from 'react';
import { useStore } from '@/lib/store';
import { createShapeElement, createTextElement, ShapeType } from '@/lib/canvasTypes';
import { undoManager } from '@/lib/undoManager';
import { isLayerOutputWorkspaceSection } from '@/lib/layerOutputWorkspace';
import { createSafeAreaScreenMaskElements, isSafeAreaScreenMaskElement } from '@/lib/screenMasks';

export default function LayerBar() {
  const {
    currentSetlistId,
    activeItemId,
    activeSectionId,
    setlists,
    addElement,
    removeElement,
    selectedElementId,
    setSelectedElement,
    updateElement,
  } = useStore();

  const setlist = setlists.find((sl) => sl.id === currentSetlistId);
  const item    = setlist?.items.find((it) => it.id === activeItemId);
  const section = item?.sections.find((sec) => sec.id === activeSectionId);
  const elements = section?.elements ?? [];

  const isReady = !!(currentSetlistId && activeItemId && activeSectionId);
  const isLayerOutputWorkspace = !!section && isLayerOutputWorkspaceSection(section);

  function handleAddText() {
    if (!isReady) return;
    const el = createTextElement({
      zIndex: elements.length,
      linked: false,
      content: '여기에 텍스트 입력',
    });
    addElement(currentSetlistId!, activeItemId!, activeSectionId!, el);
    setSelectedElement(el.id);
  }

  function handleAddShape(shapeType: ShapeType) {
    if (!isReady) return;
    const el = createShapeElement({
      shapeType,
      zIndex: elements.length,
    });
    addElement(currentSetlistId!, activeItemId!, activeSectionId!, el);
    setSelectedElement(el.id);
  }

  function handleAddScreenMask() {
    if (!isReady || !isLayerOutputWorkspace) return;
    undoManager.pushState(elements);
    const oldMaskIds = elements.filter(isSafeAreaScreenMaskElement).map((el) => el.id);
    const remainingElementCount = elements.length - oldMaskIds.length;

    for (const id of oldMaskIds) {
      removeElement(currentSetlistId!, activeItemId!, activeSectionId!, id);
    }

    const maskBars = createSafeAreaScreenMaskElements(remainingElementCount);

    for (const el of maskBars) {
      addElement(currentSetlistId!, activeItemId!, activeSectionId!, el);
    }
    setSelectedElement(null);
  }

  function handleDelete() {
    if (!isReady || !selectedElementId) return;
    removeElement(currentSetlistId!, activeItemId!, activeSectionId!, selectedElementId);
  }

  // 레이어 위/아래 이동 (zIndex 스왑)
  const handleMoveLayer = (direction: 'up' | 'down') => {
    if (!selectedElementId || !section) return;
    const idx = elements.findIndex((el) => el.id === selectedElementId);
    if (idx < 0) return;
    const targetIdx = direction === 'up' ? idx + 1 : idx - 1;
    if (targetIdx < 0 || targetIdx >= elements.length) return;

    const a = elements[idx];
    const b = elements[targetIdx];
    // zIndex 스왑 — [UNDO]
    undoManager.pushState(elements);
    updateElement(currentSetlistId!, activeItemId!, activeSectionId!, a.id, { zIndex: b.zIndex });
    updateElement(currentSetlistId!, activeItemId!, activeSectionId!, b.id, { zIndex: a.zIndex });
  };

  const btnBase = `
    flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium
    border border-[#2a2a2a] bg-[#1a1a1a] text-gray-300
    hover:bg-[#252525] hover:text-white hover:border-[#3a3a3a]
    disabled:opacity-30 disabled:cursor-not-allowed
    transition-colors
  `;

  return (
    <div className="flex items-center gap-1.5 px-3 h-[60px] border-b border-[#1a1a1a] flex-shrink-0">
      {/* 텍스트 추가 */}
      <button
        onClick={handleAddText}
        disabled={!isReady}
        className={btnBase}
        title="텍스트 추가"
      >
        <span className="text-base leading-none">T</span>
        <span>텍스트</span>
      </button>

      {/* 도형 — 사각형 */}
      <button
        onClick={() => handleAddShape('rect')}
        disabled={!isReady}
        className={btnBase}
        title="사각형 추가"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <rect x="1" y="1" width="10" height="10" stroke="currentColor" strokeWidth="1.5"/>
        </svg>
        <span>박스</span>
      </button>

      {/* 도형 — 원형 */}
      <button
        onClick={() => handleAddShape('ellipse')}
        disabled={!isReady}
        className={btnBase}
        title="원형 추가"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <ellipse cx="6" cy="6" rx="5" ry="5" stroke="currentColor" strokeWidth="1.5"/>
        </svg>
        <span>원</span>
      </button>

      {/* 도형 — 라인 */}
      <button
        onClick={() => handleAddShape('line')}
        disabled={!isReady}
        className={btnBase}
        title="라인 추가"
      >
        <svg width="14" height="12" viewBox="0 0 14 12" fill="none">
          <line x1="1" y1="6" x2="13" y2="6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
        <span>라인</span>
      </button>

      {/* 구분선 */}
      <div className="w-px h-5 bg-[#2a2a2a] mx-1 flex-shrink-0" />

      {/* 스크린 마스크 — 전역 레이어 · 분리출력 전용 */}
      <button
        onClick={handleAddScreenMask}
        disabled={!isReady || !isLayerOutputWorkspace}
        className={btnBase}
        title={isLayerOutputWorkspace ? '가장자리 스크린 마스크 추가' : '전역 레이어 · 분리출력 에디터에서 사용'}
      >
        <svg width="14" height="12" viewBox="0 0 14 12" fill="none">
          <rect x="1" y="1" width="12" height="10" stroke="currentColor" strokeWidth="1.2" />
          <path d="M1 3h12M1 9h12M3 3v6M11 3v6" stroke="currentColor" strokeWidth="1.2" />
        </svg>
        <span>마스크</span>
      </button>

      {/* 구분선 */}
      <div className="w-px h-5 bg-[#2a2a2a] mx-1 flex-shrink-0" />

      {/* 레이어 위로 */}
      <button
        onClick={() => handleMoveLayer('up')}
        disabled={!selectedElementId}
        className={btnBase}
        title="위 레이어로"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M5 8V2M2 5l3-3 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {/* 레이어 아래로 */}
      <button
        onClick={() => handleMoveLayer('down')}
        disabled={!selectedElementId}
        className={btnBase}
        title="아래 레이어로"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M5 2v6M2 5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {/* 삭제 */}
      <button
        onClick={handleDelete}
        disabled={!selectedElementId}
        className={`${btnBase} ml-auto hover:border-red-500/50 hover:text-red-400`}
        title="선택 요소 삭제"
      >
        <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
          <path d="M1 1l9 9M10 1L1 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
        <span>삭제</span>
      </button>

      {/* 레이어 목록 — 오른쪽 끝 미니 */}
      {elements.length > 0 && (
        <div className="flex items-center gap-1 ml-2 overflow-x-auto max-w-[160px]">
          {[...elements]
            .sort((a, b) => b.zIndex - a.zIndex)
            .map((el) => (
              <button
                key={el.id}
                onClick={() => setSelectedElement(el.id === selectedElementId ? null : el.id)}
                className={`
                  flex-shrink-0 px-1.5 py-0.5 rounded text-[9px] border transition-colors
                  ${el.id === selectedElementId
                    ? 'bg-blue-600 border-blue-500 text-white'
                    : 'bg-[#1a1a1a] border-[#2a2a2a] text-gray-500 hover:text-gray-300'
                  }
                `}
              >
                {el.type === 'text' ? 'T' : el.type === 'shape' ? '□' : el.type[0].toUpperCase()}
                <span className="ml-0.5">{el.zIndex}</span>
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
