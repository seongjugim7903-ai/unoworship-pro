'use client';

import { Undo2, Redo2, Download, ChevronLeft, Save, FileText } from 'lucide-react';

/**
 * TopBar — 캔버스 에디터 상단 메뉴바
 *
 * [← 홈]  파일명(편집)  [Undo][Redo]  ────  [미리보기] [다운로드]
 */

interface TopBarProps {
  fileName: string;
  purposeLabel?: string;
  purposeSizeLabel?: string;
  onFileNameChange: (name: string) => void;
  onUndo: () => void;
  onRedo: () => void;
  onSave: () => void;
  onExportPng: () => void;
  onExportPdf: () => void;
  canUndo: boolean;
  canRedo: boolean;
  saveStatus?: 'idle' | 'saved';
}

export default function TopBar({
  fileName,
  purposeLabel,
  purposeSizeLabel,
  onFileNameChange,
  onUndo,
  onRedo,
  onSave,
  onExportPng,
  onExportPdf,
  canUndo,
  canRedo,
  saveStatus = 'idle',
}: TopBarProps) {
  return (
    <div className="flex items-center h-12 px-3 bg-white border-b border-gray-200 flex-shrink-0 select-none">

      {/* ── 좌측: 홈 + 파일명 + Undo/Redo ── */}
      <div className="flex items-center gap-2 flex-1 min-w-0">
        {/* 홈 버튼 */}
        <button
          onClick={() => window.location.href = '/media/canvas'}
          className="flex items-center justify-center w-8 h-8 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
          title="캔버스 홈으로"
        >
          <ChevronLeft size={18} />
        </button>

        {/* 파일명 */}
        <div className="flex items-center gap-2 min-w-0">
          <input
            type="text"
            value={fileName}
            onChange={(e) => onFileNameChange(e.target.value)}
            className="text-sm font-medium text-gray-800 bg-transparent border-none outline-none
                       hover:bg-gray-50 focus:bg-gray-50 rounded px-2 py-1 max-w-[220px] truncate
                       placeholder-gray-400"
            placeholder={purposeLabel ? `${purposeLabel} 디자인` : '제목 없는 디자인'}
          />
          {purposeLabel && (
            <span className="hidden md:inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border border-violet-200 bg-violet-50 px-2.5 text-[11px] font-semibold text-violet-700">
              {purposeLabel}
              {purposeSizeLabel && (
                <span className="text-violet-500">· {purposeSizeLabel}</span>
              )}
            </span>
          )}
        </div>

        {/* 구분선 */}
        <div className="w-px h-5 bg-gray-200 mx-1" />

        {/* Undo / Redo */}
        <button
          onClick={onUndo}
          disabled={!canUndo}
          className="flex items-center justify-center w-8 h-8 rounded-lg text-gray-500
                     hover:bg-gray-100 hover:text-gray-700 transition-colors
                     disabled:opacity-30 disabled:pointer-events-none"
          title="실행 취소 (Ctrl+Z)"
        >
          <Undo2 size={16} />
        </button>
        <button
          onClick={onRedo}
          disabled={!canRedo}
          className="flex items-center justify-center w-8 h-8 rounded-lg text-gray-500
                     hover:bg-gray-100 hover:text-gray-700 transition-colors
                     disabled:opacity-30 disabled:pointer-events-none"
          title="다시 실행 (Ctrl+Shift+Z)"
        >
          <Redo2 size={16} />
        </button>
      </div>

      {/* ── 우측: 미리보기 + 다운로드 ── */}
      <div className="flex items-center gap-1.5">
        <button
          onClick={onSave}
          className="flex items-center gap-1.5 h-8 px-3 rounded-lg text-sm font-medium text-gray-700
                     hover:bg-gray-100 transition-colors"
          title="저장"
        >
          <Save size={16} />
          <span className="hidden sm:inline">{saveStatus === 'saved' ? '저장됨' : '저장'}</span>
        </button>

        <button
          onClick={onExportPdf}
          className="flex items-center gap-1.5 h-8 px-3 rounded-lg text-sm text-gray-600
                     hover:bg-gray-100 transition-colors"
          title="PDF 출력"
        >
          <FileText size={16} />
          <span className="hidden sm:inline">PDF</span>
        </button>

        <button
          onClick={onExportPng}
          className="flex items-center gap-1.5 h-8 px-4 rounded-lg text-sm font-medium
                     bg-[#7c3aed] text-white hover:bg-[#6d28d9] transition-colors"
          title="300dpi PNG 다운로드"
        >
          <Download size={16} />
          <span className="hidden sm:inline">PNG 300dpi</span>
        </button>
      </div>
    </div>
  );
}
