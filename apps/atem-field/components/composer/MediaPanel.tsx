'use client';

/**
 * MediaPanel.tsx
 * 미디어 탭 — 워십 프로그램 입력 포털 & 팀 협업 공간
 *
 * 역할:
 *  - 각 워십의 프로그램 입력 (찬양콘티, 설교대지, 주보 등)
 *  - 팀 간 소통 (찬양팀, 교역자, 예배부, 행정 등)
 *  - 권한: 모든 팀 멤버 접근 가능
 *
 * 향후 Phase 2A 입력포털과 통합 예정
 */

export default function MediaPanel() {
  return (
    <div className="flex flex-col h-full bg-[#111111] text-white">
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="text-center">
          <div className="text-3xl mb-3 opacity-40">🎬</div>
          <p className="text-sm font-semibold text-gray-400 mb-2">Media</p>
          <p className="text-[11px] text-gray-600 leading-relaxed max-w-[200px]">
            워십 프로그램 입력 및<br/>
            팀 협업 공간<br/>
            <span className="text-gray-700 mt-2 block">
              (찬양콘티 · 설교대지 · 주보 · 특송)
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}
