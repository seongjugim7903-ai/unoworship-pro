// 프로그램 배경 합성 테스트 — 실행: npx tsx --test lib/programBackground.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTextElement, createImageElement } from '@/lib/canvasTypes';
import type { CanvasElement } from '@/lib/canvasTypes';
import type { Section, SetlistItem, Setlist } from '@/lib/types';
import { DEFAULT_MOTION } from '@/lib/canvasTypes';
import { getSectionOutputElements } from '@/lib/fixedLayers';
import {
  applyBackgroundMotionOnce,
  createProgramBackgroundSection,
  getContentSections,
} from '@/lib/programBackground';

function mkSection(id: string, elements: CanvasElement[] = []): Section {
  return { id, label: id, text: '', colorMark: '#ffffff', elements };
}
function mkItem(id: string, sections: Section[]): SetlistItem {
  return { id, title: id, sections };
}
function mkSetlist(items: SetlistItem[]): Setlist {
  return { id: 'sl', name: 'test', date: '2026-07-03', items, createdAt: 0 };
}

test('배경 섹션 요소가 콘텐츠 뒤(배열 맨 앞=아래층)로 합성된다', () => {
  const bgSec = createProgramBackgroundSection('item1');
  bgSec.elements = [createImageElement({ id: 'bg', src: 'data:image/png;base64,AAA' })];
  const contentSec = mkSection('s1', [createTextElement({ id: 'body', content: '본문' })]);
  const setlist = mkSetlist([mkItem('item1', [bgSec, contentSec])]);

  const out = getSectionOutputElements(setlist, contentSec);
  assert.equal(out[0].id, 'bg', '배경이 맨 앞(뒤 레이어)');
  assert.ok(out.some((e) => e.id === 'body'), '콘텐츠 포함');
});

test('배경 섹션 zIndex가 높아도 송출 합성에서는 콘텐츠보다 아래층으로 보정된다', () => {
  const bgSec = createProgramBackgroundSection('item1');
  bgSec.elements = [createImageElement({ id: 'bg', src: 'x', zIndex: 100 })];
  const contentSec = mkSection('s1', [createTextElement({ id: 'body', content: '본문', zIndex: 0 })]);
  const setlist = mkSetlist([mkItem('item1', [bgSec, contentSec])]);

  const out = getSectionOutputElements(setlist, contentSec);
  const bg = out.find((e) => e.id === 'bg');
  const body = out.find((e) => e.id === 'body');
  assert.ok(bg && body, '배경과 콘텐츠가 모두 합성됨');
  assert.ok(bg.zIndex < body.zIndex, '배경 zIndex가 콘텐츠보다 낮게 보정됨');
});

test('배경 섹션 없는 프로그램은 그대로(no-op)', () => {
  const contentSec = mkSection('s1', [createTextElement({ id: 'body' })]);
  const setlist = mkSetlist([mkItem('item1', [contentSec])]);
  assert.deepEqual(getSectionOutputElements(setlist, contentSec).map((e) => e.id), ['body']);
});

test('배경 섹션 자체를 부르면 자기 요소만(무한중첩 방지)', () => {
  const bgSec = createProgramBackgroundSection('item1');
  bgSec.elements = [createImageElement({ id: 'bg', src: 'x' })];
  const setlist = mkSetlist([mkItem('item1', [bgSec])]);
  assert.deepEqual(getSectionOutputElements(setlist, bgSec).map((e) => e.id), ['bg']);
});

test('getContentSections 는 배경 섹션 제외', () => {
  const item = mkItem('item1', [createProgramBackgroundSection('item1'), mkSection('s1')]);
  assert.deepEqual(getContentSections(item).map((s) => s.id), ['s1']);
});

// ── applyBackgroundMotionOnce: 배경 모션 첫 섹션만 재생 ─────────────────────
function mkBgMotionSetup() {
  const bgSec = createProgramBackgroundSection('item1');
  bgSec.elements = [{ ...createImageElement({ id: 'bg', src: 'x' }), motion: { ...DEFAULT_MOTION } }];
  const s1 = mkSection('s1', [{ ...createTextElement({ id: 'body1' }), motion: { ...DEFAULT_MOTION } }]);
  const s2 = mkSection('s2', [createTextElement({ id: 'body2' })]);
  const item = mkItem('item1', [bgSec, s1, s2]);
  const setlist = mkSetlist([item]);
  return { item, setlist, s1, s2 };
}

test('플래그 off 면 배경 모션 그대로(no-op)', () => {
  const { item, setlist, s2 } = mkBgMotionSetup();
  const out = applyBackgroundMotionOnce(getSectionOutputElements(setlist, s2), item, s2.id);
  assert.ok(out.find((e) => e.id === 'bg')?.motion, '배경 모션 유지');
});

test('플래그 on + 첫 콘텐츠 섹션 → 배경 모션 유지', () => {
  const { item, setlist, s1 } = mkBgMotionSetup();
  item.backgroundMotionOnce = true;
  const out = applyBackgroundMotionOnce(getSectionOutputElements(setlist, s1), item, s1.id);
  assert.ok(out.find((e) => e.id === 'bg')?.motion, '첫 섹션은 배경 모션 재생');
});

test('플래그 on + 첫 섹션 아님 → 배경 모션만 제거(전경 모션 유지)', () => {
  const { item, setlist, s2 } = mkBgMotionSetup();
  item.backgroundMotionOnce = true;
  const out = applyBackgroundMotionOnce(getSectionOutputElements(setlist, s2), item, s2.id);
  assert.equal(out.find((e) => e.id === 'bg')?.motion, undefined, '배경 모션 제거');
  // s2 의 전경 요소(body2)는 애초에 모션 없음 — s1 의 전경 모션이 영향받지 않음을 별도 확인
  const outS1 = applyBackgroundMotionOnce(getSectionOutputElements(setlist, item.sections[1]), item, 's1');
  assert.ok(outS1.find((e) => e.id === 'body1')?.motion, '전경(첫섹션) 모션은 유지');
});
