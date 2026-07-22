'use client';

/**
 * OperatorRoster — 세션 참여자 목록 (Active Operator + Viewers)
 *
 * 한 세션당 Active Operator는 1명만. 나머지는 참관.
 * Lead 등급은 권한 인계 버튼 노출.
 *
 * NOTE: 파생 배열(`viewers`, `candidates`)은 스토어 선택자가 아니라
 *       useMemo 로 로컬에서 만들어야 합니다. 스토어에서 `.map()/.filter()`
 *       로 새 배열을 반환하면 React 19 의 useSyncExternalStore 가
 *       getSnapshot 캐싱 규칙 위반으로 무한 루프를 일으킵니다.
 */

import { useMemo } from 'react';
import { useMediaStore } from '@/lib/media/mediaStore';
import type { BroadcastGrade, Member } from '@/lib/media/mediaTypes';
import { ConsolePanel } from './_common';

const GRADE_BADGE: Record<BroadcastGrade, { label: string; color: string }> = {
  viewer:   { label: '참관',       color: 'bg-gray-700 text-gray-300' },
  operator: { label: '오퍼레이터', color: 'bg-violet-600/20 text-violet-300 border border-violet-500/30' },
  lead:     { label: '책임자',     color: 'bg-rose-600/20 text-rose-300 border border-rose-500/30' },
};

/**
 * 참관자/후보 목록 + 사용자 명 요약을 돌려주는 훅.
 * 탭 헤더에서도 같은 카운트를 쓸 수 있도록 분리해 두었습니다.
 */
export function useRosterData() {
  const session = useMediaStore((s) => s.session);
  const members = useMediaStore((s) => s.members);
  const activeOp = useMediaStore((s) => s.getActiveOperator());
  const canLead = useMediaStore((s) => s.canLeadBroadcast());
  const takeControl = useMediaStore((s) => s.takeOperatorControl);
  const releaseControl = useMediaStore((s) => s.releaseOperatorControl);

  const viewers = useMemo<Member[]>(
    () =>
      session.viewerIds
        .map((id) => members.find((m) => m.id === id))
        .filter((m): m is Member => Boolean(m)),
    [session.viewerIds, members]
  );

  const candidates = useMemo<Member[]>(
    () =>
      members.filter(
        (m) =>
          m.online === true &&
          (m.broadcastGrade === 'operator' || m.broadcastGrade === 'lead') &&
          m.id !== session.activeOperatorId
      ),
    [members, session.activeOperatorId]
  );

  return { activeOp, viewers, candidates, canLead, takeControl, releaseControl };
}

/**
 * 탭 안에서 래퍼 없이 쓰기 위한 바디 컴포넌트.
 */
export function OperatorRosterBody() {
  const { activeOp, viewers, candidates, canLead, takeControl, releaseControl } =
    useRosterData();
  return (
    <div>
      {/* Active Operator */}
      <div className="rounded border border-violet-500/30 bg-violet-500/5 px-3 py-2 mb-3">
        <p className="text-[9px] font-bold tracking-wider text-violet-400 uppercase mb-1">
          Active Operator
        </p>
        {activeOp ? (
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-400 to-indigo-500 flex items-center justify-center text-white text-[12px] font-bold">
              {activeOp.name.slice(0, 1)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-bold text-white truncate">{activeOp.name}</p>
              <span className={`inline-block px-1.5 py-0 rounded text-[9px] font-bold ${GRADE_BADGE[activeOp.broadcastGrade].color}`}>
                {GRADE_BADGE[activeOp.broadcastGrade].label}
              </span>
            </div>
            {canLead && (
              <button
                onClick={releaseControl}
                className="px-2 h-6 rounded text-[9px] font-bold bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors"
                title="Operator 권한 회수"
              >
                회수
              </button>
            )}
          </div>
        ) : (
          <p className="text-[11px] text-amber-400">미배정 · 누구든 권한을 가져갈 수 있습니다</p>
        )}
      </div>

      {/* Viewers */}
      <div>
        <p className="text-[9px] font-bold tracking-wider text-gray-500 uppercase mb-1.5">
          참관 중 ({viewers.length})
        </p>
        {viewers.length === 0 ? (
          <p className="text-[10px] text-gray-600 py-2 text-center">참관자 없음</p>
        ) : (
          <ul className="space-y-1">
            {viewers.map((v) => (
              <li key={v.id} className="flex items-center gap-2 px-1 py-1 rounded hover:bg-white/5">
                <div className="w-6 h-6 rounded-full bg-gray-700 flex items-center justify-center text-[10px] font-bold text-gray-200">
                  {v.name.slice(0, 1)}
                </div>
                <span className="text-[11px] text-gray-300 flex-1 truncate">{v.name}</span>
                <span className={`px-1 rounded text-[8px] font-bold ${GRADE_BADGE[v.broadcastGrade].color}`}>
                  {GRADE_BADGE[v.broadcastGrade].label}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Lead: 권한 인계 후보 */}
      {canLead && candidates.length > 0 && (
        <div className="mt-3 pt-3 border-t border-gray-800">
          <p className="text-[9px] font-bold tracking-wider text-gray-500 uppercase mb-1.5">
            권한 인계 후보
          </p>
          <ul className="space-y-1">
            {candidates.map((c) => (
              <li key={c.id} className="flex items-center gap-2">
                <span className="text-[11px] text-gray-400 flex-1 truncate">{c.name}</span>
                <button
                  onClick={() => takeControl(c.id)}
                  className="px-2 h-6 rounded text-[9px] font-bold bg-violet-600 hover:bg-violet-500 text-white transition-colors"
                >
                  위임
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function OperatorRoster() {
  const { viewers } = useRosterData();
  return (
    <ConsolePanel title="Session Roster" hint={`${viewers.length + 1}명 접속 중`}>
      <OperatorRosterBody />
    </ConsolePanel>
  );
}
