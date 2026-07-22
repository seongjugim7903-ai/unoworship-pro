// createOutputFrameCacheKey 정확성 테스트 — 실행: npx tsx --test lib/outputFrameCacheKey.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTextElement, createImageElement } from '@/lib/canvasTypes';
import { createOutputFrameCacheKey } from '@/lib/outputFrameTransport';

const bigDataUrl = (head: string, tail: string, midLen: number): string =>
  `data:image/png;base64,${head}${'A'.repeat(midLen)}${tail}`;

test('동일 요소 → 동일 키', () => {
  const els = [createTextElement({ id: 't', content: '요 3:16' })];
  assert.equal(createOutputFrameCacheKey('s1', els, ''), createOutputFrameCacheKey('s1', els, ''));
});

test('텍스트 내용 바뀌면 키 달라짐', () => {
  const a = createOutputFrameCacheKey('s1', [createTextElement({ id: 't', content: 'A' })], '');
  const b = createOutputFrameCacheKey('s1', [createTextElement({ id: 't', content: 'B' })], '');
  assert.notEqual(a, b);
});

test('sectionText 바뀌면 키 달라짐', () => {
  const els = [createTextElement({ id: 't', linked: true, content: '' })];
  assert.notEqual(createOutputFrameCacheKey('s1', els, 'X'), createOutputFrameCacheKey('s1', els, 'Y'));
});

test('요소 위치/크기 바뀌면 키 달라짐', () => {
  const a = createOutputFrameCacheKey('s1', [createTextElement({ id: 't', x: 10 })], '');
  const b = createOutputFrameCacheKey('s1', [createTextElement({ id: 't', x: 20 })], '');
  assert.notEqual(a, b);
});

test('이미지 src 바뀌면 키 달라짐(대용량 data URL)', () => {
  const a = createOutputFrameCacheKey('s1', [createImageElement({ id: 'i', src: bigDataUrl('H1', 'T1', 5000) })], '');
  const b = createOutputFrameCacheKey('s1', [createImageElement({ id: 'i', src: bigDataUrl('H2', 'T2', 5000) })], '');
  assert.notEqual(a, b);
});

test('같은 이미지 → 같은 키(지문 안정)', () => {
  const src = bigDataUrl('HEAD', 'TAIL', 200000);
  const a = createOutputFrameCacheKey('s1', [createImageElement({ id: 'i', src })], '');
  const b = createOutputFrameCacheKey('s1', [createImageElement({ id: 'i', src })], '');
  assert.equal(a, b);
});

test('길이 같고 앞뒤 다른 대용량 이미지 → 키 다름', () => {
  const a = createOutputFrameCacheKey('s1', [createImageElement({ id: 'i', src: bigDataUrl('AAAA', 'ZZZZ', 200000) })], '');
  const b = createOutputFrameCacheKey('s1', [createImageElement({ id: 'i', src: bigDataUrl('BBBB', 'YYYY', 200000) })], '');
  assert.notEqual(a, b);
});

test('성능: 2.6MB급 base64도 즉시 처리(무거운 JSON.stringify 없음)', () => {
  const src = bigDataUrl('H', 'T', 3_400_000);
  const el = createImageElement({ id: 'i', src });
  const t0 = process.hrtime.bigint();
  createOutputFrameCacheKey('s1', [el], '');
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  assert.ok(ms < 15, `키 생성 ${ms.toFixed(1)}ms — 15ms 미만이어야 함`);
});
