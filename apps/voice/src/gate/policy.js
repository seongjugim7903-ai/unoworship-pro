/**
 * src/gate/policy.js
 *
 * 감지된 참조를 실제로 송출할지 판정한다.
 *
 * 원칙: 오검출 0건이 검출률보다 우선한다.
 *   자막이 안 나오면 담당자가 메울 수 있지만,
 *   틀린 자막은 예배 흐름을 깬다.
 */

/**
 * 송출 신호 — "지금 보라"는 의도.
 * 설교자마다 어투가 달라 넓게 잡는다.
 * ('보세요'가 빠져 있어 2026-07-12 설교에서 HOLD로 밀린 사례가 있었다)
 */
const CUE = [
  '보시', '보세', '보실', '보십시오', '봅시다', '봅니다', '볼까요', '보겠', '보면',
  '읽어', '읽겠', '읽으', '받겠', '함께', '같이', '나옵니다', '고백합니다',
  '말씀입니다', '말씀이십니다', '말씀에', '기억하',
];

/**
 * 반(反)신호 — 언급일 뿐 송출 대상이 아님.
 *
 * 2026-07-12 설교에서 확인된 유형: 다른 사람의 성경 암송·필사를 *이야기*하는 맥락.
 *   "로마서 1장부터 16장 전장을 다 외웠다"
 *   "고린도전서 13장을 외우시고"
 *   "창세기부터 요한계시록까지 11번을 쓰셨잖아요"
 * 화면에 띄우라는 요청이 아니라 예화다.
 *
 * 주의: '암송하'는 막되 '암송합시다'(회중 함께 암송 → 송출 필요)는 막지 않는다.
 */
const ANTI = [
  '나중에', '사이에', '이따가', '지난주에는',
  '외우', '외웠', '외워', '외운', '암송하', '필사', '쓰셨',
];

/**
 * 재호출 신호 — 이미 지나간 구절을 "다시" 보자는 요청.
 * 2026-07-26  57:45 "그 말씀이 아까 읽은 36절에 있는 말씀이시죠"
 *   → 14초 뒤 실제로 재낭독. 반드시 다시 띄워야 한다.
 * '아까'를 반신호로 두면 이 경우를 놓치므로 분리한다.
 */
const RECALL = ['아까', '다시', '한번 더', '앞서', '그 말씀'];

export function isRecall(text) {
  return RECALL.some((c) => (text || '').includes(c));
}

/**
 * @param {object} resolved  문맥 보완된 참조
 * @param {string} raw       발화 원문
 * @param {string} range     ContextTracker.checkRange 결과
 * @param {object} opts      { inQuoteList: boolean }  인용 목록에 등록된 구절인지
 * @returns {{action:'auto'|'hold'|'ignore', confidence:number, reason:string}}
 */
export function judge(resolved, raw, range, opts = {}) {
  if (!resolved) return { action: 'ignore', confidence: 0, reason: 'unresolved' };

  const text = raw || '';
  const hasCue = CUE.some((c) => text.includes(c));
  const hasAnti = ANTI.some((c) => text.includes(c));
  const recall = isRecall(text);

  // 재호출("아까 그 36절")은 반신호보다 우선한다 — 다시 띄워야 하는 요청이므로
  if (hasAnti && !recall) {
    return { action: 'ignore', confidence: 0.2, reason: 'anti-cue' };
  }

  const complete = Boolean(resolved.bookId && resolved.chapter && resolved.verses.length);
  const explicit = resolved.resolvedBy === 'explicit';

  /**
   * 본문 범위 밖이라고 기각하지 않는다.
   *
   * 2026-07-19 설교(본문 요 10:7-18)에서 목사님은 같은 장의
   * 26·27·28·42절을 정상적으로 인용하셨다. 범위 밖 = 오인식이라는
   * 가정은 틀렸다. 설교자는 본문 앞뒤를 자유롭게 오간다.
   *
   * 숫자 오인식은 범위가 아니라 "그 장에 실제로 그 절이 있는가"로
   * 걸러야 한다. (히브리서 1장은 14절까지 → 33절은 무효)
   * 절 수 검증은 로컬 성경 데이터(local-bible.json) 연결 후 활성화한다.
   */
  let confidence = 0.5;
  if (explicit) confidence += 0.25;
  if (complete) confidence += 0.1;
  if (hasCue) confidence += 0.1;
  if (opts.inQuoteList) confidence += 0.1;
  if (range === 'in-passage') confidence += 0.1;
  confidence = Math.max(0, Math.min(1, confidence));

  // 해당 장에 존재하지 않는 절 번호 → 오인식 (성경 데이터 있을 때만 동작)
  if (opts.verseCount && resolved.verses.some((v) => v > opts.verseCount)) {
    return { action: 'ignore', confidence: 0.1, reason: 'verse-out-of-chapter' };
  }

  /**
   * 책·장·절을 모두 직접 말씀하셨으면 인용 목록에 없어도 자동 송출한다.
   *
   * 목록은 "선행 감지로 후보를 좁히고 확신도를 올리는" 보조 수단일 뿐,
   * 송출의 전제 조건이 아니다. 발화 자체가 완전하면 그것으로 충분하다.
   * (목록 밖 구절은 조금 늦게 떠도 무방하다는 운영 방침)
   */
  if (explicit && complete) {
    return { action: 'auto', confidence: Math.max(confidence, 0.85), reason: 'explicit-complete', recall };
  }
  if (confidence >= 0.85 && complete) {
    return { action: 'auto', confidence, reason: 'high-confidence', recall };
  }
  if (range === 'in-passage' && (hasCue || recall)) {
    return { action: 'auto', confidence, reason: recall ? 'recall' : 'in-passage-cue', recall };
  }
  if (confidence >= 0.6) {
    return { action: 'hold', confidence, reason: 'needs-review' };
  }
  return { action: 'ignore', confidence, reason: 'low-confidence' };
}

/**
 * 자기정정 감시.
 * 송출 후 window(ms) 안에 다른 책 이름이 나오면 교체 대상으로 본다.
 *   2026-07-26 36:07  "요한복음 … 아, 고린도서 13장"
 */
export function isCorrection(prev, next, gapMs, window = 1500) {
  if (!prev || !next) return false;
  if (gapMs > window) return false;
  return prev.bookId !== next.bookId;
}
