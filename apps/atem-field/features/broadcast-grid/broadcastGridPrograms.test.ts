// 송출그리드 프로그램 목록 묶기 단위테스트 — 실행: npx tsx --test features/broadcast-grid/broadcastGridPrograms.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBroadcastGridPrograms, findProgramIndexBySectionId, moveItemToId } from './broadcastGridPrograms';

type Entry = Parameters<typeof buildBroadcastGridPrograms>[0][number];

function entry(index: number, itemId: string, itemTitle: string): Entry {
  return { index, itemId, itemTitle, section: { id: `s${index}` } as Entry['section'] };
}

const entries = [
  entry(0, 'program-a', '찬송가 317장'),
  entry(1, 'program-a', '찬송가 317장'),
  entry(2, 'program-b', '말씀찾기(인용)'),
  entry(3, 'program-c', '설교대지'),
  entry(4, 'program-c', '설교대지'),
  entry(5, 'program-c', '설교대지'),
];

test('itemId 연속 구간을 한 프로그램으로 묶고 첫 섹션 인덱스를 남긴다', () => {
  const programs = buildBroadcastGridPrograms(entries);
  assert.equal(programs.length, 3);
  assert.deepEqual(
    programs.map((p) => [p.title, p.firstIndex, p.sectionCount]),
    [['찬송가 317장', 0, 2], ['말씀찾기(인용)', 2, 1], ['설교대지', 3, 3]],
  );
});

test('같은 itemId가 떨어져서 두 번 나오면 각각 별개 프로그램이다', () => {
  const programs = buildBroadcastGridPrograms([
    entry(0, 'program-a', '찬양'),
    entry(1, 'program-b', '광고'),
    entry(2, 'program-a', '찬양'),
  ]);
  assert.equal(programs.length, 3);
  assert.deepEqual(programs.map((p) => p.firstIndex), [0, 1, 2]);
});

test('빈 세트리스트는 빈 목록을 낸다', () => {
  assert.deepEqual(buildBroadcastGridPrograms([]), []);
});

test('섹션 id로 그 섹션이 속한 프로그램을 찾는다', () => {
  const programs = buildBroadcastGridPrograms(entries);
  assert.equal(findProgramIndexBySectionId(programs, 's4'), 2);
  assert.equal(findProgramIndexBySectionId(programs, 's0'), 0);
  assert.equal(findProgramIndexBySectionId(programs, null), -1);
  assert.equal(findProgramIndexBySectionId(programs, '없는-섹션'), -1);
});

test('대상 프로그램 자리로 옮긴다 (컴포즈 드래그와 같은 계산)', () => {
  const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  assert.deepEqual(moveItemToId(items, 'a', 'b')?.map((i) => i.id), ['b', 'a', 'c']);
  assert.deepEqual(moveItemToId(items, 'c', 'a')?.map((i) => i.id), ['c', 'a', 'b']);
  assert.deepEqual(moveItemToId(items, 'a', 'c')?.map((i) => i.id), ['b', 'c', 'a']);
});

test('그리드에 안 보이는 항목이 사이에 껴 있어도 보이는 순서는 뒤집힌다', () => {
  const items = [{ id: 'a' }, { id: 'hidden' }, { id: 'b' }];
  const moved = moveItemToId(items, 'a', 'b')!;
  const visible = moved.filter((i) => i.id !== 'hidden').map((i) => i.id);
  assert.deepEqual(visible, ['b', 'a']);
});

test('없는 id나 같은 id면 null 이라 아무 일도 하지 않는다', () => {
  const items = [{ id: 'a' }, { id: 'b' }];
  assert.equal(moveItemToId(items, 'a', 'a'), null);
  assert.equal(moveItemToId(items, 'a', '없음'), null);
  assert.equal(moveItemToId(items, '없음', 'b'), null);
});
