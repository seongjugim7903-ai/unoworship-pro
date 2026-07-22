'use client';

import { Plus, Minus, ZoomIn, Maximize2 } from 'lucide-react';

/**
 * BottomBar — 하단 페이지 탭 + 줌 컨트롤
 *
 * [페이지1][페이지2][+]  ────────────  [-] 100% [+]
 */

interface Page {
  id: string;
  name: string;
}

interface BottomBarProps {
  pages: Page[];
  activePageId: string;
  onSelectPage: (id: string) => void;
  onAddPage: () => void;
  viewMode: 'fit' | 'actual-pixels';
  onViewModeChange: (mode: 'fit' | 'actual-pixels') => void;
  actualSizeLabel?: string;
  zoom: number;
  onZoomChange: (zoom: number) => void;
}

export default function BottomBar({
  pages,
  activePageId,
  onSelectPage,
  onAddPage,
  viewMode,
  onViewModeChange,
  actualSizeLabel,
  zoom,
  onZoomChange,
}: BottomBarProps) {
  const zoomLabel = viewMode === 'fit'
    ? `맞춤 ${Math.round(zoom)}%`
    : `실제 ${Math.round(zoom)}%`;

  return (
    <div className="flex items-center h-10 px-3 bg-white border-t border-gray-200 flex-shrink-0 select-none">

      {/* ── 좌측: 페이지 탭 ── */}
      <div className="flex items-center gap-1 flex-1 min-w-0 overflow-x-auto">
        {pages.map((page, i) => (
          <button
            key={page.id}
            onClick={() => onSelectPage(page.id)}
            className={`flex items-center h-7 px-3 rounded text-xs font-medium transition-colors flex-shrink-0
              ${page.id === activePageId
                ? 'bg-[#7c3aed]/10 text-[#7c3aed] border border-[#7c3aed]/30'
                : 'text-gray-500 hover:bg-gray-100 border border-transparent'
              }`}
          >
            {page.name || `페이지 ${i + 1}`}
          </button>
        ))}
        <button
          onClick={onAddPage}
          className="flex items-center justify-center w-7 h-7 rounded text-gray-400
                     hover:bg-gray-100 hover:text-gray-600 transition-colors flex-shrink-0"
          title="페이지 추가"
        >
          <Plus size={14} />
        </button>
      </div>

      {/* ── 우측: 보기 모드 + 줌 컨트롤 ── */}
      <div className="flex items-center gap-2 flex-shrink-0 ml-4">
        <div className="flex h-7 items-center rounded-md border border-gray-200 bg-gray-50 p-0.5">
          <button
            type="button"
            onClick={() => onViewModeChange('fit')}
            className={`flex h-6 items-center gap-1 rounded px-2 text-[11px] font-semibold transition-colors ${
              viewMode === 'fit'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-800'
            }`}
            title="캔버스를 현재 작업 영역에 맞춰 봅니다"
          >
            <Maximize2 size={12} />
            화면맞춤
          </button>
          <button
            type="button"
            onClick={() => onViewModeChange('actual-pixels')}
            className={`flex h-6 items-center gap-1 rounded px-2 text-[11px] font-semibold transition-colors ${
              viewMode === 'actual-pixels'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-800'
            }`}
            title={actualSizeLabel ? `출력판 ${actualSizeLabel}을 실제 픽셀 크기로 봅니다` : '실제 픽셀 100%로 봅니다'}
          >
            <ZoomIn size={12} />
            실제픽셀 100%
          </button>
        </div>

        {actualSizeLabel && (
          <span className="hidden text-[11px] font-medium text-gray-400 md:inline">
            출력판 {actualSizeLabel}
          </span>
        )}

        <button
          onClick={() => onZoomChange(Math.max(25, zoom - 10))}
          className="flex items-center justify-center w-7 h-7 rounded text-gray-500
                     hover:bg-gray-100 transition-colors"
          title="축소"
        >
          <Minus size={14} />
        </button>
        <span className="w-16 text-center text-xs font-medium text-gray-600 tabular-nums">
          {zoomLabel}
        </span>
        <button
          onClick={() => onZoomChange(Math.min(400, zoom + 10))}
          className="flex items-center justify-center w-7 h-7 rounded text-gray-500
                     hover:bg-gray-100 transition-colors"
          title="확대"
        >
          <ZoomIn size={14} />
        </button>
      </div>
    </div>
  );
}
