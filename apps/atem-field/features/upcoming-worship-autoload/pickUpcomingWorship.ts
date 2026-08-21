// 앱을 열었을 때 자동으로 불러올 워십 한 건을 고른다.
//
// 규칙은 두 가지다.
//
//   1. 오늘 날짜가 아니라 '도래하는 정기예배'의 날짜로 고른다.
//      주일 오후 2시 30분이 지났으면 그 주일은 이미 끝난 예배이므로
//      다음 수요예배(수 19:30)를 본다. 판단은 worshipServiceGenerator 의
//      WORSHIP_START_TIMES 하나에서만 한다 — 시각을 여기에 다시 적지 않는다.
//
//   2. 같은 날에 여러 번 생성했으면 '나중에 만든 것'을 쓴다.
//      다시 만들었다는 것은 앞의 것을 버렸다는 뜻이기 때문이다.
//
// 주일은 낮·오후가 같은 날짜라 날짜만으로는 갈리지 않는다. 워십 이름에
// 예배종류가 들어 있으면(2026.08.05 수요예배) 그것을 먼저 좁히고, 이름이
// '2026.08.02 예배' 처럼 종류 없이 저장된 예전 것은 규칙 2로 떨어진다.

import { getUpcomingWorship } from '@/lib/generators/worshipServiceGenerator';

/** 고르는 데 필요한 것만 — ServerWorshipLoader 의 WorshipGroup 이 그대로 들어맞는다 */
export interface PickableWorship {
  worshipId: string;
  worshipName: string;
  programs: { createdAt: number }[];
}

/** worshipId 앞머리의 YYYYMMDD */
function dateKeyOf(worshipId: string): string {
  return /^(\d{8})(-|$)/.exec(worshipId)?.[1] ?? '';
}

function toDateKey(d: Date): string {
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}${m}${day}`;
}

/** 그룹이 마지막으로 만들어진 시각 (프로그램 중 가장 늦은 것) */
function latestCreatedAt(group: PickableWorship): number {
  return group.programs.reduce((max, p) => Math.max(max, p.createdAt ?? 0), 0);
}

export function pickUpcomingWorship<T extends PickableWorship>(
  groups: T[],
  now = new Date(),
): T | null {
  const { worshipType, startsAt } = getUpcomingWorship(now);
  const dateKey = toDateKey(startsAt);

  const sameDay = groups.filter((g) => dateKeyOf(g.worshipId) === dateKey);
  if (sameDay.length === 0) return null;

  // 이름에 예배종류가 박힌 것이 있으면 그쪽만 본다 (주일 낮/오후 구분)
  const named = sameDay.filter((g) => g.worshipName.includes(worshipType));
  const pool = named.length > 0 ? named : sameDay;

  return pool.reduce((best, g) =>
    latestCreatedAt(g) >= latestCreatedAt(best) ? g : best,
  );
}
