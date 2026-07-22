'use client';

// 헤드메뉴~캔버스 여백에 떠 있는 버튼 — 현재 프로그램의 배경 편집 캔버스를 열고/닫는다.
// 배경 섹션(숨김)을 메인 에디터로 편집하며, 그 요소는 그 프로그램의 모든 섹션 뒤에 깔린다.

import { useCallback } from 'react';
import { useStore } from '@/lib/store';
import {
  createProgramBackgroundSection,
  getContentSections,
  isProgramBackgroundSection,
  programBackgroundSectionId,
} from '@/lib/programBackground';

export default function ProgramBackgroundButton() {
  const {
    setlists,
    currentSetlistId,
    activeItemId,
    activeSectionId,
    addSection,
    setActiveSection,
    updateItem,
  } = useStore();

  const setlist = setlists.find((s) => s.id === currentSetlistId);
  const item = setlist?.items.find((i) => i.id === activeItemId);
  const editing = !!item?.sections.some(
    (s) => s.id === activeSectionId && isProgramBackgroundSection(s),
  );

  const toggle = useCallback(() => {
    if (!currentSetlistId || !item) return;
    if (editing) {
      setActiveSection(getContentSections(item)[0]?.id ?? null);
      return;
    }
    const bgId = programBackgroundSectionId(item.id);
    if (!item.sections.some((s) => s.id === bgId || isProgramBackgroundSection(s))) {
      addSection(currentSetlistId, item.id, createProgramBackgroundSection(item.id));
    }
    setActiveSection(bgId);
  }, [currentSetlistId, item, editing, addSection, setActiveSection]);

  if (!currentSetlistId || !item) return null;

  return (
    <div className="absolute right-6 top-1 z-30 flex items-center gap-2">
      {/* 배경 편집 중일 때만 노출 — 배경 모션을 첫 섹션에서만 1회 재생할지 토글 */}
      {editing && (
        <label
          title="배경 모션/시퀀스를 첫 콘텐츠 섹션에서만 1회 재생 (이후 섹션은 정적)"
          className="flex items-center gap-1.5 rounded-md px-2 h-7 text-xs font-semibold
                     bg-[#1a1a2e]/90 border border-sky-400/40 text-sky-100 shadow-lg
                     cursor-pointer select-none"
        >
          <input
            type="checkbox"
            checked={!!item.backgroundMotionOnce}
            onChange={(e) =>
              updateItem(currentSetlistId, item.id, { backgroundMotionOnce: e.target.checked })
            }
            className="accent-sky-500"
          />
          첫 섹션만 모션
        </label>
      )}
      <button
        onClick={toggle}
        title={editing ? '배경 편집 종료' : '이 프로그램의 배경 편집 (모든 섹션에 적용)'}
        className={`flex items-center gap-1.5 rounded-md px-2.5 h-7 text-xs font-bold
                    border shadow-lg transition-colors ${
                      editing
                        ? 'bg-red-600 hover:bg-red-500 border-red-400 text-white'
                        : 'bg-sky-600 hover:bg-sky-500 border-sky-400 text-white'
                    }`}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
          <circle cx="9" cy="9" r="1.6" />
          <path d="M21 15l-5-5L5 21" />
        </svg>
        {editing ? '배경 편집 종료' : '프로그램 배경'}
      </button>
    </div>
  );
}
