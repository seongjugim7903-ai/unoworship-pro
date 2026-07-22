/**
 * lib/media/worshipDefaults.ts
 *
 * 교회별 정기예배 설정의 기본값.
 * 향후 교회 설정 저장소가 붙으면 이 목록을 기본값으로 두고 church scope 설정으로 덮어쓴다.
 */

export interface RegularWorshipOption {
  value: string;
  label: string;
  dayOfWeek: 0 | 1 | 2 | 3 | 4 | 5 | 6 | null;
  monthlyFirstSunday?: boolean;
}

export const WORSHIP_OTHER_VALUE = '기타';

export const DEFAULT_REGULAR_WORSHIPS: RegularWorshipOption[] = [
  { value: '주일낮예배', label: '주일낮예배', dayOfWeek: 0 },
  { value: '주일오후예배', label: '주일오후예배', dayOfWeek: 0 },
  { value: '수요예배', label: '수요예배', dayOfWeek: 3 },
  { value: '금요기도회', label: '금요기도회', dayOfWeek: 5 },
  { value: '월삭감사예배', label: '월삭감사예배', dayOfWeek: null, monthlyFirstSunday: true },
] as const satisfies RegularWorshipOption[];

export const WORSHIP_SELECT_OPTIONS: RegularWorshipOption[] = [
  ...DEFAULT_REGULAR_WORSHIPS,
  { value: WORSHIP_OTHER_VALUE, label: '기타', dayOfWeek: null },
];

export function isDefaultRegularWorship(value: string): boolean {
  return DEFAULT_REGULAR_WORSHIPS.some((option) => option.value === value);
}

export function getWorshipSelectValue(worshipName: string): string {
  if (!worshipName) return DEFAULT_REGULAR_WORSHIPS[0].value;
  return isDefaultRegularWorship(worshipName) ? worshipName : WORSHIP_OTHER_VALUE;
}

export function getNextRegularWorshipDate(worshipName: string, base = new Date()): Date {
  const option = DEFAULT_REGULAR_WORSHIPS.find((item) => item.value === worshipName);
  if (!option) return new Date(base);

  if (option.monthlyFirstSunday) {
    const year = base.getMonth() === 11 ? base.getFullYear() + 1 : base.getFullYear();
    const month = (base.getMonth() + 1) % 12;
    const firstDay = new Date(year, month, 1);
    const daysUntilSunday = (7 - firstDay.getDay()) % 7;
    return new Date(year, month, 1 + daysUntilSunday);
  }

  if (option.dayOfWeek === null) return new Date(base);

  const targetDay = option.dayOfWeek;
  const currentDay = base.getDay();
  let daysAhead = targetDay - currentDay;
  if (daysAhead < 0) daysAhead += 7;

  const result = new Date(base);
  result.setDate(base.getDate() + daysAhead);
  return result;
}

export function formatYYYYMMDD(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}
