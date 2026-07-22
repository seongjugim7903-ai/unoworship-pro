'use client';

/**
 * components/composer/EraserOverlay.tsx
 * 지우개 도구 오버레이 — 선택된 요소 위에 렌더링
 *
 * 동작:
 *   - 선택된 요소와 동일한 위치/크기로 포지셔닝
 *   - 포인터 이벤트 캡처 → 소프트 브러시 마스크 페인팅
 *   - 마스크 미리보기 캔버스 (반투명 빨간색으로 지워진 영역 표시)
 *   - 브러시 커서 프리뷰 (원형)
 *   - pointerUp 시 마스크를 요소에 저장
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from '@/lib/store';
import { CanvasElement } from '@/lib/canvasTypes';
import { undoManager } from '@/lib/undoManager';
import {
  createMaskCanvas,
  paintStroke,
  exportMask,
  calcElementAspectRatio,
} from '@/lib/imageProcessing/eraser';

interface EraserOverlayProps {
  element: CanvasElement;
  allElements: CanvasElement[];
}

export default function EraserOverlay({ element, allElements }: EraserOverlayProps) {
  const {
    eraserBrushSize,
    eraserHardness,
    currentSetlistId,
    activeItemId,
    activeSectionId,
    updateElement,
    setEraserMode,
  } = useStore();

  const overlayRef = useRef<HTMLDivElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const isPaintingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);

  // 브러시 커서 위치
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);

  // 마스크 프리뷰 업데이트 — 지워진 영역을 반투명 빨간색으로 표시
  const updatePreview = useCallback(() => {
    const preview = previewCanvasRef.current;
    const mask = maskCanvasRef.current;
    if (!preview || !mask) return;

    preview.width = mask.width;
    preview.height = mask.height;
    const ctx = preview.getContext('2d')!;
    ctx.clearRect(0, 0, preview.width, preview.height);

    // 마스크의 투명 영역(지워진 부분)을 빨간색으로 시각화
    ctx.drawImage(mask, 0, 0);
    ctx.globalCompositeOperation = 'source-out';
    ctx.fillStyle = 'rgba(255, 50, 50, 0.35)';
    ctx.fillRect(0, 0, preview.width, preview.height);
    ctx.globalCompositeOperation = 'source-over';
  }, []);

  // 마스크 캔버스 초기화 — 요소 변경 또는 Undo 로 eraserMask 가 바뀔 때 동기화
  const maskVersionRef = useRef(element.eraserMask);
  useEffect(() => {
    // 페인팅 중이면 동기화 스킵 (자체 마스크 캔버스가 최신)
    if (isPaintingRef.current) return;

    const needsReload =
      !maskCanvasRef.current ||
      maskVersionRef.current !== element.eraserMask;

    if (!needsReload) return;

    maskVersionRef.current = element.eraserMask;
    const ar = calcElementAspectRatio(element.width, element.height);
    createMaskCanvas(ar, element.eraserMask).then((canvas) => {
      maskCanvasRef.current = canvas;
      updatePreview();
    });
  }, [element.id, element.eraserMask, element.width, element.height, updatePreview]);

  // ESC 키: 지우개 모드 해제 → 기본 마우스로 복귀
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setEraserMode(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setEraserMode]);

  // 포인터 → 정규화 좌표 (0–1)
  const getNormalizedPos = useCallback((e: React.PointerEvent | PointerEvent) => {
    const rect = overlayRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return {
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
    };
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);

    isPaintingRef.current = true;
    const pos = getNormalizedPos(e);
    if (!pos) return;
    lastPointRef.current = pos;

    // Undo 스냅샷: 첫 dab 전에 저장 → Ctrl+Z 로 되돌리기 가능
    undoManager.pushState(allElements);

    // 첫 dab
    const maskCtx = maskCanvasRef.current?.getContext('2d');
    if (maskCtx) {
      paintStroke(maskCtx, pos, pos, eraserBrushSize, eraserHardness);
      updatePreview();
    }
  }, [eraserBrushSize, eraserHardness, getNormalizedPos, updatePreview, allElements]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const pos = getNormalizedPos(e);
    if (pos) setCursorPos(pos);

    if (!isPaintingRef.current || !pos || !lastPointRef.current) return;

    const maskCtx = maskCanvasRef.current?.getContext('2d');
    if (!maskCtx) return;

    paintStroke(maskCtx, lastPointRef.current, pos, eraserBrushSize, eraserHardness);
    lastPointRef.current = pos;
    updatePreview();
  }, [eraserBrushSize, eraserHardness, getNormalizedPos, updatePreview]);

  const handlePointerUp = useCallback(() => {
    if (!isPaintingRef.current) return;
    isPaintingRef.current = false;
    lastPointRef.current = null;

    // 마스크를 요소에 저장
    const mask = maskCanvasRef.current;
    if (!mask || !currentSetlistId || !activeItemId || !activeSectionId) return;

    const maskDataUrl = exportMask(mask);
    maskVersionRef.current = maskDataUrl; // Undo 동기화 방지
    updateElement(currentSetlistId, activeItemId, activeSectionId, element.id, {
      eraserMask: maskDataUrl,
    });
  }, [element.id, currentSetlistId, activeItemId, activeSectionId, updateElement]);

  // 브러시 커서 크기 (CSS px)
  const getBrushCursorSize = useCallback(() => {
    const rect = overlayRef.current?.getBoundingClientRect();
    if (!rect) return 20;
    const shortEdge = Math.min(rect.width, rect.height);
    return eraserBrushSize * shortEdge;
  }, [eraserBrushSize]);

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
        cursor: 'none', // 커스텀 커서 사용
        touchAction: 'none',
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={() => {
        setCursorPos(null);
        if (isPaintingRef.current) handlePointerUp();
      }}
    >
      {/* 마스크 프리뷰 캔버스 */}
      <canvas
        ref={previewCanvasRef}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
        }}
      />

      {/* 테두리 — 지우개 모드 표시 */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          border: '2px dashed rgba(255, 100, 100, 0.6)',
          borderRadius: '2px',
          pointerEvents: 'none',
        }}
      />

      {/* 브러시 커서 */}
      {cursorPos && (
        <div
          style={{
            position: 'absolute',
            left: `${cursorPos.x * 100}%`,
            top: `${cursorPos.y * 100}%`,
            width: getBrushCursorSize(),
            height: getBrushCursorSize(),
            transform: 'translate(-50%, -50%)',
            border: '1.5px solid rgba(255, 255, 255, 0.7)',
            borderRadius: '50%',
            pointerEvents: 'none',
            boxShadow: '0 0 0 1px rgba(0, 0, 0, 0.3)',
          }}
        />
      )}
    </div>
  );
}
