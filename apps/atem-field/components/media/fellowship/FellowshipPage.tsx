'use client';

/**
 * FellowshipPage — /media/fellowship
 * 자막협조: 각 교회 미디어부의 커뮤니티 허브
 *
 * 탭 구조:
 *   - 커뮤니티 (기존 대시보드)
 *   - 찬양대 자막 요청 (신규)
 */

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useMediaStore } from '@/lib/media/mediaStore';
import UpcomingWorshipCard from '@/components/media/landing/UpcomingWorshipCard';
import OrgChartCard from '@/components/media/landing/OrgChartCard';
import OnlineMembersCard from '@/components/media/landing/OnlineMembersCard';
import NoticeBoardCard from '@/components/media/landing/NoticeBoardCard';
import TeamChatCard from '@/components/media/landing/TeamChatCard';
import StatsDashboardCard from '@/components/media/landing/StatsDashboardCard';
import QuickActionsCard from '@/components/media/landing/QuickActionsCard';
import ActivityFeedCard from '@/components/media/landing/ActivityFeedCard';
import ChoirSubtitleForm from './ChoirSubtitleForm';
import WorshipServiceForm from './WorshipServiceForm';

type TabId = 'community' | 'choir-subtitle' | 'worship-service';

const TABS: { id: TabId; label: string }[] = [
  { id: 'community', label: '커뮤니티' },
  { id: 'choir-subtitle', label: '찬양대 자막 요청' },
  { id: 'worship-service', label: '예배 자막 협조' },
];

export default function FellowshipPage() {
  const church = useMediaStore((s) => s.getActiveChurch());
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get('tab') as TabId) || 'community';
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);

  // URL 쿼리 파라미터 변경 시 탭 동기화
  useEffect(() => {
    const tab = searchParams.get('tab') as TabId;
    if (tab && TABS.some((t) => t.id === tab)) setActiveTab(tab);
  }, [searchParams]);

  return (
    <main className="w-full max-w-[1440px] mx-auto px-6 py-6">
      {/* 섹션 헤더 */}
      <div className="mb-6 flex items-end justify-between flex-wrap gap-3">
        <div>
          <p className="text-[11px] font-semibold tracking-widest text-violet-600 uppercase">
            자막협조
          </p>
          <h1 className="mt-1 text-2xl font-bold text-gray-900">
            {church?.name ?? '교회'} 미디어부 커뮤니티
          </h1>
          {church?.slogan && (
            <p className="mt-1 text-sm text-gray-500">{church.slogan}</p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button className="px-3 h-9 rounded-md border border-gray-300 bg-white text-[12px] font-medium text-gray-700 hover:border-violet-400 hover:text-violet-700 transition-colors">
            + 공지 작성
          </button>
          <button className="px-3 h-9 rounded-md bg-violet-600 hover:bg-violet-500 text-white text-[12px] font-semibold transition-colors">
            + 새 게시글
          </button>
        </div>
      </div>

      {/* 탭 네비게이션 */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 text-sm font-semibold transition-colors border-b-2 -mb-px ${
              activeTab === tab.id
                ? 'text-violet-700 border-violet-600'
                : 'text-gray-500 border-transparent hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 탭 콘텐츠 */}
      {activeTab === 'community' && (
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12 lg:col-span-8">
            <UpcomingWorshipCard />
          </div>
          <div className="col-span-12 lg:col-span-4">
            <QuickActionsCard />
          </div>

          <div className="col-span-12 md:col-span-6 lg:col-span-4">
            <NoticeBoardCard />
          </div>
          <div className="col-span-12 md:col-span-6 lg:col-span-4">
            <TeamChatCard />
          </div>
          <div className="col-span-12 lg:col-span-4">
            <OnlineMembersCard />
          </div>

          <div className="col-span-12 lg:col-span-6">
            <OrgChartCard />
          </div>
          <div className="col-span-12 lg:col-span-6">
            <StatsDashboardCard />
          </div>

          <div className="col-span-12">
            <ActivityFeedCard />
          </div>
        </div>
      )}

      {activeTab === 'choir-subtitle' && (
        <ChoirSubtitleForm />
      )}

      {activeTab === 'worship-service' && (
        <WorshipServiceForm />
      )}
    </main>
  );
}
