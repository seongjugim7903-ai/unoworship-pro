'use client';

/**
 * SessionHeader — 대시보드 중앙 컬럼 상단의 세션 요약 카드
 *
 * 레이아웃 개정 후 이 카드는 **중앙 5/12 컬럼 안쪽** 에 들어갑니다.
 * 따라서 가로는 프리뷰 모니터 폭과 동일하고 세로는 가능한 한 얇게.
 *
 * 담는 정보:
 *   1) 예배 선택 드롭다운 (+ 현재 세션 배지)
 *   2) 예배 타이틀 / 설교 제목 / 일시·본문·설교자
 *   3) 서버 동기화 닷
 *
 * 내 등급·Active Operator·권한 인계는 `OperatorRoster` 에서 더 자세히
 * 보여 주므로 이 카드에서는 중복 제거했습니다.
 */

import { useMediaStore } from '@/lib/media/mediaStore';
import { ConsolePanel, SyncDot } from './_common';

export default function SessionHeader() {
  const worship = useMediaStore((s) => s.getSessionWorship());
  const session = useMediaStore((s) => s.session);

  return (
    <ConsolePanel padded={false}>
      <div className="px-3 py-2 flex items-center gap-3 min-w-0">
        {/* 좌측: 배지 + 드롭다운 */}
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="px-1.5 py-0.5 rounded-full bg-violet-600/20 border border-violet-500/30 text-[9px] font-bold tracking-wider text-violet-300 uppercase">
            현재 세션
          </span>
          <button
            type="button"
            className="flex items-center gap-0.5 text-[10px] font-semibold text-gray-400 hover:text-white transition-colors"
            title="다른 예배로 전환"
          >
            예배 변경
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        </div>

        {/* 중앙: 타이틀 + 설교/메타 한 줄 */}
        <div className="flex-1 min-w-0 flex items-baseline gap-2">
          <h1 className="text-[13px] font-bold text-white truncate leading-none shrink-0 max-w-[40%]">
            {worship?.title ?? '예배 미선택'}
          </h1>
          {worship?.sermonTitle && (
            <p className="text-[11px] text-gray-400 truncate leading-none">
              {worship.sermonTitle}
            </p>
          )}
          {worship && (
            <p className="text-[10px] text-gray-500 truncate leading-none">
              {worship.scripture && `· ${worship.scripture}`}
              {worship.preacher && ` · ${worship.preacher}`}
            </p>
          )}
        </div>

        {/* 우측: 싱크닷 */}
        <div className="shrink-0">
          <SyncDot status={session.syncStatus} />
        </div>
      </div>
    </ConsolePanel>
  );
}
