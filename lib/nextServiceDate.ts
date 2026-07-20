// 정기예배 종류를 고르면 다가오는 가장 가까운 해당 예배일을 계산한다.
//  주일낮/주일오후예배 → 일요일, 수요예배 → 수요일, 금요기도회 → 금요일,
//  월삭감사예배 → 매월 1일. 오늘이 해당 요일/날짜면 오늘을 반환한다.

const SERVICE_WEEKDAY: Record<string, number> = {
  주일낮예배: 0,
  주일오후예배: 0,
  수요예배: 3,
  금요기도회: 5,
};

function toISO(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function nextServiceDate(serviceType: string, from: Date = new Date()): string | null {
  const base = new Date(from.getFullYear(), from.getMonth(), from.getDate());

  if (serviceType === '월삭감사예배') {
    const target = base.getDate() === 1
      ? base
      : new Date(base.getFullYear(), base.getMonth() + 1, 1);
    return toISO(target);
  }

  const weekday = SERVICE_WEEKDAY[serviceType];
  if (weekday === undefined) return null;

  const offset = (weekday - base.getDay() + 7) % 7; // 오늘이 해당 요일이면 0
  const target = new Date(base);
  target.setDate(target.getDate() + offset);
  return toISO(target);
}
