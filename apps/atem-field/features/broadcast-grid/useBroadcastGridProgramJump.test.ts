// 송출그리드 Tab 프로그램 점프 단위테스트 — 실행: npx tsx --test features/broadcast-grid/useBroadcastGridProgramJump.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveBroadcastGridProgramJump } from './useBroadcastGridProgramJump';

const entries = [
  { itemId: 'program-a' },
  { itemId: 'program-a' },
  { itemId: 'program-b' },
  { itemId: 'program-b' },
  { itemId: 'program-c' },
];

test('Tab은 현재 프로그램을 건너뛰고 다음 프로그램 첫 섹션으로 이동한다', () => {
  assert.equal(resolveBroadcastGridProgramJump(entries, 0, 'next'), 2);
  assert.equal(resolveBroadcastGridProgramJump(entries, 3, 'next'), 4);
  assert.equal(resolveBroadcastGridProgramJump(entries, 4, 'next'), null);
});

test('Shift+Tab은 이전 프로그램 첫 섹션으로 이동한다', () => {
  assert.equal(resolveBroadcastGridProgramJump(entries, 3, 'previous'), 0);
  assert.equal(resolveBroadcastGridProgramJump(entries, 4, 'previous'), 2);
  assert.equal(resolveBroadcastGridProgramJump(entries, 0, 'previous'), null);
});

test('현재 선택이 없으면 Tab은 첫 프로그램, Shift+Tab은 마지막 프로그램으로 이동한다', () => {
  assert.equal(resolveBroadcastGridProgramJump(entries, -1, 'next'), 0);
  assert.equal(resolveBroadcastGridProgramJump(entries, -1, 'previous'), 4);
});
