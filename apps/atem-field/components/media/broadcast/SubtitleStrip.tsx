'use client';

/**
 * SubtitleStrip — 현재/다음 자막 섹션 카드
 *
 * 레이아웃 개정 후 좌측 3/12 컬럼 안쪽에 들어가므로
 * Current / Next 를 가로 2열이 아닌 **세로 스택** 으로 배치합니다.
 *
 * UnoLive 데스크탑의 섹션 전환을 미러링. Phase 2A.2 는 정적 표시.
 */

import { useMediaStore } from '@/lib/media/mediaStore';
import { ConsolePanel } from './_common';

export default function SubtitleStrip() {
  const session = useMediaStore((s) => s.session);

  return (
    <ConsolePanel title="Subtitle Sections" hint="UnoLive 데스크탑 섹션 상태" padded={false}>
      <div className="px-3 pb-3 grid grid-cols-2 gap-2">
        {/* Current */}
        <div className="rounded-lg border border-violet-500/30 bg-violet-500/5 px-3 py-2 min-w-0">
          <p className="text-[9px] font-bold tracking-wider text-violet-400 uppercase">
            Current
          </p>
          <p className="mt-0.5 text-[13px] font-bold text-white truncate">
            {session.currentSectionLabel ?? '—'}
          </p>
        </div>

        {/* Next */}
        <div className="rounded-lg border border-gray-800 bg-[#15171e] px-3 py-2 min-w-0">
          <p className="text-[9px] font-bold tracking-wider text-gray-500 uppercase">
            Next
          </p>
          <p className="mt-0.5 text-[13px] font-bold text-gray-300 truncate">
            {session.nextSectionLabel ?? '—'}
          </p>
        </div>
      </div>
    </ConsolePanel>
  );
}
