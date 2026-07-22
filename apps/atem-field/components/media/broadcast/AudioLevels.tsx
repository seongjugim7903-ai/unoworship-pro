'use client';

/**
 * AudioLevels — 오디오 레벨 VU 미러 (데스크탑 오디오 엔진에서 전송)
 *
 * Phase 2A.2: 목 데이터 기반 정적 바. 실제 레벨 반영은 오디오 콘솔 Phase.
 */

import { useMediaStore } from '@/lib/media/mediaStore';
import type { AudioLevelSnapshot } from '@/lib/media/mediaTypes';
import { ConsolePanel } from './_common';

/**
 * 탭 안에서 래퍼 없이 쓰기 위한 바디 컴포넌트.
 * 기본 내보내기는 ConsolePanel 로 감싸서 단독으로도 쓸 수 있게 둡니다.
 */
export function AudioLevelsBody() {
  const levels = useMediaStore((s) => s.session.audioLevels);
  return (
    <ul className="space-y-2.5">
      {levels.map((lv) => (
        <Meter key={lv.channel} lv={lv} />
      ))}
    </ul>
  );
}

export default function AudioLevels() {
  return (
    <ConsolePanel title="Audio Levels" hint="데스크탑 엔진 VU 미러">
      <AudioLevelsBody />
    </ConsolePanel>
  );
}

function Meter({ lv }: { lv: AudioLevelSnapshot }) {
  // -60dB ~ 0dB 범위 → 0~100%
  const pct = lv.muted ? 0 : Math.max(0, Math.min(100, ((lv.db + 60) / 60) * 100));
  return (
    <li>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-bold text-gray-300">{lv.label}</span>
        <span
          className={`text-[10px] font-mono tabular-nums ${
            lv.muted ? 'text-gray-600' : lv.db > -6 ? 'text-red-400' : lv.db > -18 ? 'text-green-400' : 'text-gray-400'
          }`}
        >
          {lv.muted ? 'MUTE' : `${lv.db} dB`}
        </span>
      </div>
      <div className="h-2 rounded bg-[#15171e] border border-gray-800 overflow-hidden relative">
        <div
          className={`h-full ${
            lv.muted
              ? 'bg-gray-700'
              : 'bg-gradient-to-r from-green-500 via-yellow-500 to-red-500'
          }`}
          style={{ width: `${pct}%` }}
        />
        {/* -18dB / -6dB 마크 */}
        <span className="absolute top-0 bottom-0 border-l border-yellow-600/40" style={{ left: '70%' }} />
        <span className="absolute top-0 bottom-0 border-l border-red-600/40" style={{ left: '90%' }} />
      </div>
    </li>
  );
}
