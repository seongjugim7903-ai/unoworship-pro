'use client';

/**
 * useCanvasBoardEditor.ts
 * 캔버스 보드 전용 에디터 훅 — canvasStore 기반
 *
 * UnoLive의 useCanvasEditor.ts 로직을 canvasStore에 맞게 래핑
 */

import { useCallback, useRef, useState, useEffect } from 'react';
import { CanvasElement } from '@/lib/canvasTypes';
import { useCanvasStore } from '@/app/canvas/lib/canvasStore';
import { snapToGuides, type SnapResult } from '@/lib/canvasGuides';
import { snapToElements, type AlignGuideLine } from '@/lib/elementSnap';
import { undoManager } from '@/lib/undoManager';

export type HandleId =
  | 'nw' | 'n' | 'ne'
  | 'w'  |        'e'
  | 'sw' | 's' | 'se'
  | 'rotate'
  | 'move';

interface DragSession {
  handleId: HandleId;
  startX: number;
  startY: number;
  startEl: CanvasElement;
  canvasW: number;
  canvasH: number;
  multiStarts: { id: string; x: number; y: number; width: number; height: number }[];
}

interface Options {
  elements: CanvasElement[];
  canvasRef: React.RefObject<HTMLDivElement | null>;
}

export function useCanvasBoardEditor({ elements, canvasRef }: Options) {
  const {
    selectedElementIds,
    setSelectedElement,
    toggleSelectedElement,
    updateElement,
  } = useCanvasStore();

  const selectedIds = selectedElementIds;
  const [isDragging, setIsDragging] = useState(false);
  const [snapState, setSnapState] = useState<SnapResult | null>(null);
  const [elementSnapGuides, setElementSnapGuides] = useState<AlignGuideLine[]>([]);
  const dragSession = useRef<DragSession | null>(null);
  const onPointerUpRef = useRef<(() => void) | null>(null);
  const elementsRef = useRef(elements);
  useEffect(() => { elementsRef.current = elements; }, [elements]);

  // ── 포인터 무브 ──
  const onPointerMove = useCallback((e: PointerEvent) => {
    const session = dragSession.current;
    if (!session) return;

    const dx = e.clientX - session.startX;
    const dy = e.clientY - session.startY;
    const { canvasW, canvasH, startEl, handleId } = session;
    const pctX = (px: number) => (px / canvasW) * 100;
    const pctY = (px: number) => (px / canvasH) * 100;

    let updates: Partial<CanvasElement> = {};

    if (handleId === 'move') {
      const rawX = Math.max(0, Math.min(100 - startEl.width, startEl.x + pctX(dx)));
      const rawY = Math.max(0, Math.min(100 - startEl.height, startEl.y + pctY(dy)));

      const multiIds = new Set(session.multiStarts.map((m) => m.id));
      const snapTargets = elementsRef.current.filter(
        (el) => el.id !== startEl.id && !multiIds.has(el.id),
      );

      const elSnap = snapToElements(rawX, rawY, startEl.width, startEl.height, startEl.id, snapTargets);
      const elSnappedX = elSnap.x !== rawX;
      const elSnappedY = elSnap.y !== rawY;

      const canvasSnap = snapToGuides(rawX, rawY, startEl.width, startEl.height);
      const mergedSnap = {
        ...canvasSnap,
        x: elSnappedX ? elSnap.x : canvasSnap.x,
        y: elSnappedY ? elSnap.y : canvasSnap.y,
        snappedCenterX: elSnappedX ? false : canvasSnap.snappedCenterX,
        snappedLeft: elSnappedX ? false : canvasSnap.snappedLeft,
        snappedRight: elSnappedX ? false : canvasSnap.snappedRight,
        snappedCenterY: elSnappedY ? false : canvasSnap.snappedCenterY,
        snappedTop: elSnappedY ? false : canvasSnap.snappedTop,
        snappedBottom: elSnappedY ? false : canvasSnap.snappedBottom,
      };
      setSnapState(mergedSnap);
      setElementSnapGuides(elSnap.guides);

      const finalX = Math.max(0, Math.min(100 - startEl.width, mergedSnap.x));
      const finalY = Math.max(0, Math.min(100 - startEl.height, mergedSnap.y));
      updates = { x: finalX, y: finalY };

      // 멀티 드래그
      if (session.multiStarts.length > 0) {
        const deltaX = finalX - startEl.x;
        const deltaY = finalY - startEl.y;
        for (const ms of session.multiStarts) {
          updateElement(ms.id, {
            x: Math.max(0, Math.min(100 - ms.width, ms.x + deltaX)),
            y: Math.max(0, Math.min(100 - ms.height, ms.y + deltaY)),
          });
        }
      }
    } else if (handleId === 'rotate') {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const cx = rect.left + (startEl.x + startEl.width / 2) * canvasW / 100;
      const cy = rect.top + (startEl.y + startEl.height / 2) * canvasH / 100;
      const angle = Math.atan2(e.clientY - cy, e.clientX - cx) * (180 / Math.PI) + 90;
      updates = { rotation: Math.round(angle) };
    } else {
      let { x, y, width, height } = startEl;
      const MIN = 5;
      if (handleId.includes('e')) width = Math.max(MIN, startEl.width + pctX(dx));
      if (handleId.includes('s')) height = Math.max(MIN, startEl.height + pctY(dy));
      if (handleId.includes('w')) {
        const nw = Math.max(MIN, startEl.width - pctX(dx));
        x = startEl.x + (startEl.width - nw);
        width = nw;
      }
      if (handleId.includes('n')) {
        const nh = Math.max(MIN, startEl.height - pctY(dy));
        y = startEl.y + (startEl.height - nh);
        height = nh;
      }
      updates = { x, y, width, height };

      // 텍스트 요소: 수동 리사이즈 시 해당 축 auto 해제 (피그마 동작)
      if (startEl.type === 'text') {
        const touchesWidth = handleId.includes('e') || handleId.includes('w');
        const touchesHeight = handleId.includes('n') || handleId.includes('s');
        if (touchesWidth) (updates as Record<string, unknown>).autoWidth = false;
        if (touchesHeight) (updates as Record<string, unknown>).autoHeight = false;
      }
    }

    updateElement(startEl.id, updates);
  }, [updateElement, canvasRef]);

  // ── 포인터 업 ──
  const onPointerUp = useCallback(() => {
    if (!dragSession.current) return;
    dragSession.current = null;
    setIsDragging(false);
    setSnapState(null);
    setElementSnapGuides([]);
    undoManager.endBatch();
    window.removeEventListener('pointermove', onPointerMove);
    if (onPointerUpRef.current) {
      window.removeEventListener('pointerup', onPointerUpRef.current);
    }
  }, [onPointerMove]);

  // ── 요소 포인터다운 ──
  const onElementPointerDown = useCallback(
    (elementId: string, handleId: HandleId) =>
      (e: React.PointerEvent<HTMLDivElement>) => {
        e.stopPropagation();

        if (e.shiftKey && handleId === 'move') {
          toggleSelectedElement(elementId);
          return;
        }

        if (!selectedIds.includes(elementId)) {
          setSelectedElement(elementId);
        }

        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;
        const el = elements.find((el) => el.id === elementId);
        if (!el) return;

        undoManager.beginBatch(elements);

        const isMultiMove = handleId === 'move' && selectedIds.includes(elementId) && selectedIds.length > 1;
        const multiStarts = isMultiMove
          ? elements
              .filter((o) => selectedIds.includes(o.id) && o.id !== elementId)
              .map((o) => ({ id: o.id, x: o.x, y: o.y, width: o.width, height: o.height }))
          : [];

        dragSession.current = {
          handleId,
          startX: e.clientX,
          startY: e.clientY,
          startEl: { ...el },
          canvasW: rect.width,
          canvasH: rect.height,
          multiStarts,
        };
        setIsDragging(true);
        onPointerUpRef.current = onPointerUp;
        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', onPointerUp);
      },
    [elements, canvasRef, selectedIds, setSelectedElement, toggleSelectedElement, onPointerMove, onPointerUp]
  );

  // ── 캔버스 배경 클릭 ──
  const onCanvasPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) {
        setSelectedElement(null);
      }
    },
    [setSelectedElement]
  );

  return {
    selectedIds,
    isDragging,
    snapState,
    elementSnapGuides,
    onCanvasPointerDown,
    onElementPointerDown,
  };
}
