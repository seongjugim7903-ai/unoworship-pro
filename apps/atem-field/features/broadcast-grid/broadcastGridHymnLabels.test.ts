// 찬송가 절·후렴 라벨 단위테스트 — 실행: npx tsx --test features/broadcast-grid/broadcastGridHymnLabels.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  findHymnRefrainSectionIds,
  normalizeHymnVerseLabel,
  resolveHymnVerseLabel,
} from './broadcastGridHymnLabels';
import type { Section } from '@/lib/types';

function section(id: string, label: string, text = '', verseSlot?: string): Section {
  return {
    id, label, text,
    elements: verseSlot
      ? [{ type: 'text', fieldRole: 'verseLabel', content: verseSlot, visible: true }]
      : [],
  } as unknown as Section;
}

test('절 표기와 후렴을 읽는다', () => {
  assert.equal(normalizeHymnVerseLabel('후렴'), '후렴');
  assert.equal(normalizeHymnVerseLabel('3절'), '3절');
  assert.equal(normalizeHymnVerseLabel('3 절'), '3절');
  assert.equal(normalizeHymnVerseLabel('1'), '1절');
});

test('절로 볼 수 없는 라벨은 null 이다', () => {
  assert.equal(normalizeHymnVerseLabel(''), null);
  assert.equal(normalizeHymnVerseLabel('357장 · 주 믿는 사람 일어나'), null);
  assert.equal(normalizeHymnVerseLabel('123'), null);
});

test('verseLabel 슬롯이 있으면 그 값을 우선한다', () => {
  assert.equal(resolveHymnVerseLabel(section('s', '7', '', '후렴')), '후렴');
  assert.equal(resolveHymnVerseLabel(section('s', '3절')), '3절');
});

// 357장 — 절마다 같은 후렴이 붙는 실제 구조
const hymn357 = [
  section('a0', '357장 · 주 믿는 사람 일어나', '주 믿는 사람 일어나'),
  section('a1', '1절', '저 앞에 오는 적군을'),
  section('a2', '1절', '믿음이 이기네'),
  section('a3', '2절', '온 인류 마귀 궤휼로'),
  section('a4', '2절', '참 믿고 의지 하면서'),
  section('a5', '2절', '믿음이 이기네'),
  section('a6', '3절', '끝까지 이긴 자에게'),
  section('a7', '3절', '이 어둔 세상 지나서'),
  section('a8', '3절', '믿음이 이기네'),
].map((s) => ({ itemId: 'hymn-357', section: s }));

test('모든 절에 되풀이되는 가사를 후렴으로 잡는다', () => {
  const refrains = findHymnRefrainSectionIds(hymn357);
  assert.deepEqual([...refrains].sort(), ['a2', 'a5', 'a8']);
});

test('1절과 4절 가사가 같은 곡을 후렴으로 오인하지 않는다', () => {
  // 354장 구조 — 진짜 후렴은 모든 절에 나오는 '주 앙모 하는 자'
  const hymn354 = [
    section('b1', '1절', '올라가 올라가'),
    section('b2', '1절', '주 앙모 하는 자'),
    section('b3', '2절', '걸어가 걸어가'),
    section('b4', '2절', '주 앙모 하는 자'),
    section('b5', '3절', '달려가 달려가'),
    section('b6', '3절', '주 앙모 하는 자'),
    section('b7', '4절', '올라가 올라가'),
    section('b8', '4절', '주 앙모 하는 자'),
  ].map((s) => ({ itemId: 'hymn-354', section: s }));
  const refrains = findHymnRefrainSectionIds(hymn354);
  assert.deepEqual([...refrains].sort(), ['b2', 'b4', 'b6', 'b8']);
});

test('후렴이 없는 곡은 아무것도 잡지 않는다', () => {
  const plain = [
    section('c1', '1절', '가사 하나'),
    section('c2', '2절', '가사 둘'),
    section('c3', '3절', '가사 셋'),
  ].map((s) => ({ itemId: 'hymn-plain', section: s }));
  assert.equal(findHymnRefrainSectionIds(plain).size, 0);
});

test('절이 하나뿐이면 판정하지 않는다', () => {
  const single = [
    section('d1', '1절', '같은 가사'),
    section('d2', '1절', '같은 가사'),
  ].map((s) => ({ itemId: 'hymn-single', section: s }));
  assert.equal(findHymnRefrainSectionIds(single).size, 0);
});

test('프로그램이 섞여 있어도 곡마다 따로 판정한다', () => {
  const mixed = [
    ...hymn357,
    { itemId: 'other', section: section('z1', '1절', '믿음이 이기네') },
    { itemId: 'other', section: section('z2', '2절', '다른 가사') },
  ];
  const refrains = findHymnRefrainSectionIds(mixed);
  assert.equal(refrains.has('z1'), false);
  assert.deepEqual([...refrains].sort(), ['a2', 'a5', 'a8']);
});
