'use client';

/**
 * PhotoPanel — 사진 사이드 패널
 *
 * 기능:
 *  - 클릭 업로드 (hidden file input)
 *  - 드래그앤드롭 업로드
 *  - 다중 파일 선택 지원
 *
 * 향후 확장:
 *  - 스톡 사진 검색 (Unsplash/Pexels)
 *  - 최근 업로드 히스토리
 */

import { useState, useCallback } from 'react';
import { ImageUp } from 'lucide-react';
import { useCanvasImageImporter } from '@/app/canvas/lib/useCanvasImageImporter';

export default function PhotoPanel() {
  const { fileInputRef, triggerFilePicker, handleFileChange, handleFiles } =
    useCanvasImageImporter();
  const [isDragging, setIsDragging] = useState(false);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles]
  );

  return (
    <div className="space-y-4">
      {/* 섹션 타이틀 */}
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
        내 사진 업로드
      </p>

      {/* 드롭존 + 클릭 업로드 */}
      <button
        onClick={triggerFilePicker}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={`flex flex-col items-center justify-center w-full h-36 rounded-lg
                    border-2 border-dashed transition-colors cursor-pointer
                    ${isDragging
                      ? 'border-[#7c3aed] bg-[#7c3aed]/10'
                      : 'border-gray-300 hover:border-[#7c3aed] hover:bg-[#7c3aed]/5'
                    }`}
      >
        <ImageUp
          size={28}
          strokeWidth={1.5}
          className={isDragging ? 'text-[#7c3aed]' : 'text-gray-400'}
        />
        <p className="text-xs text-gray-500 mt-2 font-medium">
          클릭하거나 파일을 드래그
        </p>
        <p className="text-[10px] text-gray-400 mt-0.5">
          PNG, JPG, SVG, WEBP
        </p>
      </button>

      {/* hidden file input — 다중 선택 허용 */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleFileChange}
        className="hidden"
      />

      {/* 가이드 */}
      <div className="text-[10px] text-gray-400 leading-relaxed px-1">
        <p>• 원본 비율을 유지하여 캔버스 중앙에 배치됩니다</p>
        <p>• 인쇄 캔버스는 300dpi 출력판 기준으로 배치됩니다</p>
        <p>• 배치 후 우측 PRINT CHECK에서 인쇄 품질을 확인합니다</p>
        <p>• 추가 후 드래그·리사이즈·회전 가능합니다</p>
      </div>

      {/* 향후 확장 영역 — 스톡 사진 */}
      <div className="pt-4 border-t border-gray-100">
        <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">
          스톡 사진
        </p>
        <p className="text-[11px] text-gray-400 text-center py-8">
          준비 중입니다
        </p>
      </div>
    </div>
  );
}
