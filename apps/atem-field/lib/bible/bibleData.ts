/**
 * lib/bible/bibleData.ts
 * 서버 측 성경 본문 로더 — data/bibles/local-bible.json 을 메모리에 1회 로드 후 재사용.
 *
 * Node.js server 에서만 동작 (fs 사용). 브라우저에서는 /api/bible 를 통해 접근.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { BibleData, BibleBook, BibleVerse, BibleChapter } from './types';

let cache: BibleData | null = null;

function load(): BibleData {
  if (cache) return cache;
  const file = path.join(process.cwd(), 'data', 'bibles', 'local-bible.json');
  const raw  = fs.readFileSync(file, 'utf-8');
  cache = JSON.parse(raw) as BibleData;
  return cache;
}

export function getBibleData(): BibleData {
  return load();
}

export function getBook(bookId: string): BibleBook | null {
  const data = load();
  return data.books.find((b) => b.id === bookId) ?? null;
}

export function getChapter(bookId: string, chapterNum: number): BibleChapter | null {
  const book = getBook(bookId);
  if (!book) return null;
  return book.chapters.find((c) => c.num === chapterNum) ?? null;
}

/**
 * 요청된 절들 반환. verses 가 빈 배열이면 해당 장의 모든 절.
 */
export function getVerses(bookId: string, chapterNum: number, verses: number[]): BibleVerse[] {
  const ch = getChapter(bookId, chapterNum);
  if (!ch) return [];
  if (verses.length === 0) return ch.verses;
  const set = new Set(verses);
  return ch.verses.filter((v) => set.has(v.num));
}
