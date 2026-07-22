'use client';

/**
 * LivePanel — YouTube 라이브 런타임 모니터 (시청자/비트레이트/건강도)
 *
 * 실제 시작/종료는 상단 `BroadcastControls` 에서 녹화와 번들로 제어합니다.
 * 이 패널은 런타임 통계만 표시합니다.
 */

import { useEffect, useState } from 'react';
import { useMediaStore } from '@/lib/media/mediaStore';
import { ConsolePanel, formatDuration } from './_common';

const HEALTH_STYLE = {
  good:    { label: '정상',   color: 'text-green-400',  bg: 'bg-green-500/10 border-green-500/30' },
  warning: { label: '주의',   color: 'text-amber-400',  bg: 'bg-amber-500/10 border-amber-500/30' },
  bad:     { label: '불량',   color: 'text-red-400',    bg: 'bg-red-500/10 border-red-500/30' },
} as const;

export default function LivePanel() {
  const live = useMediaStore((s) => s.session.live);

  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const duration = formatDuration(live.startedAt, now);
  const health = HEALTH_STYLE[live.health];

  return (
    <ConsolePanel
      title="Live Broadcast"
      hint={live.provider === 'youtube' ? 'YouTube Live 런타임' : 'Custom RTMP 런타임'}
      tone={live.active ? 'live' : 'neutral'}
      action={
        <span
          className={`px-2 py-0.5 rounded text-[9px] font-bold tracking-wider ${
            live.active ? 'bg-rose-600 text-white animate-pulse' : 'bg-gray-800 text-gray-400'
          }`}
        >
          {live.active ? '● LIVE' : 'OFF'}
        </span>
      }
    >
      {/* 컴팩트 타이머 */}
      <div>
        <p className="text-[9px] font-semibold tracking-wider text-gray-500 uppercase">
          방송 시간
        </p>
        <p className={`text-xl font-bold tabular-nums leading-tight ${live.active ? 'text-rose-400' : 'text-gray-500'}`}>
          {duration}
        </p>
      </div>

      {/* 스탯 (단일 열) */}
      <div className="mt-2 space-y-1">
        <div className="flex items-center justify-between rounded bg-[#15171e] border border-gray-800 px-2 py-1">
          <p className="text-[8px] font-semibold tracking-wider text-gray-500 uppercase">시청자</p>
          <p className="text-[10px] font-bold text-gray-100 tabular-nums ml-2">
            {live.active ? live.viewers.toLocaleString() : '--'}
            <span className="ml-0.5 text-[9px] font-medium text-gray-500">명</span>
          </p>
        </div>
        <div className={`flex items-center justify-between rounded border px-2 py-1 ${health.bg}`}>
          <p className="text-[8px] font-semibold tracking-wider text-gray-500 uppercase">건강도</p>
          <p className={`text-[10px] font-bold ${health.color}`}>● {health.label}</p>
        </div>
      </div>
    </ConsolePanel>
  );
}
