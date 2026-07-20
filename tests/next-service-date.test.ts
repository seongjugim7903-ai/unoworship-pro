import { describe, expect, it } from 'vitest';
import { nextServiceDate } from '../lib/nextServiceDate';

// 기준: 2026-07-20 (월요일)
const FROM = new Date(2026, 6, 20);

function dayOf(iso: string) {
  return new Date(`${iso}T00:00:00`).getDay();
}

describe('nextServiceDate', () => {
  it('주일 예배는 다가오는 일요일을 고른다', () => {
    expect(dayOf(nextServiceDate('주일낮예배', FROM)!)).toBe(0);
    expect(dayOf(nextServiceDate('주일오후예배', FROM)!)).toBe(0);
    expect(nextServiceDate('주일낮예배', FROM)).toBe('2026-07-26');
  });

  it('수요예배는 다가오는 수요일', () => {
    expect(dayOf(nextServiceDate('수요예배', FROM)!)).toBe(3);
    expect(nextServiceDate('수요예배', FROM)).toBe('2026-07-22');
  });

  it('금요기도회는 다가오는 금요일', () => {
    expect(dayOf(nextServiceDate('금요기도회', FROM)!)).toBe(5);
    expect(nextServiceDate('금요기도회', FROM)).toBe('2026-07-24');
  });

  it('월삭감사예배는 다음 달 1일', () => {
    expect(nextServiceDate('월삭감사예배', FROM)).toBe('2026-08-01');
  });

  it('오늘이 해당 요일이면 오늘', () => {
    const sunday = new Date(2026, 6, 26); // 일요일
    expect(nextServiceDate('주일낮예배', sunday)).toBe('2026-07-26');
    const firstOfMonth = new Date(2026, 7, 1);
    expect(nextServiceDate('월삭감사예배', firstOfMonth)).toBe('2026-08-01');
  });

  it('알 수 없는 종류(기타)는 null', () => {
    expect(nextServiceDate('기타', FROM)).toBeNull();
  });
});
