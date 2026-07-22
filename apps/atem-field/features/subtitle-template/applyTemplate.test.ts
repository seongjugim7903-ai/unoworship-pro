// applyTemplate 순수함수 단위테스트 — 실행: npx tsx --test features/subtitle-template/applyTemplate.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTextElement, createShapeElement } from '@/lib/canvasTypes';
import type { TextElement } from '@/lib/canvasTypes';
import { applyTemplate, splitBody } from './applyTemplate';
import { makeAdhocTemplate } from './model';

function tpl(elements: ReturnType<typeof createTextElement>[] | any[]) {
  return makeAdhocTemplate(elements, 'bible');
}
const asText = (e: any) => e as TextElement;

test('레거시 all-linked 템플릿: 본문은 정확히 1개 요소에만 들어간다(중복 없음)', () => {
  const a = createTextElement({ id: 'a', linked: true, content: '', width: 80, height: 20 });
  const b = createTextElement({ id: 'b', linked: true, content: '', width: 40, height: 10 });
  const c = createTextElement({ id: 'c', linked: true, content: '', width: 30, height: 8 });

  const [sec] = applyTemplate(
    tpl([a, b, c]),
    { fields: { body: '여호와는 나의 목자시니' } },
    { idPrefix: 's1', label: '시 23:1', colorMark: '#ffffff' },
  );

  const texts = sec.elements.filter((e) => e.type === 'text');
  const withBody = texts.filter((e) => asText(e).content === '여호와는 나의 목자시니');
  assert.equal(withBody.length, 1, '본문은 1개 요소에만');
  assert.ok(texts.every((e) => asText(e).linked === false), '모든 텍스트 de-link');
  assert.equal(sec.id, 's1');
  assert.equal(sec.text, '여호와는 나의 목자시니');
});

test('명시적 fieldRole: 역할별로 값이 바인딩된다', () => {
  const body = createTextElement({ id: 'body', fieldRole: 'body', linked: false, content: 'PLACEHOLDER' });
  const ref = createTextElement({ id: 'ref', fieldRole: 'reference', linked: false, content: 'X' });
  const logo = createTextElement({ id: 'logo', content: '교회로고' });

  const [sec] = applyTemplate(
    tpl([body, ref, logo]),
    { fields: { body: '하나님이 세상을', reference: '요 3:16' } },
    { idPrefix: 's2' },
  );

  const bodyEl = sec.elements.find((e) => asText(e).fieldRole === 'body');
  const refEl = sec.elements.find((e) => asText(e).fieldRole === 'reference');
  const logoEl = sec.elements.find((e) => e.type === 'text' && !asText(e).fieldRole);

  assert.equal(asText(bodyEl).content, '하나님이 세상을');
  assert.equal(asText(refEl).content, '요 3:16');
  assert.equal(asText(logoEl).content, '교회로고', '정적 텍스트는 그대로');
});

test('값 없는 슬롯은 숨겨진다(visible=false)', () => {
  const body = createTextElement({ id: 'body', fieldRole: 'body', linked: false, content: '' });
  const copy = createTextElement({ id: 'copy', fieldRole: 'copyright', content: '' });

  const [sec] = applyTemplate(
    tpl([body, copy]),
    { fields: { body: '본문만 있음' } }, // copyright 값 없음
    { idPrefix: 's3' },
  );

  const copyEl = sec.elements.find((e) => asText(e).fieldRole === 'copyright');
  assert.equal(asText(copyEl).visible, false, '값 없는 저작권 슬롯 숨김');
});

test('요소 id는 idPrefix 기준으로 결정적으로 생성된다', () => {
  const a = createTextElement({ id: 'a', linked: true, content: '' });
  const [sec] = applyTemplate(tpl([a]), { fields: { body: 'x' } }, { idPrefix: 'secX' });
  assert.ok(sec.elements.every((e) => e.id.startsWith('secX__')));
});

test('clipMaskId 상호참조는 새 id로 보정된다', () => {
  const mask = createShapeElement({ id: 'mask' });
  const clipped = createTextElement({ id: 'clipped', clipMaskId: 'mask', linked: true, content: '' });

  const [sec] = applyTemplate(tpl([mask, clipped]), { fields: { body: 'v' } }, { idPrefix: 's4' });
  const clonedMask = sec.elements.find((e) => e.type === 'shape')!;
  const clonedClipped = sec.elements.find((e) => e.type === 'text')!;
  assert.equal(clonedClipped.clipMaskId, clonedMask.id, 'clipMaskId 가 새 마스크 id 로 재매핑');
});

test('splitBody: 짧으면 그대로, 길면 단어 경계로 분할(단어 안 잘림)', () => {
  assert.deepEqual(splitBody('짧은 본문', 100), ['짧은 본문']);
  assert.deepEqual(splitBody('anything', 0), ['anything']);

  const parts = splitBody('가나다 라마바 사아자 차카타', 8);
  assert.ok(parts.length >= 2, '여러 조각으로 분할');
  assert.ok(parts.every((p) => p.length <= 8), '각 조각은 한도 이하');
  assert.equal(parts.join(' ').replace(/\s+/g, ' '), '가나다 라마바 사아자 차카타', '단어가 잘리지 않고 보존');
});

test('splitBody: 한 단어가 한도보다 길면 강제로 자른다', () => {
  const parts = splitBody('abcdefghij', 4);
  assert.ok(parts.every((p) => p.length <= 4));
  assert.equal(parts.join(''), 'abcdefghij');
});

test('자동 분할: 긴 본문이 여러 섹션으로, 장절은 각 슬라이드에 반복', () => {
  const body = createTextElement({ id: 'body', fieldRole: 'body' });
  const ref = createTextElement({ id: 'ref', fieldRole: 'reference' });
  const longText = '가나다 라마바 사아자 차카타 파하가 나다라';

  const secs = applyTemplate(
    tpl([body, ref]),
    { fields: { body: longText, reference: '시 119:1' } },
    { idPrefix: 's', label: '시 119:1', maxCharsPerSlide: 12 },
  );

  assert.ok(secs.length >= 2, '여러 섹션');
  for (const s of secs) {
    const b = asText(s.elements.find((e) => asText(e).fieldRole === 'body'));
    assert.ok(b.content.length <= 12, `본문 청크 ${b.content.length} <= 12`);
    const r = asText(s.elements.find((e) => asText(e).fieldRole === 'reference'));
    assert.equal(r.content, '시 119:1', '장절 반복');
  }
  assert.ok(secs[0].id.startsWith('s-s1'), '분할 id 규칙');
  assert.match(secs[0].label, /\(1\//, '라벨에 (1/N)');
});

test('자동 분할 끔(maxChars 0/미지정): 1개 섹션 유지', () => {
  const a = createTextElement({ id: 'a', linked: true, content: '' });
  const secs = applyTemplate(tpl([a]), { fields: { body: '아주 긴 본문이라도 분할 안 함' } }, { idPrefix: 's9' });
  assert.equal(secs.length, 1);
  assert.equal(secs[0].id, 's9');
});
