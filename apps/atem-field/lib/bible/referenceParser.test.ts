// 성경 장절 입력 보정 단위테스트 — 실행: npx tsx --test lib/bible/referenceParser.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseReference } from './referenceParser';
import type { BibleBookMeta } from './types';

const books: BibleBookMeta[] = [
  { num: 19, id: 'psa', name: '시편', abbr: '시', testament: 'ot', chapterCount: 150 },
  { num: 27, id: 'dan', name: '다니엘', abbr: '단', testament: 'ot', chapterCount: 12 },
];

test('콜론이 빠진 시136-21-26을 시편 136:21-26으로 보정한다', () => {
  assert.deepEqual(parseReference('시136-21-26', books), {
    bookId: 'psa',
    bookName: '시편',
    chapter: 136,
    verses: [21, 22, 23, 24, 25, 26],
  });
});

test('장절 표기 문자와 공백이 섞인 입력도 보정한다', () => {
  assert.deepEqual(parseReference('시편 136장 21-26절', books)?.verses, [21, 22, 23, 24, 25, 26]);
  assert.deepEqual(parseReference('단 3:1-7', books)?.verses, [1, 2, 3, 4, 5, 6, 7]);
});

test('기존 정상 입력과 장 전체 입력을 유지한다', () => {
  assert.deepEqual(parseReference('시136:21-26', books)?.verses, [21, 22, 23, 24, 25, 26]);
  assert.deepEqual(parseReference('단3', books), {
    bookId: 'dan',
    bookName: '다니엘',
    chapter: 3,
    verses: [],
  });
});
