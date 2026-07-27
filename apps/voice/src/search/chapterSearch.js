/**
 * src/search/chapterSearch.js
 *
 * 장 검색 모드.
 *
 *   "요한복음 6장에 보면 이런 말씀 있습니다" 처럼
 *   절 번호 없이 장만 말씀하시고 내용을 낭독/인용하는 경우를 처리한다.
 *
 * 성경 전체(31,102절)에서 찾는 것은 어렵지만, 장이 지목되면
 * 후보가 수십 절로 줄어 대조가 현실적이 된다.
 *
 * 성경 본문은 교회가 로컬에 설치한 데이터에서 읽는다.
 * 이 모듈은 텍스트를 내장하지 않고 bibleSource 인터페이스로만 접근한다.
 *
 *   bibleSource.getChapter(bookId, chapter) → [{ num, text }, ...]
 */

/** 조사·공백·문장부호를 걷어내고 한글만 남긴다 (STT 표기 흔들림 흡수) */
export function normalizeForMatch(s) {
  return (s || '')
    .replace(/[^가-힣]/g, '')
    .replace(/(이라|하며|하고|에게|에서|으로|께서|이시|하니|노라|니라|하라)/g, '');
}

/** 문자 바이그램 집합 */
function bigrams(s) {
  const out = new Set();
  for (let i = 0; i < s.length - 1; i++) out.add(s.slice(i, i + 2));
  return out;
}

/** Dice 계수 — 부분 인용·의역에 강하다 */
export function similarity(a, b) {
  const A = bigrams(normalizeForMatch(a));
  const B = bigrams(normalizeForMatch(b));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const g of A) if (B.has(g)) inter++;
  return (2 * inter) / (A.size + B.size);
}

export class ChapterSearch {
  /**
   * @param {{getChapter:(bookId:string,chapter:number)=>Array<{num:number,text:string}>}} bibleSource
   */
  constructor(bibleSource, opts = {}) {
    this.source = bibleSource;
    this.minScore = opts.minScore ?? 0.35;   // 채택 최소 유사도
    this.margin = opts.margin ?? 0.08;       // 2위와의 최소 격차 (애매하면 포기)
    this.windowSec = opts.windowSec ?? 90;   // 장 지목 후 유효 시간
    this.armed = null;
  }

  /** "요한복음 6장" 감지 시 무장 */
  arm(bookId, chapter, at) {
    let verses = [];
    try {
      verses = this.source?.getChapter(bookId, chapter) || [];
    } catch { verses = []; }
    if (!verses.length) { this.armed = null; return false; }
    this.armed = { bookId, chapter, verses, at, hit: false };
    return true;
  }

  disarm() { this.armed = null; }

  /**
   * 이후 발화를 지목된 장의 각 절과 대조한다.
   * @returns {{bookId,chapter,verses:number[],score:number,runnerUp:number}|null}
   */
  feed(text, at) {
    const a = this.armed;
    if (!a) return null;
    if (at - a.at > this.windowSec) { this.armed = null; return null; }

    const probe = normalizeForMatch(text);
    if (probe.length < 8) return null;   // 너무 짧으면 판단 보류

    let best = null, bestScore = 0, second = 0;
    for (const v of a.verses) {
      const s = similarity(text, v.text);
      if (s > bestScore) { second = bestScore; bestScore = s; best = v; }
      else if (s > second) second = s;
    }

    if (!best || bestScore < this.minScore) return null;
    if (bestScore - second < this.margin) return null;  // 1·2위가 붙으면 포기

    a.hit = true;
    this.armed = null;   // 한 번 찾으면 해제 (다음 장 지목 때 다시 무장)
    return {
      bookId: a.bookId,
      chapter: a.chapter,
      verses: [best.num],
      score: Number(bestScore.toFixed(3)),
      runnerUp: Number(second.toFixed(3)),
    };
  }
}
