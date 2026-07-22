'use client';

/**
 * LeftPanelTabs.tsx
 * 좌측 패널 상단 탭 헤더: UNO LIVE | 자막협조 | canvas
 *
 * 역할:
 *  - UNO LIVE = 콤포즈 프로그램(송출) 탭 (in-panel 전환)
 *  - 자막협조 / canvas = 해당 워크스페이스 페이지로 같은 탭 이동(href)
 *  - 활성 탭: 흰색, text-lg, font-bold (현재 UNO LIVE 타이틀 스타일)
 *  - 비활성 탭/링크: 작은 폰트, 회색 계열
 *  - 권한 기반 탭 표시:
 *    · 방송실 권한: UNO LIVE + 자막협조 + canvas
 *    · 일반 멤버: 자막협조 + canvas 만 표시
 */

export type LeftTab = 'live' | 'media' | 'canvas';

interface LeftPanelTabsProps {
  activeTab: LeftTab;
  onTabChange: (tab: LeftTab) => void;
  /** 방송실 권한 여부 — true면 UNO LIVE 탭 표시 */
  isBroadcastStaff?: boolean;
}

// href 가 있으면 탭 전환 대신 해당 워크스페이스 페이지로 같은 탭 이동한다.
const TAB_CONFIG: { key: LeftTab; label: string; href?: string }[] = [
  { key: 'live', label: 'UNO LIVE' },
  { key: 'media', label: '자막협조', href: '/media/fellowship' },
  { key: 'canvas', label: 'canvas', href: '/media/canvas' },
];

export default function LeftPanelTabs({
  activeTab,
  onTabChange,
  isBroadcastStaff = true, // 기본값: 방송실 권한 (개발 중)
}: LeftPanelTabsProps) {
  const visibleTabs = isBroadcastStaff
    ? TAB_CONFIG
    : TAB_CONFIG.filter((t) => t.key !== 'live');

  return (
    <div className="px-4 py-3 border-b border-[#222222] flex items-center gap-3">
      {visibleTabs.map((tab) => {
        const isActive = activeTab === tab.key;
        // href 링크 탭(자막협조·canvas)은 같은 탭으로 워크스페이스 이동, 나머지는 in-panel 전환.
        const handleClick = () =>
          tab.href ? (window.location.href = tab.href) : onTabChange(tab.key);
        return (
          <button
            key={tab.key}
            onClick={handleClick}
            className={`transition-colors cursor-pointer select-none ${
              isActive
                ? 'text-lg font-bold text-white tracking-wider'
                : 'text-xs font-medium text-gray-500 hover:text-gray-300'
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
