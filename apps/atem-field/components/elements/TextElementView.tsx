'use client';

/**
 * TextElementView.tsx
 * 에디터 캔버스 위에 표시되는 텍스트 요소 (CSS div 기반)
 *
 * [FEATURE: CANVAS_SCALE]
 *   에디터 캔버스는 1920px 기준으로 설계됨.
 *   실제 캔버스 너비를 ResizeObserver로 감지해
 *   scale = 실제너비 / 1920 을 계산 후
 *   fontSize / strokeWidth / letterSpacing 을 비례 스케일 적용.
 *   BoundingBox 가 포함된 부모(wrapContextMenu div = canvas fill)를 관찰.
 *   ★ EditorCanvas.tsx 수정 없이 동작.
 *
 * [FIX: DOUBLE_CLICK_EDIT]
 *   isEditing 상태를 TextEditContext 에서 가져옴.
 *   BoundingBox 이동 핸들 더블클릭 → requestEdit → 여기서 InlineTextEditor 렌더.
 *
 * ★ 인라인 편집 UI: components/editor/InlineTextEditor.tsx
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { TextElement } from '@/lib/canvasTypes';
import { HandleId } from '@/hooks/useCanvasEditor';
import InlineTextEditor from '@/components/editor/InlineTextEditor';
import { useTextEdit } from '@/lib/textEditContext';
import { useStore } from '@/lib/store';
import { getTextElementContent } from '@/lib/sectionText';

interface TextElementViewProps {
  element: TextElement;
  sectionText?: string;
  isSelected: boolean;
  onPointerDown: (handleId: HandleId) => (e: React.PointerEvent<HTMLDivElement>) => void;
  onContentChange?: (newContent: string) => void;
  /** 텍스트 auto 사이즈 콜백 (% 단위) */
  onHeightChange?: (newHeight: number) => void;
  onWidthChange?: (newWidth: number) => void;
  /** 외부에서 전달하는 전체 요소 배열 (Undo 스냅샷용). 없으면 UnoLive store에서 조회 */
  allElements?: import('@/lib/canvasTypes').CanvasElement[];
}

/** 기준 캔버스 너비: 출력 해상도 (1920px) */
const OUTPUT_WIDTH = 1920;

export default function TextElementView({
  element,
  sectionText,
  isSelected,
  onPointerDown,
  onContentChange,
  onHeightChange,
  onWidthChange,
  allElements: allElementsProp,
}: TextElementViewProps) {
  // ── TextEditContext: 더블클릭 편집 상태 ─────────────
  const { editingElementId, selectAllOnEdit, requestEdit, closeEdit } = useTextEdit();
  const isEditing = editingElementId === element.id;

  // [UNDO] 텍스트 편집 시작 시 elements 스냅샷 전달용
  // 외부에서 allElements prop이 전달되면 우선 사용 (캔버스 에디터 등)
  const { setlists, currentSetlistId, activeItemId, activeSectionId } = useStore();
  const _section = setlists.find(s => s.id === currentSetlistId)
    ?.items.find(i => i.id === activeItemId)
    ?.sections.find(s => s.id === activeSectionId);
  const _allElements = allElementsProp ?? (_section?.elements ?? []);

  // ── [FEATURE: CANVAS_SCALE] 캔버스 실제 너비 감지 ──
  const divRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [canvasWidth, setCanvasWidth] = useState(OUTPUT_WIDTH);
  const [canvasHeight, setCanvasHeight] = useState(1080);

  useEffect(() => {
    // 에디터 캔버스 div 를 찾기: aspect-ratio 16/9 가 설정된 가장 가까운 부모
    // (wrapContextMenu가 display:contents 이므로 parentElement 크기 = 0)
    const el = divRef.current;
    if (!el) return;

    // 실제 캔버스 컨테이너를 DOM 트리에서 탐색
    let canvas: HTMLElement | null = el.parentElement;
    while (canvas) {
      const w = canvas.getBoundingClientRect().width;
      if (w > 0) break;
      canvas = canvas.parentElement;
    }
    if (!canvas) return;

    const ro = new ResizeObserver(([entry]) => {
      setCanvasWidth(entry.contentRect.width || OUTPUT_WIDTH);
      setCanvasHeight(entry.contentRect.height || 1080);
    });
    ro.observe(canvas);
    const initial = canvas.getBoundingClientRect();
    if (initial.width > 0) setCanvasWidth(initial.width);
    if (initial.height > 0) setCanvasHeight(initial.height);

    return () => ro.disconnect();
  }, []);

  // scale: 에디터 캔버스 너비 / 출력 기준 너비
  const scale = canvasWidth / OUTPUT_WIDTH;
  // [/FEATURE: CANVAS_SCALE]

  // ── 표시 텍스트 계산 ────────────────────────────────
  const linkedText = sectionText ?? '';
  const displayText = getTextElementContent(element, linkedText);

  const isEmpty = !displayText;
  const isPlaceholder = isEmpty || (!element.content && element.linked && !linkedText);

  // ── 스케일된 스트로크 텍스트 시뮬레이션 ────────────
  const sw = element.strokeWidth * scale; // 스케일된 stroke 굵기
  const strokeParts = sw > 0
    ? [
        `0 0 ${sw}px ${element.strokeColor}`,
        `${sw}px 0 ${element.strokeColor}`,
        `-${sw}px 0 ${element.strokeColor}`,
        `0 ${sw}px ${element.strokeColor}`,
        `0 -${sw}px ${element.strokeColor}`,
      ]
    : [];

  // 드롭 쉐도우 (스케일 적용)
  const shadowParts: string[] = [];
  if (element.useShadow && element.shadow) {
    const { offsetX, offsetY, blur, color } = element.shadow;
    shadowParts.push(
      `${offsetX * scale}px ${offsetY * scale}px ${blur * scale}px ${color}`,
    );
  }

  const combinedShadow = [...strokeParts, ...shadowParts].join(', ') || undefined;

  // ── 그라데이션 텍스트 CSS ───────────────────────────
  const gradientStyle: React.CSSProperties = element.useGradient && element.gradient
    ? {
        background:
          element.gradient.type === 'radial'
            ? `radial-gradient(circle, ${element.gradient.stops
                .map((s) => `${s.color} ${s.offset * 100}%`).join(', ')})`
            : `linear-gradient(${element.gradient.angle}deg, ${element.gradient.stops
                .map((s) => `${s.color} ${s.offset * 100}%`).join(', ')})`,
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        backgroundClip: 'text',
        color: 'transparent',
      }
    : {};

  // ── 외부 컨테이너 스타일 ────────────────────────────
  // 피그마 텍스트 사이징 3모드:
  //  autoWidth + autoHeight = Auto (텍스트에 맞춤)
  //  !autoWidth + autoHeight = Auto Height (너비 고정, 높이 맞춤)
  //  !autoWidth + !autoHeight = Fixed (모두 고정)
  const aw = element.autoWidth ?? true;
  const ah = element.autoHeight ?? true;

  const baseStyle: React.CSSProperties = {
    position: 'absolute',
    left:    `${element.x}%`,
    top:     `${element.y}%`,
    width:   aw ? 'auto' : `${element.width}%`,
    height:  ah ? 'auto' : `${element.height}%`,
    maxWidth: aw ? '90%' : undefined,   // auto 모드에서 캔버스 밖으로 나가지 않게
    transform: element.rotation ? `rotate(${element.rotation}deg)` : undefined,
    transformOrigin: 'center center',
    opacity: element.opacity,
    display: element.visible ? 'flex' : 'none',
    alignItems:
      element.verticalAlign === 'top'    ? 'flex-start' :
      element.verticalAlign === 'bottom' ? 'flex-end'   : 'center',
    justifyContent:
      element.textAlign === 'left'  ? 'flex-start' :
      element.textAlign === 'right' ? 'flex-end'   : 'center',
    // [FEATURE: FIGMA_TEXT_BOX] 고정 높이 텍스트 박스는 박스 밖으로 새지 않게 클리핑.
    // auto-height 모드는 내용 높이에 맞춰 자연스럽게 늘어난다.
    overflow: ah ? 'visible' : 'hidden',
    cursor: isEditing ? 'text' : (isSelected ? 'move' : 'pointer'),
    userSelect: isEditing ? 'text' : 'none',
    zIndex: isEditing ? 10001 : element.zIndex,
    pointerEvents: 'all',
    outline: isEditing
      ? '1.5px solid rgba(59,130,246,0.8)'
      : isSelected
        ? 'none'
        : isPlaceholder
          ? '1px dashed rgba(255,255,255,0.15)'
          : 'none',
    outlineOffset: '-1px',
    // 지우개 마스크
    ...(element.eraserMask ? {
      WebkitMaskImage: `url(${element.eraserMask})`,
      WebkitMaskSize: '100% 100%',
      maskImage: `url(${element.eraserMask})`,
      maskSize: '100% 100%',
    } : {}),
  };

  // ── [FEATURE: FIGMA_TEXT_BOX / CANVAS_SCALE] ─
  //   auto-width는 한 줄 폭에 맞추고, 수동으로 폭을 잡은 텍스트 박스는
  //   Figma처럼 박스 너비 안에서 줄바꿈한다. 사용자가 입력한 \n은 유지한다.
  const textStyle: React.CSSProperties = {
    fontFamily:    `"${element.fontFamily}", sans-serif`,
    fontSize:      `${element.fontSize * scale}px`,
    fontWeight:    element.fontWeight,
    fontStyle:     element.fontStyle,
    textAlign:     element.textAlign,
    lineHeight:    element.lineHeight,
    letterSpacing: `${element.letterSpacing * scale}px`,
    color:         element.useGradient ? 'transparent' : element.color,
    textShadow:    element.useGradient ? undefined : combinedShadow,
    whiteSpace:    'pre-wrap',
    wordBreak:     'keep-all',
    overflowWrap:  aw ? 'normal' : 'break-word',
    width:         '100%',
    // [FIX] height 를 100% 로 두면 span 이 박스를 꽉 채워 컨테이너의 수직정렬(alignItems)이 무력화된다.
    //   내용 높이로 둬야 상/중/하 수직정렬이 실제로 반영된다(고정 높이 박스 기준). 넘침 클리핑은 컨테이너가 담당.
    overflow:      ah ? 'visible' : 'hidden',
    padding:       `0 ${Math.ceil(element.fontSize * 0.02 * scale)}px`,
    boxSizing:     'border-box' as const,
    ...gradientStyle,
  };

  const placeholderStyle: React.CSSProperties = {
    ...textStyle,
    color: 'rgba(255,255,255,0.25)',
    fontStyle: 'italic',
    WebkitTextFillColor: undefined,
    background: undefined,
    WebkitBackgroundClip: undefined,
    backgroundClip: undefined,
  };

  // ── 단일 클릭: 선택 + 드래그(이동) 준비 / 더블클릭: 편집 진입 ──
  //   [변경] 단일 클릭 시 자동 편집 진입을 제거한다. 한 번 클릭은 "선택"만 하여
  //   드래그로 이동하고 Cmd+C 로 복사할 수 있게 하고, 텍스트 편집은 더블클릭에서만 시작한다.
  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (isEditing) return; // 편집 중이면 textarea가 처리
    // 요소 선택 + 드래그 준비 (편집 모드 진입 없음)
    onPointerDown('move')(e);
  }, [isEditing, onPointerDown]);

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isEditing) {
      requestEdit(element.id, _allElements, false);
    }
  }, [isEditing, element.id, requestEdit, _allElements]);

  const handleCloseEditor = useCallback(() => {
    closeEdit();
  }, [closeEdit]);

  // ── [FEATURE: AUTO_SIZE] 피그마 방식: CSS auto + ResizeObserver 동기화 ──
  // autoWidth/autoHeight가 true인 축만 CSS auto로 렌더 → 측정 → store 동기화
  const lastSyncW = useRef(0);
  const lastSyncH = useRef(0);
  useEffect(() => {
    const el = divRef.current;
    if (!el || canvasWidth <= 0 || canvasHeight <= 0) return;
    if (!aw && !ah) return; // 둘 다 고정이면 동기화 불필요

    const ro = new ResizeObserver(([entry]) => {
      const w = entry.contentRect.width;
      const h = entry.contentRect.height;

      if (aw && w > 0 && onWidthChange) {
        const pctW = (w / canvasWidth) * 100;
        if (Math.abs(pctW - lastSyncW.current) > 0.2) {
          lastSyncW.current = pctW;
          onWidthChange(Math.round(pctW * 10) / 10);
        }
      }

      if (ah && h > 0 && onHeightChange) {
        const pctH = (h / canvasHeight) * 100;
        if (Math.abs(pctH - lastSyncH.current) > 0.2) {
          lastSyncH.current = pctH;
          onHeightChange(Math.round(pctH * 10) / 10);
        }
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [aw, ah, canvasWidth, canvasHeight, onWidthChange, onHeightChange]);

  const showPlaceholder = isEmpty && !isEditing;

  return (
    <div
      ref={divRef}
      style={baseStyle}
      onPointerDown={handlePointerDown}
      onDoubleClick={handleDoubleClick}
      title={!isEditing && !isSelected ? '클릭하여 선택, 더블클릭하여 편집' : undefined}
    >
      {/* 편집 모드: InlineTextEditor (scale 전달) */}
      {isEditing ? (
        <InlineTextEditor
          element={element}
          sectionText={linkedText}
          scale={scale}
          canvasHeight={canvasHeight}
          canvasWidth={canvasWidth}
          selectAll={selectAllOnEdit}
          onContentChange={(content) => onContentChange?.(content)}
          onWidthChange={onWidthChange}
          onHeightChange={onHeightChange}
          onClose={handleCloseEditor}
        />
      ) : (
        <span ref={textRef} style={showPlaceholder ? placeholderStyle : textStyle}>
          {showPlaceholder
            ? (element.linked ? '가사 연결 텍스트' : '여기에 텍스트 입력')
            : displayText}
        </span>
      )}

      {/* 선택 하이라이트 */}
      {isSelected && !isEditing && (
        <div style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(59, 130, 246, 0.05)',
          pointerEvents: 'none',
        }} />
      )}
    </div>
  );
}
