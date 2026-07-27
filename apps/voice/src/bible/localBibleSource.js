/**
 * src/bible/localBibleSource.js
 *
 * 교회가 로컬에 설치한 성경 데이터를 읽는 어댑터.
 *
 * 우노워십 프로가 쓰는 것과 같은 파일을 그대로 참조한다.
 *   apps/atem-field/app/api/bible/route.ts
 *   → dataPath('bibles', 'local-bible.json')
 *
 * 이 모듈은 성경 본문을 내장하지 않는다. 저작권은 교회가 보유·설치한
 * 데이터에 귀속되며, 파일이 없으면 장 검색 기능만 비활성화된다.
 *
 * 기대 형식 (우노워십 프로와 동일):
 *   { books: [ { id, name, chapters: [ { num, verses: [ { num, text } ] } ] } ] }
 */

import fs from 'node:fs';

export class LocalBibleSource {
  /**
   * @param {string} filePath local-bible.json 경로
   */
  constructor(filePath) {
    this.filePath = filePath;
    this.cache = null;
    this.mtimeMs = 0;
  }

  /** 파일 존재 여부 (없으면 장 검색을 끄면 된다) */
  available() {
    try { return fs.existsSync(this.filePath); } catch { return false; }
  }

  load() {
    if (!this.available()) return null;
    const stat = fs.statSync(this.filePath);
    if (this.cache && stat.mtimeMs === this.mtimeMs) return this.cache;
    this.cache = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
    this.mtimeMs = stat.mtimeMs;
    return this.cache;
  }

  /**
   * ChapterSearch 가 요구하는 인터페이스.
   * @returns {Array<{num:number, text:string}>}
   */
  getChapter(bookId, chapter) {
    const data = this.load();
    if (!data?.books) return [];
    const book = data.books.find((b) => b.id === bookId);
    const ch = book?.chapters?.find((c) => c.num === chapter);
    if (!ch?.verses) return [];
    return ch.verses.map((v) => ({ num: v.num, text: v.text }));
  }

  /**
   * 해당 장의 절 수. 숫자 오인식 검증에 쓴다.
   * (히브리서 1장은 14절까지 → "33절"은 오인식)
   */
  verseCount(bookId, chapter) {
    return this.getChapter(bookId, chapter).length || null;
  }
}

/** 파일이 없으면 null 을 돌려 호출부에서 기능을 끄게 한다 */
export function tryLoadBible(filePath) {
  const src = new LocalBibleSource(filePath);
  return src.available() ? src : null;
}
