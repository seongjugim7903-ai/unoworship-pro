'use client';

/**
 * StatsDashboardCard — 누적 방송 통계 + 최근 7일 트렌드
 */

import { useMediaStore } from '@/lib/media/mediaStore';
import { Card, SectionLink } from './_shared';

export default function StatsDashboardCard() {
  const stats = useMediaStore((s) => s.stats);

  const maxTrend = Math.max(...stats.weeklyTrend, 1);

  return (
    <Card
      title="방송 통계"
      hint="누적 지표 · 최근 7일 트렌드"
      action={<SectionLink href="/media/analytics">대시보드 →</SectionLink>}
    >
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="총 방송" value={stats.totalBroadcasts} suffix="회" />
        <Stat label="이번 달" value={stats.monthBroadcasts} suffix="회" />
        <Stat
          label="누적 시청자"
          value={stats.totalViewers}
          suffix="명"
          formatter={(v) => v.toLocaleString()}
        />
        <Stat label="평균 동접" value={stats.avgConcurrent} suffix="명" />
      </div>

      <div className="mt-6">
        <p className="text-[10px] font-semibold tracking-wide text-gray-500 uppercase mb-3">
          최근 7일 방송 수
        </p>
        <div className="flex items-end gap-2 h-20">
          {stats.weeklyTrend.map((v, i) => {
            const height = (v / maxTrend) * 100;
            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <div
                  className="w-full rounded-t-md bg-gradient-to-t from-violet-500 to-indigo-400 transition-all"
                  style={{ height: `${Math.max(height, 6)}%`, minHeight: 4 }}
                  title={`${v}회`}
                />
                <span className="text-[9px] text-gray-400">
                  {['일', '월', '화', '수', '목', '금', '토'][i]}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}

function Stat({
  label,
  value,
  suffix,
  formatter,
}: {
  label: string;
  value: number;
  suffix?: string;
  formatter?: (v: number) => string;
}) {
  const display = formatter ? formatter(value) : value.toString();
  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-3">
      <p className="text-[10px] font-semibold tracking-wide text-gray-500 uppercase">
        {label}
      </p>
      <p className="mt-1 text-xl font-bold text-gray-900">
        {display}
        {suffix && <span className="ml-0.5 text-[11px] text-gray-500 font-medium">{suffix}</span>}
      </p>
    </div>
  );
}
