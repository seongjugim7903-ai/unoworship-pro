'use client';

/**
 * CanvasWorkspace — 회색 배경 + 흰 캔버스 (그림자)
 *
 * 구조:
 *  ┌─────────────────────────────┐
 *  │  ContextToolbar (상단 고정)  │  ← 요소 선택 시 표시
 *  ├─────────────────────────────┤
 *  │                             │
 *  │   [CanvasBoard (16:9)]      │  ← 줌 적용
 *  │                             │
 *  └─────────────────────────────┘
 */

import { useEffect, useRef, useState } from 'react';
import { useCanvasStore } from '@/app/canvas/lib/canvasStore';
import type { CanvasElement } from '@/lib/canvasTypes';
import CanvasBoard, { type PrintGuideVisibility } from './CanvasBoard';
import ContextToolbar from './ContextToolbar';
import { TextEditProvider } from '@/lib/textEditContext';

interface CanvasWorkspaceProps {
  zoom: number;
  viewMode: 'fit' | 'actual-pixels';
  outputPixelWidth?: number;
  printGuideVisibility?: PrintGuideVisibility;
}

export default function CanvasWorkspace({
  zoom,
  viewMode,
  outputPixelWidth,
  printGuideVisibility,
}: CanvasWorkspaceProps) {
  const scale = zoom / 100;
  const workspaceRef = useRef<HTMLDivElement>(null);
  const activePage = useCanvasStore((s) => s.getActivePage());
  const [fitWidth, setFitWidth] = useState(960);
  const {
    selectedElementIds,
    updateElement,
    removeElement,
    addElement,
  } = useCanvasStore();
  const elements = useCanvasStore((s) => s.getElements());

  // 단일 선택 요소만 컨텍스트 툴바에 표시
  const selectedEl = selectedElementIds.length === 1
    ? elements.find((e) => e.id === selectedElementIds[0]) ?? null
    : null;
  const displayWidth = viewMode === 'actual-pixels' && outputPixelWidth
    ? outputPixelWidth
    : fitWidth;

  useEffect(() => {
    const workspace = workspaceRef.current;
    if (!workspace || !activePage) return;

    const updateFitWidth = () => {
      const padding = 48;
      const availableWidth = Math.max(workspace.clientWidth - padding, 240);
      const availableHeight = Math.max(workspace.clientHeight - padding, 180);
      const aspectRatio = activePage.width / activePage.height;
      const maxFitWidth = activePage.width <= 120 ? 1100 : 960;
      const nextWidth = Math.max(
        240,
        Math.min(maxFitWidth, availableWidth, availableHeight * aspectRatio),
      );
      setFitWidth(nextWidth);
    };

    updateFitWidth();
    const observer = new ResizeObserver(updateFitWidth);
    observer.observe(workspace);
    return () => observer.disconnect();
  }, [activePage]);

  const handleDuplicate = () => {
    if (!selectedEl) return;
    const newEl: CanvasElement = {
      ...selectedEl,
      id: `el-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      x: Math.min(selectedEl.x + 3, 90),
      y: Math.min(selectedEl.y + 3, 90),
      zIndex: elements.length,
    };
    addElement(newEl);
  };

  return (
    <div className="flex flex-col flex-1 min-w-0 bg-[#f0f0f0] overflow-hidden">

      {/* ── 컨텍스트 툴바 (상단 고정, 센터) ── */}
      <div className="h-11 flex items-center justify-center flex-shrink-0 px-4 pt-2">
        {selectedEl && !selectedEl.locked && (
          <ContextToolbar
            element={selectedEl}
            onUpdate={(updates) => updateElement(selectedEl.id, updates)}
            onDelete={() => removeElement(selectedEl.id)}
            onDuplicate={handleDuplicate}
          />
        )}
      </div>

      {/* ── 캔버스 영역 (워크스페이스 가운데) ── */}
      <div
        ref={workspaceRef}
        className={
          viewMode === 'actual-pixels'
            ? 'flex-1 min-h-0 overflow-auto px-8 py-6'
            : 'flex-1 min-h-0 flex items-center justify-center overflow-hidden'
        }
      >
        <div
          className={viewMode === 'actual-pixels' ? 'mx-auto' : undefined}
          style={{
            width: displayWidth,
            transform: `scale(${scale})`,
            transformOrigin: viewMode === 'actual-pixels' ? 'top center' : 'center center',
          }}
        >
          <TextEditProvider>
            <CanvasBoard printGuideVisibility={printGuideVisibility} />
          </TextEditProvider>
        </div>
      </div>
    </div>
  );
}
