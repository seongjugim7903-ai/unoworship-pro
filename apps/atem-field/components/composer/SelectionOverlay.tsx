'use client';

/**
 * components/composer/SelectionOverlay.tsx
 * 선택 도구 오버레이 — 포토샵 사각 선택 (Marquee)
 *
 * 동작:
 *   - 선택된 요소와 동일한 위치/크기로 포지셔닝
 *   - 포인터 드래그 → 점선 사각 영역 그리기
 *   - 드래그 완료 시 선택 영역 확정 (점선 유지)
 *   - 확정 후 화살표 키 → 선택 영역 이동 (Shift 누르면 10배 속도)
 *   - 확정 후 마우스 드래그 → 선택 영역 이동
 *   - 패널에서 너비/높이 숫자 입력 → 선택 영역 크기 변경
 *   - Ctrl/Cmd+C → 선택 영역 크롭하여 클립보드에 저장
 *   - Ctrl/Cmd+V → 클립보드 이미지를 새 요소로 붙여넣기
 *   - ESC → 선택 모드 해제
 *   - Enter → 선택 영역 크롭 + 즉시 새 요소 생성
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from '@/lib/store';
import { CanvasElement, ImageElement } from '@/lib/canvasTypes';
import { normalizeRect, cropImageRegion, SelectionRect } from '@/lib/imageProcessing/selectionTool';
import { undoManager } from '@/lib/undoManager';

interface SelectionOverlayProps {
  element: CanvasElement;
  allElements: CanvasElement[];
}

export default function SelectionOverlay({ element, allElements }: SelectionOverlayProps) {
  const {
    currentSetlistId,
    activeItemId,
    activeSectionId,
    setSelectionMode,
    setSelectionClipboard,
    selectionClipboard,
    addElement,
  } = useStore();

  const overlayRef = useRef<HTMLDivElement>(null);
  const isDraggingNewRef = useRef(false);   // 새 선택 영역 드래그 중
  const isMovingRef = useRef(false);        // 기존 선택 영역 이동 중
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const moveStartRef = useRef<{ x: number; y: number; rect: SelectionRect } | null>(null);

  // 현재 드래그 중인 사각 영역 (정규화 좌표 0–1)
  const [dragRect, setDragRect] = useState<SelectionRect | null>(null);
  // 확정된 선택 영역
  const [selectionRect, setSelectionRect] = useState<SelectionRect | null>(null);
  // 복사 완료 피드백
  const [copied, setCopied] = useState(false);

  // 포인터 → 정규화 좌표 (0–1)
  const getNormalizedPos = useCallback((e: React.PointerEvent | PointerEvent) => {
    const rect = overlayRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return {
      x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)),
    };
  }, []);

  // 포인터가 확정된 선택 영역 내부인지 체크
  const isInsideSelection = useCallback((pos: { x: number; y: number }) => {
    if (!selectionRect) return false;
    return (
      pos.x >= selectionRect.x &&
      pos.x <= selectionRect.x + selectionRect.w &&
      pos.y >= selectionRect.y &&
      pos.y <= selectionRect.y + selectionRect.h
    );
  }, [selectionRect]);

  // ── 포인터 이벤트 ──────────────────────
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);

    const pos = getNormalizedPos(e);
    if (!pos) return;

    // 확정된 선택 영역 내부 클릭 → 이동 모드
    if (selectionRect && isInsideSelection(pos)) {
      isMovingRef.current = true;
      moveStartRef.current = { x: pos.x, y: pos.y, rect: { ...selectionRect } };
      return;
    }

    // 선택 영역 밖 클릭 → 새로운 선택 영역 드래그
    isDraggingNewRef.current = true;
    startRef.current = pos;
    setDragRect(null);
    setSelectionRect(null);
    setCopied(false);
  }, [getNormalizedPos, selectionRect, isInsideSelection]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const pos = getNormalizedPos(e);
    if (!pos) return;

    // 이동 모드
    if (isMovingRef.current && moveStartRef.current) {
      const dx = pos.x - moveStartRef.current.x;
      const dy = pos.y - moveStartRef.current.y;
      const orig = moveStartRef.current.rect;
      setSelectionRect({
        x: Math.max(0, Math.min(1 - orig.w, orig.x + dx)),
        y: Math.max(0, Math.min(1 - orig.h, orig.y + dy)),
        w: orig.w,
        h: orig.h,
      });
      return;
    }

    // 새 선택 드래그
    if (!isDraggingNewRef.current || !startRef.current) return;
    const rect = normalizeRect(startRef.current.x, startRef.current.y, pos.x, pos.y);
    setDragRect(rect);
  }, [getNormalizedPos]);

  const handlePointerUp = useCallback(() => {
    if (isMovingRef.current) {
      isMovingRef.current = false;
      moveStartRef.current = null;
      return;
    }

    if (!isDraggingNewRef.current) return;
    isDraggingNewRef.current = false;

    if (dragRect && dragRect.w > 0.01 && dragRect.h > 0.01) {
      setSelectionRect(dragRect);
    }
    setDragRect(null);
  }, [dragRect]);

  // ── 선택 영역 크롭 → 클립보드 저장 ──────
  const cropSelection = useCallback(async () => {
    if (!selectionRect) return null;

    if (element.type === 'image') {
      const img = element as ImageElement;
      try {
        return await cropImageRegion(img.src, selectionRect, img.objectFit);
      } catch {
        return null;
      }
    }

    if (element.type === 'shape' && (element as any).imageFill?.src) {
      try {
        return await cropImageRegion((element as any).imageFill.src, selectionRect);
      } catch {
        return null;
      }
    }

    return null;
  }, [selectionRect, element]);

  // ── 크롭 → 새 요소 생성 ──────────────────
  const pasteAsNewElement = useCallback(async (dataUrl: string) => {
    if (!currentSetlistId || !activeItemId || !activeSectionId) return;

    const img = new Image();
    await new Promise<void>((resolve) => {
      img.onload = () => resolve();
      img.onerror = () => resolve();
      img.src = dataUrl;
    });

    const newEl: ImageElement = {
      id: `el-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      type: 'image',
      src: dataUrl,
      objectFit: 'fill',
      x: Math.min(element.x + (selectionRect?.x ?? 0) * element.width + 2, 90),
      y: Math.min(element.y + (selectionRect?.y ?? 0) * element.height + 2, 90),
      width: selectionRect ? selectionRect.w * element.width : 20,
      height: selectionRect ? selectionRect.h * element.height : 20,
      rotation: 0,
      opacity: 1,
      zIndex: allElements.length,
      locked: false,
      visible: true,
    };

    undoManager.pushState(allElements);
    addElement(currentSetlistId, activeItemId, activeSectionId, newEl);
  }, [currentSetlistId, activeItemId, activeSectionId, element, selectionRect, allElements, addElement]);

  // ── 더블클릭 → 크롭 + 새 요소 생성 ──────
  const handleDoubleClick = useCallback(async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!selectionRect) return;

    const dataUrl = await cropSelection();
    if (dataUrl) {
      await pasteAsNewElement(dataUrl);
      setSelectionMode(false);
    }
  }, [selectionRect, cropSelection, pasteAsNewElement, setSelectionMode]);

  // ── 키보드 이벤트 (ESC, Ctrl+C/V, Arrow) ──────
  useEffect(() => {
    const NUDGE = 0.01;       // 1%
    const NUDGE_SHIFT = 0.05; // 5%

    const handleKeyDown = async (e: KeyboardEvent) => {
      // ESC → 선택 모드 해제
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setSelectionMode(false);
        return;
      }

      // 선택 모드 중 Enter/Space 차단 → 송출 방지
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      const mod = e.metaKey || e.ctrlKey;

      // Ctrl/Cmd+C → 선택 영역 크롭하여 클립보드 저장
      if (mod && e.key === 'c' && selectionRect) {
        e.preventDefault();
        e.stopPropagation();
        const dataUrl = await cropSelection();
        if (dataUrl) {
          setSelectionClipboard(dataUrl);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        }
        return;
      }

      // Ctrl/Cmd+V → 클립보드 이미지를 새 요소로 붙여넣기
      if (mod && e.key === 'v' && selectionClipboard) {
        e.preventDefault();
        e.stopPropagation();
        await pasteAsNewElement(selectionClipboard);
        setSelectionMode(false);
        return;
      }

      // ── 화살표 키 → 선택 영역 이동 ──
      const arrowKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
      if (arrowKeys.includes(e.key) && selectionRect) {
        e.preventDefault();
        e.stopPropagation();
        const step = e.shiftKey ? NUDGE_SHIFT : NUDGE;
        let dx = 0, dy = 0;
        if (e.key === 'ArrowLeft')  dx = -step;
        if (e.key === 'ArrowRight') dx = step;
        if (e.key === 'ArrowUp')    dy = -step;
        if (e.key === 'ArrowDown')  dy = step;

        setSelectionRect((prev) => {
          if (!prev) return prev;
          return {
            x: Math.max(0, Math.min(1 - prev.w, prev.x + dx)),
            y: Math.max(0, Math.min(1 - prev.h, prev.y + dy)),
            w: prev.w,
            h: prev.h,
          };
        });
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown, true); // capture 단계에서 차단
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [selectionRect, selectionClipboard, cropSelection, pasteAsNewElement, setSelectionMode, setSelectionClipboard]);

  // ── 패널에서 너비/높이 입력 이벤트 수신 ──────
  useEffect(() => {
    const handleResize = (e: Event) => {
      const detail = (e as CustomEvent).detail as { w?: number; h?: number };
      setSelectionRect((prev) => {
        // 선택 영역이 없으면 중앙에 새로 생성
        const base: SelectionRect = prev ?? { x: 0.25, y: 0.25, w: 0.5, h: 0.5 };
        // detail.w / detail.h 는 이미 요소 내부 비율(0–1)로 변환된 값
        const newW = detail.w != null ? detail.w : base.w;
        const newH = detail.h != null ? detail.h : base.h;
        return {
          x: Math.max(0, Math.min(1 - newW, base.x)),
          y: Math.max(0, Math.min(1 - newH, base.y)),
          w: Math.min(1, newW),
          h: Math.min(1, newH),
        };
      });
    };

    window.addEventListener('selection-resize', handleResize);
    return () => window.removeEventListener('selection-resize', handleResize);
  }, []);

  // 현재 표시할 사각 영역
  const displayRect = dragRect || selectionRect;

  // 확정된 선택 영역 내부일 때 커서 변경
  const cursorStyle = selectionRect && !isDraggingNewRef.current ? 'default' : 'crosshair';

  return (
    <div
      ref={overlayRef}
      style={{
        position: 'absolute',
        left: `${element.x}%`,
        top: `${element.y}%`,
        width: `${element.width}%`,
        height: `${element.height}%`,
        transform: element.rotation ? `rotate(${element.rotation}deg)` : undefined,
        transformOrigin: 'center center',
        zIndex: 10000,
        cursor: cursorStyle,
        touchAction: 'none',
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={() => {
        if (isDraggingNewRef.current) handlePointerUp();
        if (isMovingRef.current) {
          isMovingRef.current = false;
          moveStartRef.current = null;
        }
      }}
    >
      {/* 요소 테두리 — 선택 모드 표시 */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          border: '2px dashed rgba(59, 130, 246, 0.6)',
          borderRadius: '2px',
          pointerEvents: 'none',
        }}
      />

      {/* 선택 영역 사각 — 포토샵 스타일 점선 (marching ants) */}
      {displayRect && (
        <div
          style={{
            position: 'absolute',
            left: `${displayRect.x * 100}%`,
            top: `${displayRect.y * 100}%`,
            width: `${displayRect.w * 100}%`,
            height: `${displayRect.h * 100}%`,
            border: '1.5px dashed rgba(255, 255, 255, 0.9)',
            boxShadow: '0 0 0 1px rgba(0, 0, 0, 0.5)',
            background: 'rgba(59, 130, 246, 0.1)',
            pointerEvents: 'none',
            animation: 'marching-ants 0.5s linear infinite',
          }}
        />
      )}

      {/* 선택 영역 외부 어둡게 (확정된 선택 영역이 있을 때만) */}
      {selectionRect && !dragRect && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.3)',
            pointerEvents: 'none',
            clipPath: `polygon(
              0% 0%, 100% 0%, 100% 100%, 0% 100%,
              0% ${selectionRect.y * 100}%,
              ${selectionRect.x * 100}% ${selectionRect.y * 100}%,
              ${selectionRect.x * 100}% ${(selectionRect.y + selectionRect.h) * 100}%,
              ${(selectionRect.x + selectionRect.w) * 100}% ${(selectionRect.y + selectionRect.h) * 100}%,
              ${(selectionRect.x + selectionRect.w) * 100}% ${selectionRect.y * 100}%,
              0% ${selectionRect.y * 100}%
            )`,
          }}
        />
      )}

      {/* 확정 영역일 때 이동 + 더블클릭 크롭 영역 */}
      {selectionRect && !dragRect && (
        <div
          style={{
            position: 'absolute',
            left: `${selectionRect.x * 100}%`,
            top: `${selectionRect.y * 100}%`,
            width: `${selectionRect.w * 100}%`,
            height: `${selectionRect.h * 100}%`,
            cursor: 'move',
            pointerEvents: 'auto',
          }}
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
            const pos = getNormalizedPos(e);
            if (!pos) return;
            isMovingRef.current = true;
            moveStartRef.current = { x: pos.x, y: pos.y, rect: { ...selectionRect } };
          }}
          onPointerMove={(e) => {
            if (!isMovingRef.current || !moveStartRef.current) return;
            const pos = getNormalizedPos(e);
            if (!pos) return;
            const dx = pos.x - moveStartRef.current.x;
            const dy = pos.y - moveStartRef.current.y;
            const orig = moveStartRef.current.rect;
            setSelectionRect({
              x: Math.max(0, Math.min(1 - orig.w, orig.x + dx)),
              y: Math.max(0, Math.min(1 - orig.h, orig.y + dy)),
              w: orig.w,
              h: orig.h,
            });
          }}
          onPointerUp={() => {
            isMovingRef.current = false;
            moveStartRef.current = null;
          }}
          onDoubleClick={handleDoubleClick}
        />
      )}

      {/* 복사 완료 피드백 */}
      {copied && selectionRect && (
        <div
          style={{
            position: 'absolute',
            left: `${(selectionRect.x + selectionRect.w / 2) * 100}%`,
            top: `${(selectionRect.y + selectionRect.h / 2) * 100}%`,
            transform: 'translate(-50%, -50%)',
            background: 'rgba(34, 197, 94, 0.9)',
            color: '#fff',
            fontSize: '11px',
            fontWeight: 600,
            padding: '4px 10px',
            borderRadius: '4px',
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
            zIndex: 1,
          }}
        >
          복사됨 — Ctrl+V로 붙여넣기
        </div>
      )}

      {/* 안내 텍스트 (선택 영역 없을 때) */}
      {!displayRect && (
        <div
          style={{
            position: 'absolute',
            left: '50%',
            bottom: '-22px',
            transform: 'translateX(-50%)',
            fontSize: '10px',
            color: 'rgba(147, 197, 253, 0.8)',
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
          }}
        >
          드래그로 영역 선택 · 화살표로 이동 · 더블클릭 복사 · ESC 취소
        </div>
      )}

      {/* 선택 영역 확정 시 크기 표시 */}
      {selectionRect && !dragRect && (
        <div
          style={{
            position: 'absolute',
            left: `${(selectionRect.x + selectionRect.w) * 100}%`,
            top: `${(selectionRect.y + selectionRect.h) * 100}%`,
            transform: 'translate(4px, 4px)',
            fontSize: '10px',
            color: 'rgba(147, 197, 253, 0.9)',
            background: 'rgba(0, 0, 0, 0.6)',
            padding: '2px 5px',
            borderRadius: '3px',
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            zIndex: 1,
          }}
        >
          {Math.round(selectionRect.w * (element.width / 100) * 1920)} × {Math.round(selectionRect.h * (element.height / 100) * 1080)} px
        </div>
      )}

      {/* CSS animation for marching ants */}
      <style>{`
        @keyframes marching-ants {
          0%   { border-color: rgba(255,255,255,0.9); }
          50%  { border-color: rgba(0,0,0,0.9); }
          100% { border-color: rgba(255,255,255,0.9); }
        }
      `}</style>
    </div>
  );
}
