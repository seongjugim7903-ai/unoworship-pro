import { describe, expect, it } from 'vitest';
import { getUpcomingService } from '../lib/sermon-compose/upcomingService';

// 예배 시작 시각 — 주일낮 일 11:00 · 주일오후 일 14:30 · 수요 수 19:30
//                  금요기도회 금 20:30 · 월삭감사 매월 1일 20:30

describe('getUpcomingService', () => {
  it('월요일에는 그 주 수요예배가 가장 먼저 도래한다', () => {
    // 2026-08-03(월) 10:00 — 수요예배 8/5 가 다음 주일 8/9 보다 먼저다
    expect(getUpcomingService(new Date(2026, 7, 3, 10, 0))).toEqual({
      serviceType: '수요예배',
      serviceDate: '2026-08-05',
    });
  });

  it('주일 아침에는 그날 주일낮예배를 고른다', () => {
    expect(getUpcomingService(new Date(2026, 7, 9, 8, 0))).toEqual({
      serviceType: '주일낮예배',
      serviceDate: '2026-08-09',
    });
  });

  it('주일낮예배가 시작하면 같은 날 주일오후예배로 넘어간다', () => {
    expect(getUpcomingService(new Date(2026, 7, 9, 11, 30))).toEqual({
      serviceType: '주일오후예배',
      serviceDate: '2026-08-09',
    });
  });

  it('주일 저녁에는 다가오는 수요예배를 고른다', () => {
    expect(getUpcomingService(new Date(2026, 7, 9, 20, 0))).toEqual({
      serviceType: '수요예배',
      serviceDate: '2026-08-12',
    });
  });

  it('수요예배가 끝난 시각에는 금요기도회를 고른다', () => {
    expect(getUpcomingService(new Date(2026, 7, 12, 21, 0))).toEqual({
      serviceType: '금요기도회',
      serviceDate: '2026-08-14',
    });
  });

  it('월삭감사예배가 가장 가까우면 그것을 고른다', () => {
    // 2026-09-01(화) 09:00 — 그날 20:30 월삭이 수요예배(9/2)보다 먼저다
    expect(getUpcomingService(new Date(2026, 8, 1, 9, 0))).toEqual({
      serviceType: '월삭감사예배',
      serviceDate: '2026-09-01',
    });
  });

  it('항상 정기예배 하나와 날짜를 돌려준다', () => {
    const result = getUpcomingService(new Date(2026, 7, 5, 3, 12));
    expect(result.serviceType).toBeTruthy();
    expect(result.serviceDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
