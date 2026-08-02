// 지금 시점에서 가장 먼저 도래하는 정기예배를 고른다.
// 시작 시각이 지난 회차는 '지난 예배'로 보고 다음 회차로 넘어간다.
// 시각 기준은 UnoLive `lib/generators/worshipServiceGenerator.ts` 의 WORSHIP_START_TIMES 와 같다.

import type { ServiceType } from './serviceTypeHint';

interface ServiceSchedule {
  type: ServiceType;
  hour: number;
  minute: number;
  /** 요일(0=일) 또는 매월 1일 */
  on: number | 'firstOfMonth';
}

const SCHEDULES: ServiceSchedule[] = [
  { type: '주일낮예배', hour: 11, minute: 0, on: 0 },   // 1부 9시 · 2부 11시 — 2부 시작 전까지
  { type: '주일오후예배', hour: 14, minute: 30, on: 0 },
  { type: '수요예배', hour: 19, minute: 30, on: 3 },
  { type: '금요기도회', hour: 20, minute: 30, on: 5 },
  { type: '월삭감사예배', hour: 20, minute: 30, on: 'firstOfMonth' },
];

function toISO(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** 이 일정의 다음 회차 시작 시각 */
function nextOccurrence(schedule: ServiceSchedule, now: Date): Date {
  if (schedule.on === 'firstOfMonth') {
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1, schedule.hour, schedule.minute);
    return thisMonth.getTime() >= now.getTime()
      ? thisMonth
      : new Date(now.getFullYear(), now.getMonth() + 1, 1, schedule.hour, schedule.minute);
  }

  const ahead = (schedule.on - now.getDay() + 7) % 7;
  const candidate = new Date(
    now.getFullYear(), now.getMonth(), now.getDate() + ahead,
    schedule.hour, schedule.minute,
  );
  if (candidate.getTime() < now.getTime()) candidate.setDate(candidate.getDate() + 7);
  return candidate;
}

export interface UpcomingService {
  serviceType: ServiceType;
  /** YYYY-MM-DD */
  serviceDate: string;
}

/** 가장 먼저 도래하는 정기예배와 그 날짜 — 폼 기본값으로 쓰고 사용자가 바꿀 수 있다 */
export function getUpcomingService(now: Date = new Date()): UpcomingService {
  let best = SCHEDULES[0];
  let bestTime = Number.POSITIVE_INFINITY;

  for (const schedule of SCHEDULES) {
    const time = nextOccurrence(schedule, now).getTime();
    if (time < bestTime) {
      bestTime = time;
      best = schedule;
    }
  }

  return { serviceType: best.type, serviceDate: toISO(new Date(bestTime)) };
}
