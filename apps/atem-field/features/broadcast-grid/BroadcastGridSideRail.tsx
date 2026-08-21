'use client';

// 송출그리드 우측 레일 — 프로그램 목록과 말씀찾기(인용) 장절 목록을 탭으로 담는 껍데기.
//   그리드를 열 때마다 오버레이가 새로 마운트되므로 기본 탭('programs')은 초기값만으로 보장된다.

import type { BroadcastGridProgram } from './broadcastGridPrograms';
import ProgramList from './ProgramList';
import QuoteReferenceList, { type QuoteReferenceItem } from './QuoteReferenceList';

export type BroadcastGridRailTab = 'programs' | 'quotes';

export const DEFAULT_RAIL_TAB: BroadcastGridRailTab = 'programs';

interface BroadcastGridSideRailProps {
  activeTab: BroadcastGridRailTab;
  onTabChange: (tab: BroadcastGridRailTab) => void;
  width: string;
  programs: BroadcastGridProgram[];
  activeProgramIndex: number;
  liveProgramIndex: number;
  onProgramJump: (firstIndex: number) => void;
  /** 두 프로그램의 세트리스트 자리를 맞바꾼다 */
  onProgramMove?: (itemId: string, targetItemId: string) => void;
  quoteItems: QuoteReferenceItem[];
  broadcastSectionId: string | null;
  broadcastedSectionIds: ReadonlySet<string>;
  onBroadcast: (index: number) => void;
}

const TABS: ReadonlyArray<{ id: BroadcastGridRailTab; label: string }> = [
  { id: 'programs', label: '프로그램' },
  { id: 'quotes', label: '인용말씀' },
];

export default function BroadcastGridSideRail({
  activeTab,
  onTabChange,
  width,
  programs,
  activeProgramIndex,
  liveProgramIndex,
  onProgramJump,
  onProgramMove,
  quoteItems,
  broadcastSectionId,
  broadcastedSectionIds,
  onBroadcast,
}: BroadcastGridSideRailProps) {
  const counts: Record<BroadcastGridRailTab, number> = {
    programs: programs.length,
    quotes: quoteItems.length,
  };

  return (
    <aside
      aria-label="송출그리드 우측 목록"
      data-testid="broadcast-grid-side-rail"
      className="pointer-events-auto relative flex h-full min-w-0 flex-none flex-col overflow-hidden border-l border-amber-400/50 bg-black text-white shadow-[-8px_0_24px_rgba(0,0,0,.45)] transition-[width] duration-300 ease-out"
      style={{ width }}
    >
      <div role="tablist" aria-label="우측 목록 탭" className="flex flex-shrink-0 border-b border-[#333]">
        {TABS.map((tab) => {
          const selected = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={selected}
              data-rail-tab={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`flex min-w-0 flex-1 items-center justify-center gap-1.5 px-2 py-2 text-[12px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-300 ${
                selected
                  ? 'border-b-2 border-amber-300 bg-white/5 text-amber-300'
                  : 'border-b-2 border-transparent text-gray-500 hover:text-gray-300'
              }`}
            >
              <span className="truncate">{tab.label}</span>
              <span className="flex-none font-mono text-[10px] text-gray-500">{counts[tab.id]}</span>
            </button>
          );
        })}
      </div>

      {activeTab === 'programs' ? (
        <ProgramList
          programs={programs}
          activeProgramIndex={activeProgramIndex}
          liveProgramIndex={liveProgramIndex}
          onJump={onProgramJump}
          onMove={onProgramMove}
        />
      ) : (
        <QuoteReferenceList
          items={quoteItems}
          broadcastSectionId={broadcastSectionId}
          broadcastedSectionIds={broadcastedSectionIds}
          onBroadcast={onBroadcast}
        />
      )}
    </aside>
  );
}
