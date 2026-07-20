// 주보는 한 주에 한 건 — 어떤 날짜든 그 주의 시작(일요일)로 정규화해 주간 키로 쓴다.

export function toWeekStart(dateISO: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateISO.trim());
  const base = match
    ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
    : new Date();
  base.setHours(0, 0, 0, 0);
  base.setDate(base.getDate() - base.getDay()); // getDay: 0=일요일
  const year = base.getFullYear();
  const month = String(base.getMonth() + 1).padStart(2, '0');
  const day = String(base.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// 주간 라벨 — 예: "2026-07-19 ~ 07-25 주간"
export function formatWeekLabel(weekStart: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(weekStart);
  if (!match) return weekStart;
  const start = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const endLabel = `${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;
  return `${weekStart} ~ ${endLabel} 주간`;
}
