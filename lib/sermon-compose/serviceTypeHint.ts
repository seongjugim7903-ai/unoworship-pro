// 협조문 첫 줄의 예배 표기를 시스템 예배 종류명으로 매핑한다.
// 협조문은 '주일 오전예배'라고 쓰지만 시스템 표기는 '주일낮예배'다.

/** 설교대지 페이지의 SERVICE_TYPES 와 같은 값이어야 한다 */
export const SERVICE_TYPES = [
  '주일낮예배',
  '주일오후예배',
  '수요예배',
  '금요기도회',
  '월삭감사예배',
] as const;

export type ServiceType = (typeof SERVICE_TYPES)[number];

/**
 * 공백을 지운 뒤 앞에서부터 검사한다. '주일오후'를 '주일'보다 먼저 봐야
 * 주일오후예배가 주일낮예배로 잘못 잡히지 않는다.
 */
const RULES: Array<{ needle: string; type: ServiceType }> = [
  { needle: '주일오후', type: '주일오후예배' },
  { needle: '주일저녁', type: '주일오후예배' },
  { needle: '주일오전', type: '주일낮예배' },
  { needle: '주일낮', type: '주일낮예배' },
  { needle: '수요', type: '수요예배' },
  { needle: '금요', type: '금요기도회' },
  { needle: '월삭', type: '월삭감사예배' },
  // 위 어느 것도 아닌 '주일예배'는 가장 흔한 주일낮예배로 본다 (검수 화면에서 바꿀 수 있다)
  { needle: '주일', type: '주일낮예배' },
];

/** 예배 종류를 찾지 못하면 빈 문자열을 돌려준다 */
export function detectServiceType(line: string): string {
  const compact = line.replace(/\s+/g, '');
  for (const rule of RULES) {
    if (compact.includes(rule.needle)) return rule.type;
  }
  return '';
}

/** 예배 종류 이름이 들어 있을 법한 줄인지 — 첫 줄 안내문을 소비할지 판단할 때 쓴다 */
export function looksLikeServiceHeader(line: string): boolean {
  return /예배|기도회|집회/.test(line);
}
