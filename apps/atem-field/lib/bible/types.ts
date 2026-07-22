/**
 * lib/bible/types.ts
 * 성경 데이터 타입 (data/bibles/krv.json + meta.json 과 일치)
 */

export type Testament = 'ot' | 'nt';

export interface BibleVersionInfo {
  id: string;          // 'krv'
  name: string;        // '개역한글'
  year: number;
  copyright: string;
  source: string;
}

export interface BibleBookMeta {
  num:          number;     // 1~66
  id:           string;     // 'gen', 'jhn'...
  name:         string;     // '창세기'
  abbr:         string;     // '창'
  testament:    Testament;
  chapterCount: number;
}

export interface BibleVerse {
  num:  number;
  text: string;
}

export interface BibleChapter {
  num:    number;
  verses: BibleVerse[];
}

export interface BibleBook extends Omit<BibleBookMeta, 'chapterCount'> {
  chapters: BibleChapter[];
}

export interface BibleData {
  version: BibleVersionInfo;
  books:   BibleBook[];
}

export interface BibleMeta {
  version: BibleVersionInfo;
  books:   BibleBookMeta[];
}

/** 파싱된 성경 참조 — "요3:16-18" → { bookId: 'jhn', chapter: 3, verses: [16,17,18] } */
export interface BibleReference {
  bookId:   string;
  bookName: string;   // 찾은 책 이름 (표시용)
  chapter:  number;
  verses:   number[]; // 요청된 절 번호 (정렬됨, 중복 제거)
}
