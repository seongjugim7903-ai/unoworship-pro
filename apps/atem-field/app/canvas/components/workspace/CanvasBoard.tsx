'use client';

/**
 * CanvasBoard.tsx
 * 캔버스 에디터 코어 — UnoLive EditorCanvas를 canvasStore 기반으로 이식
 *
 * - 요소 렌더링 (Text, Shape, Image, Video)
 * - 선택·드래그·리사이즈·회전 (useCanvasEditor 래핑)
 * - BoundingBox + 스냅 가이드라인
 * - Undo/Redo + Copy/Paste + Delete (useEditorCommands 래핑)
 * - 우클릭 컨텍스트 메뉴
 */

import React, { useRef } from 'react';
import { useCanvasStore } from '@/app/canvas/lib/canvasStore';
import { getCanvasPurpose, type CanvasPurpose } from '@/app/canvas/lib/canvasPurpose';
import {
  CanvasElement, TextElement, ShapeElement, ImageElement, VideoElement,
} from '@/lib/canvasTypes';

import BoundingBox from '@/components/handles/BoundingBox';
import TextElementView from '@/components/elements/TextElementView';
import ShapeElementView from '@/components/elements/ShapeElementView';
import ImageElementView from '@/components/elements/ImageElementView';
import VideoElementView from '@/components/elements/VideoElementView';
import EditorGuides from '@/components/composer/EditorGuides';
import ElementAlignGuides from '@/components/composer/ElementAlignGuides';

import { useCanvasBoardEditor } from './useCanvasBoardEditor';
import { useCanvasBoardCommands } from './useCanvasBoardCommands';

export type PrintGuideVisibility = {
  work: boolean;
  trim: boolean;
  safe: boolean;
};

const DEFAULT_PRINT_GUIDE_VISIBILITY: PrintGuideVisibility = {
  work: true,
  trim: true,
  safe: true,
};

export default function CanvasBoard({
  printGuideVisibility = DEFAULT_PRINT_GUIDE_VISIBILITY,
}: {
  printGuideVisibility?: PrintGuideVisibility;
}) {
  const {
    updateElement,
  } = useCanvasStore();

  const canvasRef = useRef<HTMLDivElement>(null);

  // 현재 페이지 요소
  const project = useCanvasStore((s) => s.project);
  const activePage = useCanvasStore((s) => s.getActivePage());
  const elements = useCanvasStore((s) => s.getElements());
  const purposeInfo = getCanvasPurpose(project.purposeId);
  const canvasWidth = activePage?.width ?? 1920;
  const canvasHeight = activePage?.height ?? 1080;

  const {
    selectedIds,
    isDragging,
    snapState,
    elementSnapGuides,
    onCanvasPointerDown,
    onElementPointerDown,
  } = useCanvasBoardEditor({ elements, canvasRef });

  const {
    handleKeyDown,
  } = useCanvasBoardCommands({ elements, selectedIds });

  // ── 요소별 렌더 ─────────────────────────
  function renderElement(el: CanvasElement) {
    const isSelected = selectedIds.includes(el.id);

    const wrapper = (node: React.ReactNode) => (
      <div key={el.id} style={{ display: 'contents' }}>
        {node}
      </div>
    );

    switch (el.type) {
      case 'text':
        return wrapper(
          <TextElementView
            element={el as TextElement}
            isSelected={isSelected}
            allElements={elements}
            onPointerDown={(handleId) => onElementPointerDown(el.id, handleId)}
            onContentChange={(content) => updateElement(el.id, { content })}
            onWidthChange={(newWidth) => updateElement(el.id, { width: newWidth })}
            onHeightChange={(newHeight) => updateElement(el.id, { height: newHeight })}
          />
        );
      case 'shape':
        return wrapper(
          <ShapeElementView
            element={el as ShapeElement}
            isSelected={isSelected}
            onPointerDown={(handleId) => onElementPointerDown(el.id, handleId)}
          />
        );
      case 'image':
        return wrapper(
          <ImageElementView
            element={el as ImageElement}
            isSelected={isSelected}
            onPointerDown={(handleId) => onElementPointerDown(el.id, handleId)}
          />
        );
      case 'video':
        return wrapper(
          <VideoElementView
            element={el as VideoElement}
            isSelected={isSelected}
            onPointerDown={(handleId) => onElementPointerDown(el.id, handleId)}
          />
        );
      default:
        return null;
    }
  }

  return (
    <div className="w-full">
      <PrintGuideLegend purpose={purposeInfo} visibility={printGuideVisibility} />

      <div
        data-testid="canvas-board"
        ref={canvasRef}
        tabIndex={0}
        style={{
          position: 'relative',
          width: '100%',
          aspectRatio: `${canvasWidth} / ${canvasHeight}`,
          background: '#ffffff',
          overflow: 'hidden',
          userSelect: 'none',
          outline: 'none',
          isolation: 'isolate',
          boxShadow: '0 2px 20px rgba(0,0,0,0.12)',
          borderRadius: 4,
        }}
        onPointerDown={onCanvasPointerDown}
        onKeyDown={handleKeyDown}
        onContextMenu={(e) => e.preventDefault()}
      >
        {/* 요소 레이어 — zIndex 순 */}
        {[...elements]
          .sort((a, b) => a.zIndex - b.zIndex)
          .map(renderElement)}

        <PrintGuideOverlay purpose={purposeInfo} visibility={printGuideVisibility} />

        {/* 가이드라인 */}
        <EditorGuides
          snapState={isDragging && snapState ? {
            snappedCenterX: snapState.snappedCenterX,
            snappedCenterY: snapState.snappedCenterY,
            snappedLeft: snapState.snappedLeft,
            snappedRight: snapState.snappedRight,
            snappedTop: snapState.snappedTop,
            snappedBottom: snapState.snappedBottom,
          } : undefined}
        />

        {isDragging && elementSnapGuides.length > 0 && (
          <ElementAlignGuides guides={elementSnapGuides} />
        )}

        {/* 선택된 요소의 BoundingBox (복수 지원) */}
        {selectedIds.map((sid) => {
          const el = elements.find((e) => e.id === sid);
          if (!el || el.locked) return null;
          return (
            <BoundingBox
              key={sid}
              x={el.x}
              y={el.y}
              width={el.width}
              height={el.height}
              rotation={el.rotation}
              onHandlePointerDown={(handleId) => onElementPointerDown(el.id, handleId)}
            />
          );
        })}

        {/* 빈 캔버스 안내 */}
        {elements.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center">
              <p className="text-sm text-gray-300 leading-relaxed">
                좌측에서 요소를 추가하세요
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function PrintGuideLegend({
  purpose,
  visibility,
}: {
  purpose: CanvasPurpose | null;
  visibility: PrintGuideVisibility;
}) {
  const guide = purpose?.printGuide;
  if (!guide) return null;

  const items = getPrintGuideLegendItems(guide).filter((item) => visibility[item.key]);
  if (items.length === 0) return null;

  return (
    <div className="mb-2 flex justify-end">
      <div
        data-testid="print-guide-legend"
        className="flex items-center gap-3 rounded-md border border-gray-200 bg-white/90 px-3 py-1.5 text-[10px] font-bold text-gray-700 shadow-sm backdrop-blur-sm"
      >
        {items.map((item) => (
          <div key={item.label} className="flex items-center gap-1.5 whitespace-nowrap">
            <span
              className="inline-block h-2.5 w-5 rounded-sm"
              style={{
                border: `1px ${item.borderStyle} ${item.color}`,
              }}
            />
            <span>{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PrintGuideOverlay({
  purpose,
  visibility,
}: {
  purpose: CanvasPurpose | null;
  visibility: PrintGuideVisibility;
}) {
  const guide = purpose?.printGuide;
  if (!guide || (!visibility.work && !visibility.trim && !visibility.safe)) return null;

  const trimX = (guide.bleedMm / guide.workWidthMm) * 100;
  const trimY = (guide.bleedMm / guide.workHeightMm) * 100;
  const trimW = (guide.trimWidthMm / guide.workWidthMm) * 100;
  const trimH = (guide.trimHeightMm / guide.workHeightMm) * 100;

  const safeX = ((guide.bleedMm + guide.safeInsetMm) / guide.workWidthMm) * 100;
  const safeY = ((guide.bleedMm + guide.safeInsetMm) / guide.workHeightMm) * 100;
  const safeW = ((guide.trimWidthMm - guide.safeInsetMm * 2) / guide.workWidthMm) * 100;
  const safeH = ((guide.trimHeightMm - guide.safeInsetMm * 2) / guide.workHeightMm) * 100;

  return (
    <div className="pointer-events-none absolute inset-0 z-50" aria-hidden="true">
      {visibility.work && (
        <GuideBox
          color="#f97316"
          x={0}
          y={0}
          width={100}
          height={100}
          borderStyle="dashed"
        />
      )}
      {visibility.trim && (
        <GuideBox
          color="#e11d48"
          x={trimX}
          y={trimY}
          width={trimW}
          height={trimH}
          borderStyle="solid"
        />
      )}
      {visibility.safe && (
        <GuideBox
          color="#16a34a"
          x={safeX}
          y={safeY}
          width={safeW}
          height={safeH}
          borderStyle="dashed"
        />
      )}
    </div>
  );
}

function getPrintGuideLegendItems(guide: NonNullable<CanvasPurpose['printGuide']>) {
  return [
    { key: 'work' as const, label: `${guide.workWidthMm}x${guide.workHeightMm}mm 작업선`, color: '#f97316', borderStyle: 'dashed' as const },
    { key: 'trim' as const, label: `${guide.trimWidthMm}x${guide.trimHeightMm}mm 재단선/칼선`, color: '#e11d48', borderStyle: 'solid' as const },
    {
      key: 'safe' as const,
      label: `${guide.trimWidthMm - guide.safeInsetMm * 2}x${guide.trimHeightMm - guide.safeInsetMm * 2}mm 안전영역`,
      color: '#16a34a',
      borderStyle: 'dashed' as const,
    },
  ];
}

function GuideBox({
  color,
  x,
  y,
  width,
  height,
  borderStyle,
}: {
  color: string;
  x: number;
  y: number;
  width: number;
  height: number;
  borderStyle: 'solid' | 'dashed';
}) {
  return (
    <div
      className="absolute"
      style={{
        left: `${x}%`,
        top: `${y}%`,
        width: `${width}%`,
        height: `${height}%`,
        border: `1px ${borderStyle} ${color}`,
        boxShadow: `0 0 0 1px rgba(255,255,255,0.55), 0 0 12px ${color}55`,
        boxSizing: 'border-box',
      }}
    />
  );
}
