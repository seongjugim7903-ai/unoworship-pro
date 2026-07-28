/**
 * src/detect.js
 *
 * 파이프라인 통합:  발화 → 구어체 어댑터 → 문맥 보완 → 게이트 판정
 *
 * STT 엔진과 무관하게 동작한다. 입력은 "텍스트 + 시각"뿐이므로
 * 오프라인 전사본 검증과 실시간 마이크 입력이 같은 코드를 쓴다.
 */

import { parseSpoken } from './parser/spokenAdapter.js';
import { ContextTracker } from './parser/contextTracker.js';
import { judge, isCorrection } from './gate/policy.js';
import { bookName } from './parser/books.js';
import { ChapterSearch } from './search/chapterSearch.js';

export function formatRef(r) {
  if (!r) return '';
  const b = bookName(r.bookId);
  if (!r.verses || !r.verses.length) return `${b} ${r.chapter}장`;
  const vs = r.verses;
  const contiguous = vs.every((v, i) => i === 0 || v === vs[i - 1] + 1);
  const body = contiguous && vs.length > 1 ? `${vs[0]}-${vs[vs.length - 1]}` : vs.join(',');
  return `${b} ${r.chapter}:${body}`;
}

export class Detector {
  /**
   * @param {object} opts
   *   passage   오늘 본문 {bookId, chapter, verses}
   *   quoteList 사전 전달된 인용 구절 목록 [{bookId, chapter, verses}]
   */
  constructor(opts = {}) {
    this.quoteList = opts.quoteList || [];
    this.ctx = new ContextTracker(opts.passage || null, opts.staleSec ?? 60, this.quoteList);
    this.emitted = [];
    this.last = null;
    this.lastKey = null;
    this.lastKeyAt = -Infinity;
    this.repeatWindow = opts.repeatWindow ?? 20;  // 초
    // 장만 지목되고 절이 없을 때 본문 대조로 절을 찾는다 (교회 로컬 성경 데이터 필요)
    this.search = opts.bibleSource ? new ChapterSearch(opts.bibleSource, opts.search) : null;
    // 절 수 검증용 — 게이트에 "그 장에 그 절이 실제로 있는가"를 넘긴다 (policy.js 참조).
    //   verseCount 를 구현하지 않은 소스(합성 테스트 스텁 등)는 그대로 건너뛴다.
    this.bible = typeof opts.bibleSource?.verseCount === 'function' ? opts.bibleSource : null;
  }

  inQuoteList(r) {
    return this.quoteList.some(
      (q) => q.bookId === r.bookId && q.chapter === r.chapter,
    );
  }

  /**
   * 발화 1건 처리.
   * @param {string} text 발화 텍스트
   * @param {number} at   시각(초)
   * @returns {Array} 발행된 이벤트
   */
  feed(text, at) {
    const parsed = parseSpoken(text);
    const events = [];

    // "본문 13절에" 처럼 본문임을 명시한 경우 문맥보다 우선한다. (2026-07-19 36:58)
    const forcePassage = /본문/.test(text);

    // 장만 지목된 뒤 낭독이 이어지면, 본문 대조로 절을 찾아 송출한다.
    //   "요한복음 6장에 보면 이런 말씀 있습니다" → (다음 발화) → 해당 절
    if (this.search) {
      const found = this.search.feed(text, at);
      if (found) {
        const key = `${found.bookId}|${found.chapter}|${found.verses.join(',')}`;
        // [FIX 2026-07-28] 방금 명시적으로 송출한 절을, 이어지는 낭독 대조가 또 보내던 문제.
        //   실측: "마태복음 26장 13절"로 송출 → 0.8초 뒤 낭독 대조가 같은 절을 재송출.
        //   중복 억제를 이 경로에도 적용하고, 여기서도 키를 갱신해 이후 경로와 상태를 공유한다.
        if (this.lastKey === key && at - this.lastKeyAt < this.repeatWindow) {
          this.ctx.update({ bookId: found.bookId, chapter: found.chapter, verses: found.verses }, at);
        } else {
          const ev = {
            at,
            action: 'auto',
            ref: { bookId: found.bookId, chapter: found.chapter, verses: found.verses, resolvedBy: 'text-search' },
            display: formatRef(found),
            confidence: found.score,
            reason: 'chapter-text-search',
            resolvedBy: 'text-search',
            raw: text,
          };
          this.ctx.update(ev.ref, at);
          this.lastKey = key;
          this.lastKeyAt = at;
          events.push(ev);
          this.emitted.push(ev);
          this.last = ev;
        }
      }
    }

    for (const p of parsed) {
      const resolved = this.ctx.resolve(p, at, { forcePassage });
      if (!resolved) continue;

      const range = this.ctx.checkRange(resolved);
      // 숫자 오인식 방어 — 해당 장의 실제 절 수를 넘긴다 (히 1장은 14절까지 → "33절"은 무효).
      //   성경 데이터가 없으면 null 이라 게이트에서 이 검사만 건너뛴다 (기존 동작 유지).
      const verseCount = this.bible?.verseCount(resolved.bookId, resolved.chapter) ?? null;
      const verdict = judge(resolved, text, range, {
        inQuoteList: this.inQuoteList(resolved),
        verseCount,
      });

      // 문맥은 판정과 무관하게 갱신한다 (다음 "6절에"를 위해)
      this.ctx.update({ ...resolved }, at);

      if (verdict.action === 'ignore') {
        events.push({ at, action: 'ignore', ref: resolved, display: formatRef(resolved), ...verdict, raw: text });
        continue;
      }

      // 같은 구절이 짧은 간격으로 다시 잡히면 억제한다.
      // (STT 부분결과·자막 롤업으로 한 발화가 여러 번 도착하기 때문)
      // 단 "다시 보세요" 같은 재호출은 의도된 재송출이므로 통과시킨다.
      const key = `${resolved.bookId}|${resolved.chapter}|${resolved.verses.join(',')}`;
      if (
        this.lastKey === key &&
        at - this.lastKeyAt < this.repeatWindow &&
        !verdict.recall
      ) {
        events.push({ at, action: 'ignore', ref: resolved, display: formatRef(resolved), reason: 'duplicate', raw: text });
        continue;
      }
      this.lastKey = key;
      this.lastKeyAt = at;

      const gapMs = this.last ? (at - this.last.at) * 1000 : Infinity;
      const corrected = isCorrection(this.last?.ref, resolved, gapMs);

      const ev = {
        at,
        action: verdict.action,
        ref: resolved,
        display: formatRef(resolved),
        confidence: Number(verdict.confidence.toFixed(2)),
        reason: verdict.reason,
        corrected: corrected || Boolean(p.corrected),
        resolvedBy: resolved.resolvedBy,
        raw: text,
      };
      events.push(ev);
      if (verdict.action !== 'ignore') {
        this.emitted.push(ev);
        this.last = ev;
      }

      // 장만 지목되고 절이 없으면 → 이어지는 낭독을 대조할 준비를 한다
      if (this.search && resolved.chapter && !resolved.verses.length) {
        this.search.arm(resolved.bookId, resolved.chapter, at);
      }
    }
    return events;
  }
}
