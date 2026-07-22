'use client';

/**
 * useCanvasBoardCommands.ts
 * 캔버스 보드 키보드 단축키 — canvasStore 기반
 *
 * Ctrl+Z, Ctrl+Y, Ctrl+C/V/X, Ctrl+A, Delete, 화살표 넛지
 */

import { useCallback, useRef, useState, useEffect } from 'react';
import { CanvasElement } from '@/lib/canvasTypes';
import { useCanvasStore } from '@/app/canvas/lib/canvasStore';
import { undoManager } from '@/lib/undoManager';

interface Options {
  elements: CanvasElement[];
  selectedIds: string[];
}

export function useCanvasBoardCommands({ elements, selectedIds }: Options) {
  const {
    setSelectedElement,
    setSelectedElements,
    addElement,
    updateElement,
    removeElement,
    reorderElements,
  } = useCanvasStore();

  const clipboardRef = useRef<CanvasElement | null>(null);
  const [hasClipboard, setHasClipboard] = useState(false);

  const activePageId = useCanvasStore((s) => s.activePageId);

  // 페이지 변경 시 undo 초기화
  useEffect(() => { undoManager.clear(); }, [activePageId]);

  const pushUndoState = useCallback(() => {
    undoManager.pushState(elements);
  }, [elements]);

  const restoreElements = useCallback(
    (snapshot: CanvasElement[]) => {
      reorderElements(snapshot);
    },
    [reorderElements]
  );

  // ── Undo/Redo 후 선택 상태 복원 ──
  const preserveSelection = useCallback(
    (snapshot: CanvasElement[]) => {
      const validIds = new Set(snapshot.map((el) => el.id));
      const stillSelected = selectedIds.filter((id) => validIds.has(id));
      if (stillSelected.length !== selectedIds.length) {
        setSelectedElements(stillSelected);
      }
    },
    [selectedIds, setSelectedElements]
  );

  // ── Undo / Redo ──
  const undo = useCallback(() => {
    const prev = undoManager.undo(elements);
    if (prev) { restoreElements(prev); preserveSelection(prev); }
  }, [elements, restoreElements, preserveSelection]);

  const redo = useCallback(() => {
    const next = undoManager.redo(elements);
    if (next) { restoreElements(next); preserveSelection(next); }
  }, [elements, restoreElements, preserveSelection]);

  // ── Copy / Cut / Paste ──
  const copy = useCallback((id: string) => {
    const el = elements.find((e) => e.id === id);
    if (el) { clipboardRef.current = { ...el }; setHasClipboard(true); }
  }, [elements]);

  const cut = useCallback((id: string) => {
    copy(id);
    pushUndoState();
    removeElement(id);
    setSelectedElement(null);
  }, [copy, pushUndoState, removeElement, setSelectedElement]);

  const paste = useCallback(() => {
    if (!clipboardRef.current) return;
    pushUndoState();
    const src = clipboardRef.current;
    const newEl: CanvasElement = {
      ...src,
      id: `el-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      x: Math.min(src.x + 3, 90),
      y: Math.min(src.y + 3, 90),
      zIndex: elements.length,
    };
    addElement(newEl);
  }, [elements, pushUndoState, addElement]);

  // ── Select All / Delete ──
  const selectAll = useCallback(() => {
    if (elements.length > 0) setSelectedElements(elements.map((e) => e.id));
  }, [elements, setSelectedElements]);

  const deleteSelected = useCallback(() => {
    if (selectedIds.length === 0) return;
    pushUndoState();
    for (const id of selectedIds) removeElement(id);
    setSelectedElement(null);
  }, [selectedIds, pushUndoState, removeElement, setSelectedElement]);

  // ── 화살표 넛지 ──
  const NUDGE_1PX = 100 / 1920;
  const NUDGE_10PX = NUDGE_1PX * 10;

  const nudge = useCallback(
    (key: string, shift: boolean) => {
      if (selectedIds.length === 0) return;
      const step = shift ? NUDGE_10PX : NUDGE_1PX;
      let dx = 0, dy = 0;
      if (key === 'ArrowLeft') dx = -step;
      if (key === 'ArrowRight') dx = step;
      if (key === 'ArrowUp') dy = -step;
      if (key === 'ArrowDown') dy = step;

      pushUndoState();
      for (const id of selectedIds) {
        const el = elements.find((e) => e.id === id);
        if (!el) continue;
        updateElement(id, {
          x: Math.max(0, Math.min(100 - el.width, el.x + dx)),
          y: Math.max(0, Math.min(100 - el.height, el.y + dy)),
        });
      }
    },
    [selectedIds, elements, pushUndoState, updateElement]
  );

  // ── 키보드 핸들러 공통 로직 (React onKeyDown + window 리스너 둘 다 지원) ──
  const processKey = useCallback(
    (e: KeyboardEvent | React.KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'TEXTAREA' || tag === 'INPUT' || tag === 'SELECT') return;
      if (target?.isContentEditable) return;

      const mod = e.metaKey || e.ctrlKey;
      const selectedId = selectedIds[0] ?? null;

      if (mod && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return; }
      if (mod && ((e.key === 'z' && e.shiftKey) || e.key === 'y')) { e.preventDefault(); redo(); return; }
      if (mod && e.key === 'x' && selectedId) { e.preventDefault(); cut(selectedId); return; }
      if (mod && e.key === 'c' && selectedId) { e.preventDefault(); copy(selectedId); return; }
      if (mod && e.key === 'v') { e.preventDefault(); paste(); return; }
      if (mod && e.key === 'a' && selectedIds.length > 0) { e.preventDefault(); selectAll(); return; }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.length > 0) {
        e.preventDefault(); deleteSelected(); return;
      }

      const arrowKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
      if (arrowKeys.includes(e.key) && selectedIds.length > 0) {
        e.preventDefault();
        nudge(e.key, e.shiftKey);
        return;
      }
    },
    [selectedIds, undo, redo, cut, copy, paste, selectAll, deleteSelected, nudge]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => { processKey(e); },
    [processKey]
  );

  // ── 전역 window keydown 리스너 — focus 무관하게 Ctrl+Z 등 동작 ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => processKey(e);
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [processKey]);

  return {
    handleKeyDown,
    hasClipboard,
    commands: { undo, redo, cut, copy, paste, selectAll, deleteSelected },
  };
}
