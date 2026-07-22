'use client';

/**
 * CanvasPanel.tsx
 * 캔버스 탭 — 미리캔버스 스타일 디자인 에디터
 *
 * 역할:
 *  - 썸네일, 슬라이드, 주일학교 교재, 포스트 등 편집
 *  - 독립 캔버스 에디터 (워십 방송과 별개)
 *  - 권한: 모든 팀 멤버 접근 가능
 *
 * 향후 Phase 2B 캔버스 에디터와 통합 예정
 */

export default function CanvasPanel() {
  return (
    <div className="flex flex-col h-full bg-[#111111] text-white">
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="text-center">
          <div className="text-3xl mb-3 opacity-40">🎨</div>
          <p className="text-sm font-semibold text-gray-400 mb-2">Canvas</p>
          <p className="text-[11px] text-gray-600 leading-relaxed max-w-[200px]">
            썸네일 · 슬라이드 · 교재 · 포스트<br/>
            디자인 편집 공간<br/>
            <span className="text-gray-700 mt-2 block">
              (미리캔버스 스타일 에디터)
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}
