/**
 * src/parser/contextTracker.js
 *
 * "현재 어느 책 몇 장을 보고 있는가"를 추적한다.
 *
 * 절 번호만 말씀하시는 경우가 실제로 잦다. (2026-07-26 설교에서 4건)
 *   35:04  "로마서 5장 8절에는"   → 문맥 = 롬 5장
 *   35:34  "6절에"               → 롬 5:6  으로 해석되어야 함
 *
 * 사람이 가장 자주 놓치는 지점이자, 기계가 가장 잘하는 지점이다.
 */

export class ContextTracker {
  /**
   * @param {{bookId:string, chapter:number, verses:number[]}} passage 오늘 본문
   */
  constructor(passage = null, staleSec = 60, quoteList = []) {
    this.passage = passage;          // 오늘 본문 (범위 검증용)
    /**
     * 사전 등록된 인용구절 목록. 절 범위까지 있으면 본문과의 혼선을 없앤다.
     *
     *   본문 요 2:2-25 / 인용 마 13:7-13  → 7~13절이 양쪽에 다 존재
     *     "8절"  → 인용 범위 안  → 마 13:8
     *     "20절" → 인용 범위 밖, 본문 범위 안 → 요 2:20
     *
     * 범위가 서로 다르므로 대부분의 절 번호가 스스로 구분된다.
     * 추정(인접성·경과시간)은 범위 정보가 없을 때의 폴백으로만 쓴다.
     */
    this.quoteList = quoteList;
    this.activeQuote = null;         // 현재 낭독 중인 인용구절
    this.book = passage?.bookId ?? null;
    this.chapter = passage?.chapter ?? null;
    this.updatedAt = 0;
    this.lastVerse = null;   // 현재 문맥에서 마지막으로 지시된 절
    this.staleSec = staleSec;
    /**
     * 타 책 문맥을 유지할지 판단하는 주 신호는 "절 번호의 인접성"이다.
     * 설교는 인용한 절 주변을 이어서 읽는 흐름이기 때문이다.
     *
     *   요일 4:7 → "8절"   (+1, 인접) → 요일 4:8   유지
     *   롬 5:8  → "6절"   (-2, 인접) → 롬 5:6     유지
     *   마 22:37 → "38절"  (+1, 인접) → 마 22:38   유지
     *   히 1:3  → "33절"  (+30, 멀다) → 본문 복귀
     *   엡 5:2  → "28절"  (+26, 멀다) → 본문 복귀   ← 2026-07-19 실패 사례
     *
     * 시간만으로는 엡 5:2 → 28절(60초)이 경계에 걸려 불안정했다.
     */
    this.adjacency = 3;
  }

  /** 등록된 인용구절 중 이 참조와 맞는 항목을 찾는다 (절 범위가 있는 것만) */
  findQuote(bookId, chapter) {
    return this.quoteList.find(
      (q) => q.bookId === bookId && q.chapter === chapter && q.verses?.length,
    ) || null;
  }

  /** 완전한 참조가 나오면 문맥을 갱신 */
  update(ref, at = 0) {
    if (ref.bookId) {
      this.book = ref.bookId;
      if (ref.chapter) this.chapter = ref.chapter;
      this.updatedAt = at;
      // 본문이 아닌 등록 인용구절로 들어가면 그 구절을 활성화한다
      if (!this.passage || ref.bookId !== this.passage.bookId || ref.chapter !== this.passage.chapter) {
        this.activeQuote = this.findQuote(ref.bookId, ref.chapter);
      } else {
        this.activeQuote = null;   // 본문으로 돌아옴
      }
    } else if (ref.chapter) {
      this.chapter = ref.chapter;
      this.updatedAt = at;
    }
    if (ref.verses && ref.verses.length) {
      this.lastVerse = ref.verses[ref.verses.length - 1];
    }
  }

  /**
   * 불완전한 참조를 현재 문맥으로 보완한다.
   * @returns {{bookId, chapter, verses, resolvedBy}} 또는 null
   */
  resolve(ref, at = 0, opts = {}) {
    let bookId = ref.bookId;
    let chapter = ref.chapter;
    let resolvedBy = 'explicit';

    // "본문 13절에" — 목사님이 본문임을 명시하면 문맥보다 우선한다.
    // 실제로 인용을 마치고 돌아오실 때 "본문"이라고 말씀하시는 경우가 많다.
    if (!bookId && opts.forcePassage && this.passage) {
      if (!ref.chapter || ref.chapter === this.passage.chapter) {
        this.activeQuote = null;   // 인용 낭독 종료
        return {
          bookId: this.passage.bookId,
          chapter: this.passage.chapter,
          verses: ref.verses ?? [],
          resolvedBy: 'passage-keyword',
        };
      }
    }

    if (!bookId) {
      // 절만 있는 경우 → 현재 문맥의 책·장
      let ctxBook = this.book;
      let ctxChapter = this.chapter;

      /**
       * 등록된 인용구절을 낭독 중이라면 절 범위로 판단한다.
       * 시간이 아무리 흘러도(설교가 길어져도) 범위 안이면 인용구절이다.
       *
       *   활성 인용 마 13:7-13, 본문 요 2:2-25
       *     "8절"  → 인용 범위 안  → 마 13:8
       *     "20절" → 인용 범위 밖  → 본문 요 2:20 으로 이탈
       */
      const q = this.activeQuote;
      const v = ref.verses?.length ? ref.verses[0] : null;
      if (q && v != null && !ref.chapter) {
        const lo = Math.min(...q.verses);
        const hi = Math.max(...q.verses);
        if (v >= lo && v <= hi) {
          return {
            bookId: q.bookId,
            chapter: q.chapter,
            verses: ref.verses,
            resolvedBy: 'quote-range',
          };
        }
        // 인용 범위를 벗어났다 → 인용 낭독이 끝난 것으로 본다
        this.activeQuote = null;
      }

      // 타 책 문맥은 "이어 읽는 흐름"일 때만 유지한다.
      if (this.passage && ctxBook !== this.passage.bookId) {
        const v = ref.verses?.length ? ref.verses[0] : null;
        const near =
          v != null && this.lastVerse != null &&
          Math.abs(v - this.lastVerse) <= this.adjacency;
        const fresh = at - this.updatedAt <= this.staleSec;
        if (!(near && fresh)) {
          ctxBook = this.passage.bookId;
          ctxChapter = this.passage.chapter;
          resolvedBy = 'passage-return';
        }
      }

      if (!ctxBook) return null;
      bookId = ctxBook;
      chapter = ref.chapter ?? ctxChapter;
      if (resolvedBy !== 'passage-return') {
        resolvedBy = ref.chapter ? 'context-book' : 'context-book-chapter';
      }
    } else if (!chapter) {
      // 책만 있고 장이 없음 ("고린도서 13장"은 장 있음 / "마태복음 22장에 보면" 등)
      chapter = this.book === bookId ? this.chapter : null;
      resolvedBy = 'context-chapter';
    }

    if (!chapter) return null;
    return { bookId, chapter, verses: ref.verses ?? [], resolvedBy };
  }

  /**
   * 본문 범위 검증.
   * 본문이 요 13:31-38 인데 "3절"이 나오면 오인식을 의심한다.
   * @returns {'in-passage'|'out-of-passage'|'other-book'|'unknown'}
   */
  checkRange(resolved) {
    const p = this.passage;
    if (!p || !resolved) return 'unknown';
    if (resolved.bookId !== p.bookId) return 'other-book';
    if (resolved.chapter !== p.chapter) return 'other-book';
    if (!resolved.verses.length) return 'in-passage';
    const lo = Math.min(...p.verses);
    const hi = Math.max(...p.verses);
    const allIn = resolved.verses.every((v) => v >= lo && v <= hi);
    return allIn ? 'in-passage' : 'out-of-passage';
  }
}
