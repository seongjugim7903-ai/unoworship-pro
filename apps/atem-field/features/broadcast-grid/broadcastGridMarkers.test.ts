// 송출그리드 기억 마커 단위테스트 — 실행: npx tsx --test features/broadcast-grid/broadcastGridMarkers.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseMarkedSectionIds,
  serializeMarkedSectionIds,
  toggleMarkedSectionId,
} from './broadcastGridMarkers';

test('마커를 여러 개 켤 수 있다', () => {
  let marks = new Set<string>();
  marks = toggleMarkedSectionId(marks, 'a');
  marks = toggleMarkedSectionId(marks, 'b');
  marks = toggleMarkedSectionId(marks, 'c');
  assert.deepEqual([...marks], ['a', 'b', 'c']);
});

test('마커는 그 섹션을 다시 눌러야 꺼지고 다른 마커는 남는다', () => {
  const marks = toggleMarkedSectionId(new Set(['a', 'b', 'c']), 'b');
  assert.deepEqual([...marks], ['a', 'c']);
});

test('토글은 원본 집합을 건드리지 않는다', () => {
  const before = new Set(['a']);
  const after = toggleMarkedSectionId(before, 'b');
  assert.deepEqual([...before], ['a']);
  assert.deepEqual([...after], ['a', 'b']);
});

test('저장한 마커를 그대로 읽어 온다', () => {
  const marks = new Set(['a', 'b']);
  assert.deepEqual(parseMarkedSectionIds(serializeMarkedSectionIds(marks)), ['a', 'b']);
});

test('마커가 하나뿐이던 옛 저장값도 살려 읽는다', () => {
  assert.deepEqual(parseMarkedSectionIds('item-1-section-2'), ['item-1-section-2']);
  assert.deepEqual(parseMarkedSectionIds('"item-1-section-2"'), ['item-1-section-2']);
});

test('빈 값과 망가진 값은 빈 목록이 된다', () => {
  assert.deepEqual(parseMarkedSectionIds(null), []);
  assert.deepEqual(parseMarkedSectionIds(''), []);
  assert.deepEqual(parseMarkedSectionIds('[]'), []);
  assert.deepEqual(parseMarkedSectionIds('[1, null, "a", ""]'), ['a']);
});
