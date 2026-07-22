'use client';

/**
 * OutputTabBar — 아웃풋패널(OperatorPanel) 상단 탭 헤더
 *
 * 탭 구성:
 *  - operator: 기존 오퍼레이터 기능 (섹션 전환, 블랙아웃, ATEM 등)
 *  - audio:    웹 오디오 콘솔 (Phase 2 — 현재는 플레이스홀더)
 *
 * 향후 확장 후보:
 *  - monitor:  멀티뷰 / 송출 통계
 *  - settings: 아웃풋 전용 빠른 설정
 */

export type OutputTab = 'operator' | 'audio';

interface Props {
  active: OutputTab;
  onChange: (tab: OutputTab) => void;
}

interface TabDef {
  id: OutputTab;
  label: string;
  icon: React.ReactNode;
  /** 준비 중 표시 */
  upcoming?: boolean;
}

const TABS: TabDef[] = [
  {
    id: 'operator',
    label: '오퍼레이터',
    icon: (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="5 3 19 12 5 21 5 3" />
      </svg>
    ),
  },
  {
    id: 'audio',
    label: '오디오',
    upcoming: true,
    icon: (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
        <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
      </svg>
    ),
  },
];

export default function OutputTabBar({ active, onChange }: Props) {
  return (
    <div className="flex items-stretch border-b border-[#222222] bg-[#0d0d0d] flex-shrink-0">
      {TABS.map((tab) => {
        const isActive = tab.id === active;
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={`relative flex-1 flex items-center justify-center gap-1.5 px-3 h-9 text-[11px] font-medium transition-colors ${
              isActive
                ? 'text-white bg-[#141414]'
                : 'text-gray-500 hover:text-gray-300 hover:bg-[#111]'
            }`}
          >
            <span
              className={
                isActive ? 'text-blue-400' : 'text-gray-500'
              }
            >
              {tab.icon}
            </span>
            <span>{tab.label}</span>
            {tab.upcoming && (
              <span className="ml-0.5 px-1 py-0 rounded bg-[#1a1a1a] text-[8px] text-gray-500 border border-[#2a2a2a]">
                준비중
              </span>
            )}
            {isActive && (
              <span className="absolute bottom-0 left-0 right-0 h-px bg-blue-500" />
            )}
          </button>
        );
      })}
    </div>
  );
}
