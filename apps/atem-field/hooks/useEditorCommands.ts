'use client';

/**
 * useEditorCommands.ts
 * 에디터 캔버스 키보드 단축키 & 편집 명령 통합 훅
 *
 * 지원 명령:
 *  - Undo      (Ctrl/Cmd + Z)
 *  - Redo      (Ctrl/Cmd + Shift + Z  또는  Ctrl/Cmd + Y)
 *  - Cut       (Ctrl/Cmd + X)
 *  - Copy      (Ctrl/Cmd + C)
 *  - Paste     (Ctrl/Cmd + V)
 *  - Select All(Ctrl/Cmd + A)
 *  - Delete    (Delete / Backspace)
 *
 * 개별 파일로 분리하여 EditorCanvas.tsx의 기존 인라인 핸들러를 대체한다.
 * undoManager.ts 를 사용해 Undo/Redo 히스토리를 관리한다.
 */

import { useCallback, useRef, useState, useEffect } from 'react';
import { CanvasElement } from '@/lib/canvasTypes';
import { useStore } from '@/lib/store';
import { undoManager } from '@/lib/undoManager';

// ─────────────────────────────────────────
// 훅 파라미터
// ─────────────────────────────────────────
export interface UseEditorCommandsOptions {
  setlistId: string;
  itemId: string;
  sectionId: string;
  elements: CanvasElement[];
  selectedId: string | null;
  selectedIds?: string[];
}

// ─────────────────────────────────────────
// 훅 반환 타입
// ─────────────────────────────────────────
export interface UseEditorCommandsReturn {
  /** React onKeyDown 핸들러 — 캔버스 div에 바인딩 (하위호환용) */
  handleKeyDown: (e: React.KeyboardEvent) => void;
  /** 클립보드에 요소가 있는지 여부 (우클릭 메뉴에서 활용) */
  hasClipboard: boolean;
  /** 프로그래밍적으로 호출할 수 있는 개별 명령 */
  commands: {
    undo: () => void;
    redo: () => void;
    cut: (elementId: string) => void;
    copy: (elementId: string) => void;
    paste: () => void;
    selectAll: () => void;
    deleteSelected: () => void;
  };
}


// ─────────────────────────────────────────
// 메인 훅
// ─────────────────────────────────────────
export function useEditorCommands({
  setlistId,
  itemId,
  sectionId,
  elements,
  selectedId,
  selectedIds: selectedIdsProp,
}: UseEditorCommandsOptions): UseEditorCommandsReturn {
  const {
    setSelectedElement,
    setSelectedElements,
    addElement,
    updateElement,
    removeElement,
    reorderElements,
  } = useStore();

  const selectedIds = selectedIdsProp ?? (selectedId ? [selectedId] : []);

  const clipboardRef = useRef<CanvasElement[]>([]);
  const [hasClipboard, setHasClipboard] = useState(false);

  // 섹션 변경 시 undo 히스토리 초기화
  useEffect(() => {
    undoManager.clear();
  }, [setlistId, itemId, sectionId]);

  // ── Undo/Redo 전 상태 기록 헬퍼 ──────────
  const pushUndoState = useCallback(() => {
    undoManager.pushState(elements);
  }, [elements]);

  // ── 요소 배열을 store 에 전체 교체 (undo/redo 복원용) ──
  const restoreElements = useCallback(
    (snapshot: CanvasElement[]) => {
      if (!setlistId || !itemId || !sectionId) return;
      reorderElements(setlistId, itemId, sectionId, snapshot);
    },
    [setlistId, itemId, sectionId, reorderElements],
  );

  // ── Undo/Redo 후 선택 상태 복원 ───────────
  // 복원된 상태에 존재하는 선택 요소만 남김 (없으면 선택 해제)
  const preserveSelection = useCallback(
    (snapshot: CanvasElement[]) => {
      const validIds = new Set(snapshot.map((el) => el.id));
      const stillSelected = selectedIds.filter((id) => validIds.has(id));
      // 선택이 바뀐 경우만 업데이트 (불필요한 리렌더 방지)
      if (stillSelected.length !== selectedIds.length) {
        setSelectedElements(stillSelected);
      }
    },
    [selectedIds, setSelectedElements],
  );

  // ── Undo ──────────────────────────────────
  const undo = useCallback(() => {
    const prev = undoManager.undo(elements);
    if (prev) {
      restoreElements(prev);
      preserveSelection(prev);
    }
  }, [elements, restoreElements, preserveSelection]);

  // ── Redo ──────────────────────────────────
  const redo = useCallback(() => {
    const next = undoManager.redo(elements);
    if (next) {
      restoreElements(next);
      preserveSelection(next);
    }
  }, [elements, restoreElements, preserveSelection]);

  // ── Copy ──────────────────────────────────
  const copy = useCallback(
    (elementId: string) => {
      // 멀티셀렉트: selectedIds에 포함된 모든 요소를 복사
      const idsToCopy = selectedIds.length > 1 ? selectedIds : [elementId];
      const elsToCopy = elements.filter((e) => idsToCopy.includes(e.id));
      if (elsToCopy.length > 0) {
        clipboardRef.current = elsToCopy.map((el) => ({ ...el }));
        setHasClipboard(true);
      }
    },
    [elements, selectedIds],
  );

  // ── Cut (Copy + Delete) ───────────────────
  const cut = useCallback(
    (elementId: string) => {
      copy(elementId);
      if (!setlistId || !itemId || !sectionId) return;
      pushUndoState();
      const idsToRemove = selectedIds.length > 1 ? selectedIds : [elementId];
      for (const id of idsToRemove) {
        removeElement(setlistId, itemId, sectionId, id);
      }
      setSelectedElement(null);
    },
    [copy, selectedIds, setlistId, itemId, sectionId, pushUndoState, removeElement, setSelectedElement],
  );

  // ── Paste ─────────────────────────────────
  const paste = useCallback(() => {
    if (clipboardRef.current.length === 0 || !setlistId || !itemId || !sectionId) return;
    pushUndoState();
    const newIds: string[] = [];
    for (const src of clipboardRef.current) {
      const newEl: CanvasElement = {
        ...src,
        id: `el-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        x: Math.min(src.x + 3, 90),
        y: Math.min(src.y + 3, 90),
        zIndex: elements.length + newIds.length,
      };
      addElement(setlistId, itemId, sectionId, newEl);
      newIds.push(newEl.id);
    }
    // 멀티 페이스트 시 모두 선택
    if (newIds.length === 1) {
      setSelectedElement(newIds[0]);
    } else {
      setSelectedElements(newIds);
    }
  }, [setlistId, itemId, sectionId, elements, pushUndoState, addElement, setSelectedElement, setSelectedElements]);

  // ── Select All ────────────────────────────
  const selectAll = useCallback(() => {
    if (elements.length > 0) {
      setSelectedElements(elements.map((e) => e.id));
    }
  }, [elements, setSelectedElements]);

  // ── Delete Selected ───────────────────────
  const deleteSelected = useCallback(() => {
    if (selectedIds.length === 0 || !setlistId || !itemId || !sectionId) return;
    pushUndoState();
    for (const id of selectedIds) {
      removeElement(setlistId, itemId, sectionId, id);
    }
    setSelectedElement(null);
  }, [selectedIds, setlistId, itemId, sectionId, pushUndoState, removeElement, setSelectedElement]);

  // ── 화살표 넛지 (Arrow Nudge) ──────────────
  // 1920×1080 기준 1px ≈ 100/1920 ≈ 0.052%
  const NUDGE_1PX = 100 / 1920;   // ≈ 0.052%
  const NUDGE_10PX = NUDGE_1PX * 10; // ≈ 0.52%

  const nudge = useCallback(
    (key: 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight', shift: boolean) => {
      if (selectedIds.length === 0 || !setlistId || !itemId || !sectionId) return;

      const step = shift ? NUDGE_10PX : NUDGE_1PX;
      let dx = 0;
      let dy = 0;
      if (key === 'ArrowLeft')  dx = -step;
      if (key === 'ArrowRight') dx = step;
      if (key === 'ArrowUp')    dy = -step;
      if (key === 'ArrowDown')  dy = step;

      pushUndoState();
      for (const id of selectedIds) {
        const el = elements.find((e) => e.id === id);
        if (!el) continue;
        // 경계 제한 없음: 캔버스 밖으로 자유 이동 허용
        updateElement(setlistId, itemId, sectionId, id, { x: el.x + dx, y: el.y + dy });
      }
    },
    [selectedIds, elements, setlistId, itemId, sectionId, pushUndoState, updateElement],
  );

  // ── 키보드 핸들러 공통 로직 ─────────────
  // React onKeyDown용 / window listener용 둘 다 지원
  const processKey = useCallback(
    (e: KeyboardEvent | React.KeyboardEvent) => {
      // 텍스트/폼 입력 중이면 단축키 무시 (네이티브 브라우저 동작 유지)
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'TEXTAREA' || tag === 'INPUT' || tag === 'SELECT') return;
      if (target?.isContentEditable) return;

      const mod = e.metaKey || e.ctrlKey;

      // Undo: Ctrl/Cmd + Z (Shift 없이)
      if (mod && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }

      // Redo: Ctrl/Cmd + Shift + Z  또는  Ctrl/Cmd + Y
      if (mod && ((e.key === 'z' && e.shiftKey) || e.key === 'y')) {
        e.preventDefault();
        redo();
        return;
      }

      // Cut: Ctrl/Cmd + X
      if (mod && e.key === 'x' && selectedId) {
        e.preventDefault();
        cut(selectedId);
        return;
      }

      // Copy: Ctrl/Cmd + C
      if (mod && e.key === 'c' && selectedId) {
        e.preventDefault();
        copy(selectedId);
        return;
      }

      // Paste: Ctrl/Cmd + V
      if (mod && e.key === 'v') {
        e.preventDefault();
        paste();
        return;
      }

      // Select All: Ctrl/Cmd + A
      if (mod && e.key === 'a' && selectedIds.length > 0) {
        e.preventDefault();
        selectAll();
        return;
      }

      // Delete / Backspace — 선택 요소가 있을 때만 동작
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.length > 0) {
        e.preventDefault();
        deleteSelected();
        return;
      }

      // ── 화살표 넛지: 선택된 요소를 1px(≈0.052%) 단위 이동 ──
      // Shift 누르면 10px(≈0.52%) 단위
      const arrowKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
      if (arrowKeys.includes(e.key) && selectedIds.length > 0) {
        e.preventDefault();
        e.stopPropagation(); // useKeyboard 섹션 이동 방지
        nudge(e.key as 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight', e.shiftKey);
        return;
      }
    },
    [selectedId, selectedIds, undo, redo, cut, copy, paste, selectAll, deleteSelected, nudge],
  );

  // React onKeyDown 핸들러 — 캔버스 div에 여전히 바인딩 (하위호환 + focus 상태일 때 즉시 반응)
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      processKey(e);
    },
    [processKey],
  );

  // ── 전역 window keydown 리스너 ─────────────────
  // 에디터 섹션이 활성화된 동안만 바인딩 — focus가 캔버스 밖에 있어도 Undo/Redo 등이 동작
  // 단, 캔버스 div 내부에서 이미 처리된 이벤트는 중복 방지
  useEffect(() => {
    if (!setlistId || !itemId || !sectionId) return;

    const handler = (e: KeyboardEvent) => {
      // 이벤트가 캔버스 내부(tabIndex div)에서 발생한 경우 React onKeyDown에서 이미 처리됨 → 스킵
      const target = e.target as HTMLElement | null;
      if (target?.closest('[data-editor-canvas]')) return;
      processKey(e);
    };
    window.addEventListener('keydown', handler);

    return () => {
      window.removeEventListener('keydown', handler);
    };
  }, [setlistId, itemId, sectionId, processKey]);

  return {
    handleKeyDown,
    hasClipboard,
    commands: {
      undo,
      redo,
      cut,
      copy,
      paste,
      selectAll,
      deleteSelected,
    },
  };
}
