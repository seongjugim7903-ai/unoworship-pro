'use client';

import { useEffect, useRef, type RefObject } from 'react';
import type { BroadcastGridEntry } from './BroadcastGridOverlay';

export type BroadcastGridArrowKey = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight';

export interface BroadcastGridArrowNavigationOptions {
  entries: ReadonlyArray<BroadcastGridEntry>;
  activeSectionId: string | null;
  columns: number;
  scrollRootRef: RefObject<HTMLDivElement | null>;
  onSelect: (index: number) => void;
}

/**
 * 실제 CSS grid 열 수를 기준으로 화살표의 다음 타일을 계산한다.
 * 가장자리에서는 다음/이전 순번으로 줄을 넘어가지 않고 이동을 멈춘다.
 */
export function resolveBroadcastGridArrowTarget(
  currentIndex: number,
  totalEntries: number,
  columns: number,
  key: BroadcastGridArrowKey,
): number | null {
  if (totalEntries <= 0 || columns <= 0) return null;
  if (currentIndex < 0 || currentIndex >= totalEntries) return 0;

  const row = Math.floor(currentIndex / columns);
  const column = currentIndex % columns;

  if (key === 'ArrowLeft') return column > 0 ? currentIndex - 1 : null;
  if (key === 'ArrowRight') {
    return column < columns - 1 && currentIndex + 1 < totalEntries ? currentIndex + 1 : null;
  }
  if (key === 'ArrowUp') return row > 0 ? currentIndex - columns : null;
  return currentIndex + columns < totalEntries ? currentIndex + columns : null;
}

function isTextEditingTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && Boolean(target.closest('input, textarea, [contenteditable="true"]'));
}

/** 송출그리드 전용 방향키 선택 이동 — 송출은 하지 않고 마우스 원클릭과 같은 선택만 수행한다. */
export function useBroadcastGridArrowNavigation({
  entries,
  activeSectionId,
  columns,
  scrollRootRef,
  onSelect,
}: BroadcastGridArrowNavigationOptions): void {
  const stateRef = useRef({ entries, activeSectionId, columns, onSelect });

  useEffect(() => {
    stateRef.current = { entries, activeSectionId, columns, onSelect };
  }, [entries, activeSectionId, columns, onSelect]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || isTextEditingTarget(event.target)) return;
      if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;

      const state = stateRef.current;
      const currentIndex = state.entries.findIndex((entry) => entry.section.id === state.activeSectionId);
      const targetIndex = resolveBroadcastGridArrowTarget(
        currentIndex,
        state.entries.length,
        state.columns,
        event.key as BroadcastGridArrowKey,
      );

      // 그리드가 열려 있는 동안 방향키로 페이지 자체가 스크롤되지 않게 한다.
      event.preventDefault();
      event.stopPropagation();
      if (targetIndex === null || targetIndex === currentIndex) return;

      state.onSelect(targetIndex);
      window.requestAnimationFrame(() => {
        const tile = scrollRootRef.current?.querySelector<HTMLElement>(
          `[data-broadcast-grid-index="${targetIndex}"]`,
        );
        tile?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      });
    };

    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [scrollRootRef]);
}
