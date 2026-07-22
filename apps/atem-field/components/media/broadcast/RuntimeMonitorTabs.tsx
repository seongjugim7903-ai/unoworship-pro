'use client';

/**
 * RuntimeMonitorTabs — Audio Levels + Analytics 를 탭 하나로 묶은 패널
 *
 * 우측 패널이 세로로 너무 길어지는 것을 막기 위해 두 런타임 모니터를
 * 하나의 콘솔 박스 안에 탭으로 전환합니다. 기본 탭은 Analytics
 * (방송 중에는 시청자 통계가 더 긴급한 정보이므로).
 */

import { useState } from 'react';
import { useMediaStore } from '@/lib/media/mediaStore';
import { ConsolePanel } from './_common';
import { AudioLevelsBody } from './AudioLevels';
import { AnalyticsBody } from './AnalyticsPanel';

type Tab = 'analytics' | 'audio';

export default function RuntimeMonitorTabs() {
  const [tab, setTab] = useState<Tab>('analytics');
  const live = useMediaStore((s) => s.session.live);
  const liveOn = live.active;

  return (
    <ConsolePanel
      title="Runtime Monitor"
      hint={
        tab === 'analytics'
          ? liveOn
            ? 'YouTube Live 통계 미러'
            : '방송 대기 중'
          : '데스크탑 엔진 VU 미러'
      }
      padded={false}
    >
      {/* 탭 헤더 */}
      <div className="px-4 pt-1 flex items-center gap-1 border-b border-gray-800">
        <TabButton active={tab === 'analytics'} onClick={() => setTab('analytics')}>
          Analytics
          {liveOn && (
            <span
              className={`ml-1.5 w-1.5 h-1.5 rounded-full ${
                tab === 'analytics' ? 'bg-rose-500 animate-pulse' : 'bg-rose-500/50'
              }`}
            />
          )}
        </TabButton>
        <TabButton active={tab === 'audio'} onClick={() => setTab('audio')}>
          Audio
        </TabButton>
      </div>

      {/* 탭 컨텐츠 */}
      <div className="px-4 py-3">
        {tab === 'analytics' ? <AnalyticsBody /> : <AudioLevelsBody />}
      </div>
    </ConsolePanel>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`relative flex items-center px-3 h-8 text-[11px] font-bold tracking-wider uppercase transition-colors ${
        active ? 'text-white' : 'text-gray-500 hover:text-gray-300'
      }`}
    >
      {children}
      {active && (
        <span className="absolute left-0 right-0 -bottom-px h-0.5 bg-violet-500 rounded-full" />
      )}
    </button>
  );
}
