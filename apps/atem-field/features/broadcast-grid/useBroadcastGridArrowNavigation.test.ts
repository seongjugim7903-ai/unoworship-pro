// 송출그리드 방향키 좌표 이동 단위테스트 — 실행: npx tsx --test features/broadcast-grid/useBroadcastGridArrowNavigation.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveBroadcastGridArrowTarget } from './useBroadcastGridArrowNavigation';

test('좌우는 같은 행에서 이동하고 행 끝에서 순번으로 넘어가지 않는다', () => {
  assert.equal(resolveBroadcastGridArrowTarget(1, 10, 3, 'ArrowRight'), 2);
  assert.equal(resolveBroadcastGridArrowTarget(2, 10, 3, 'ArrowRight'), null);
  assert.equal(resolveBroadcastGridArrowTarget(3, 10, 3, 'ArrowLeft'), null);
});

test('상하는 같은 열을 유지하며 열 수만큼 이동한다', () => {
  assert.equal(resolveBroadcastGridArrowTarget(1, 10, 3, 'ArrowDown'), 4);
  assert.equal(resolveBroadcastGridArrowTarget(7, 10, 3, 'ArrowUp'), 4);
  assert.equal(resolveBroadcastGridArrowTarget(8, 10, 3, 'ArrowDown'), null);
});

test('현재 선택이 없으면 첫 섹션을 예비 선택한다', () => {
  assert.equal(resolveBroadcastGridArrowTarget(-1, 10, 6, 'ArrowRight'), 0);
});
