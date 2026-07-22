'use client';

import { useEffect, useRef, type RefObject } from 'react';
import type { BroadcastGridEntry } from './BroadcastGridOverlay';

export type BroadcastGridProgramJumpDirection = 'next' | 'previous';

export interface BroadcastGridProgramJumpOptions {
  entries: ReadonlyArray<BroadcastGridEntry>;
  activeSectionId: string | null;
  scrollRootRef: RefObject<HTMLDivElement | null>;
  onSelect: (index: number) => void;
}

/** 현재 섹션이 속한 프로그램을 건너뛰고 다음/이전 프로그램의 첫 섹션을 찾는다. */
export function resolveBroadcastGridProgramJump(
  entries: ReadonlyArray<Pick<BroadcastGridEntry, 'itemId'>>,
  currentIndex: number,
  direction: BroadcastGridProgramJumpDirection,
): number | null {
  if (entries.length === 0) return null;

  if (currentIndex < 0 || currentIndex >= entries.length) {
    if (direction === 'next') return 0;
    const lastItemId = entries[entries.length - 1].itemId;
    return entries.findIndex((entry) => entry.itemId === lastItemId);
  }

  const currentItemId = entries[currentIndex].itemId;
  if (direction === 'next') {
    for (let index = currentIndex + 1; index < entries.length; index += 1) {
      if (entries[index].itemId !== currentItemId) return index;
    }
    return null;
  }

  for (let index = currentIndex - 1; index >= 0; index -= 1) {
    if (entries[index].itemId !== currentItemId) {
      const previousItemId = entries[index].itemId;
      while (index > 0 && entries[index - 1].itemId === previousItemId) index -= 1;
      return index;
    }
  }
  return null;
}

function isTextEditingTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && Boolean(
    target.closest('input, textarea, select, button, [contenteditable="true"]'),
  );
}

/** Tab 프로그램 점프 — 송출은 하지 않고 다음/이전 프로그램의 첫 섹션만 선택한다. */
export function useBroadcastGridProgramJump({
  entries,
  activeSectionId,
  scrollRootRef,
  onSelect,
}: BroadcastGridProgramJumpOptions): void {
  const stateRef = useRef({ entries, activeSectionId, onSelect });

  useEffect(() => {
    stateRef.current = { entries, activeSectionId, onSelect };
  }, [entries, activeSectionId, onSelect]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || event.key !== 'Tab') return;
      if (isTextEditingTarget(event.target)) return;

      const state = stateRef.current;
      const currentIndex = state.entries.findIndex((entry) => entry.section.id === state.activeSectionId);
      const targetIndex = resolveBroadcastGridProgramJump(
        state.entries,
        currentIndex,
        event.shiftKey ? 'previous' : 'next',
      );

      // 프로그램 경계에서 브라우저 포커스가 빠져나가지 않도록 Tab을 소비한다.
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
