// 주보에서 뽑아낼 예배 순서 세 가지의 정의와 병합 규칙.
// 주일낮예배 · 주일오후예배 · 수요예배만 다룬다 — 교회소식과 금요기도회는 뽑지 않는다
// (교회소식은 자체 탭에서 직접 입력받는다).
//
// 각 순서가 나중에 어느 프로그램으로 흘러가는지도 여기 한 곳에 적어 둔다.
// 실제 분배는 다음 단계에서 붙인다 — 지금은 어디로 갈지 화면에 보여 주기만 한다.

export type BulletinServiceKey = 'sundayMorning' | 'sundayAfternoon' | 'wednesday';

export interface BulletinServiceDef {
  key: BulletinServiceKey;
  /** 시스템 정기예배명 — 부속 프로그램의 service_type 으로 그대로 쓴다 */
  serviceType: string;
  /** 이 순서가 흘러갈 곳 — 화면 안내 문구 */
  destination: string;
}

export const BULLETIN_SERVICES: BulletinServiceDef[] = [
  {
    key: 'sundayMorning',
    serviceType: '주일낮예배',
    destination: '설교대지 · 찬송가 · 찬양으로 나뉨',
  },
  {
    key: 'sundayAfternoon',
    serviceType: '주일오후예배',
    destination: '설교대지 · 찬송가 · 찬양으로 나뉨',
  },
  {
    key: 'wednesday',
    serviceType: '수요예배',
    destination: '설교대지 · 찬송가 · 찬양으로 나뉨',
  },
];

export type BulletinOrders = Record<BulletinServiceKey, string>;

export function emptyBulletinOrders(): BulletinOrders {
  return { sundayMorning: '', sundayAfternoon: '', wednesday: '' };
}

/**
 * 주보는 보통 앞뒤 여러 면이라 면마다 따로 분석한다.
 * 같은 예배 순서가 두 면에 걸쳐 있으면 줄바꿈으로 이어 붙인다 — 내용을 버리지 않는다.
 */
export function mergeBulletinOrders(results: Partial<BulletinOrders>[]): BulletinOrders {
  const merged = emptyBulletinOrders();

  for (const result of results) {
    for (const { key } of BULLETIN_SERVICES) {
      const value = (result[key] ?? '').trim();
      if (!value) continue;
      merged[key] = merged[key] ? `${merged[key]}\n${value}` : value;
    }
  }

  return merged;
}

/** 사람이 읽을 합본 텍스트 — weekly_bulletins.content 로 저장한다 */
export function toBulletinText(orders: BulletinOrders): string {
  return BULLETIN_SERVICES.map(({ key, serviceType }) => {
    const body = orders[key].trim();
    return body ? `[${serviceType}]\n${body}` : '';
  })
    .filter(Boolean)
    .join('\n\n');
}

/** 순서가 하나라도 있는지 */
export function hasAnyBulletinOrder(orders: BulletinOrders): boolean {
  return BULLETIN_SERVICES.some(({ key }) => orders[key].trim().length > 0);
}

/** 순서표에서 항목 줄 개수 — 미리보기에 몇 줄이 잡혔는지 보여 준다 */
export function countOrderLines(value: string): number {
  return value.split('\n').filter((line) => line.trim().length > 0).length;
}
