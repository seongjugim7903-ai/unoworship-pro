'use client';

/**
 * LiveStatusIndicator — 라이브 ON 상태 인디케이터 (선택적)
 *
 * 향후 상단바(TopBar) 등에 추가할 수 있는 경량 상태 배지.
 * 현재는 export만 해두고 필요 시점에 사용.
 */

import { useLiveStream } from '@/hooks/broadcast/useLiveStream';

export default function LiveStatusIndicator() {
  const { isLive, elapsedFormatted, liveStats } = useLiveStream();

  if (!isLive) return null;

  return (
    <div className="flex items-center gap-1.5 px-2 h-6 rounded-full bg-red-600/90 border border-red-500 text-white select-none">
      <span className="relative flex h-1.5 w-1.5">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-white" />
      </span>
      <span className="text-[10px] font-bold tracking-wider">LIVE</span>
      <span className="text-[10px] font-mono tabular-nums opacity-90">
        {elapsedFormatted}
      </span>
      {liveStats.bitrate > 0 && (
        <>
          <span className="w-px h-3 bg-white/30" />
          <span className="text-[9px] font-mono opacity-80">
            {Math.round(liveStats.bitrate)}k
          </span>
        </>
      )}
    </div>
  );
}
