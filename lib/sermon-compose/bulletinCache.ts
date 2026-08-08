// 한 번 분석한 주보를 그 주 내내 다시 쓴다.
//
// 주보 한 장에 주일낮·주일오후·수요예배가 다 들어 있다. 주일 오후가 끝나 도래 예배가
// 수요예배로 넘어가면, 같은 주보를 다시 올리지 않고도 수요예배 순서가 채워져야 한다.
// 그래서 분석 결과를 주간 키(그 주 일요일)로 브라우저에 남겨 둔다.
//
// 서버에 두지 않는 이유 — 아직 저장 전 단계의 임시 결과이고, 기존 설교대지 화면도
// 초안을 localStorage 에 두는 방식을 쓰고 있다.

import { emptyBulletinOrders, type BulletinOrders } from './bulletinSections';
import { toWeekStart } from '../weekStart';

const CACHE_KEY = 'unoworship-pro:sermon-compose:bulletin:v1';

export interface CachedBulletin {
  /** 그 주 일요일 (YYYY-MM-DD) */
  weekStart: string;
  orders: BulletinOrders;
  /** 분석한 시각 — 화면에 "언제 올린 주보인지" 알려 준다 */
  savedAt: number;
}

export function saveBulletinCache(serviceDate: string, orders: BulletinOrders): void {
  try {
    const payload: CachedBulletin = {
      weekStart: toWeekStart(serviceDate),
      orders,
      savedAt: Date.now(),
    };
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch (error) {
    console.warn('[bulletin-cache] save failed', error);
  }
}

/** 같은 주간의 주보만 돌려준다. 주가 바뀌면 지난 주보를 쓰지 않는다. */
export function loadBulletinCache(serviceDate: string): CachedBulletin | null {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<CachedBulletin>;
    if (!parsed.weekStart || !parsed.orders) return null;
    if (parsed.weekStart !== toWeekStart(serviceDate)) return null;

    return {
      weekStart: parsed.weekStart,
      /* 섹션이 늘어나기 전에 저장된 캐시에는 없는 키가 있다(교회소식 추가 전 3키).
         빈 값으로 채워 넘긴다 — 그냥 넘기면 화면이 undefined.trim() 으로 터진다. */
      orders: { ...emptyBulletinOrders(), ...(parsed.orders as Partial<BulletinOrders>) },
      savedAt: parsed.savedAt ?? 0,
    };
  } catch (error) {
    console.warn('[bulletin-cache] load failed', error);
    return null;
  }
}

export function clearBulletinCache(): void {
  try {
    window.localStorage.removeItem(CACHE_KEY);
  } catch (error) {
    console.warn('[bulletin-cache] clear failed', error);
  }
}
