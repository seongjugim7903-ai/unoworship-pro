'use client';

/**
 * ActivityFeedCard — 부서 활동 로그
 */

import { useMediaStore } from '@/lib/media/mediaStore';
import type { ActivityType } from '@/lib/media/mediaTypes';
import { Card, formatRelative, SectionLink } from './_shared';

const ACTIVITY_ICON: Record<ActivityType, { bg: string; icon: React.ReactNode }> = {
  'worship-created': {
    bg: 'bg-sky-100 text-sky-600',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
      </svg>
    ),
  },
  'input-completed': {
    bg: 'bg-green-100 text-green-600',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    ),
  },
  'live-started': {
    bg: 'bg-rose-100 text-rose-600',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
        <circle cx="12" cy="12" r="5" />
      </svg>
    ),
  },
  'live-ended': {
    bg: 'bg-gray-100 text-gray-600',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="6" y="6" width="12" height="12" />
      </svg>
    ),
  },
  'notice-posted': {
    bg: 'bg-amber-100 text-amber-600',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      </svg>
    ),
  },
  'member-joined': {
    bg: 'bg-indigo-100 text-indigo-600',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="8.5" cy="7" r="4" />
      </svg>
    ),
  },
  'member-online': {
    bg: 'bg-teal-100 text-teal-600',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
        <circle cx="12" cy="12" r="5" />
      </svg>
    ),
  },
};

export default function ActivityFeedCard() {
  const activities = useMediaStore((s) => s.activities);
  const sorted = [...activities].sort((a, b) => b.createdAt - a.createdAt);

  return (
    <Card
      title="최근 활동"
      hint="부서 내 입력/공지/송출 이력"
      action={<SectionLink href="/media/analytics/activities">전체 로그 →</SectionLink>}
    >
      <ul className="divide-y divide-gray-100">
        {sorted.map((act) => {
          const style = ACTIVITY_ICON[act.type];
          return (
            <li key={act.id} className="flex items-center gap-3 py-3">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${style.bg}`}
              >
                {style.icon}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[12px] text-gray-800 truncate">{act.message}</p>
              </div>
              <span className="text-[10px] text-gray-400 shrink-0">
                {formatRelative(act.createdAt)}
              </span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
