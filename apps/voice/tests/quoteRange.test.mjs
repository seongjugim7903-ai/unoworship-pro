/**
 * 본문 ↔ 인용구절 혼선 검증.
 *
 * 실제 제기된 상황:
 *   본문   요 2:2-25   (2~25절)
 *   인용   마 13:7-13  (7~13절)
 *   → 7~13절이 양쪽에 다 존재해 절 번호만으로는 구분 불가
 *
 * 해결: 인용구절이 절 범위까지 사전 등록되면 추정 없이 판별된다.
 *   - 범위 안이면 인용
 *   - 범위를 벗어나면 본문
 *   - "본문"이라고 말씀하시면 즉시 본문 (실제 설교 습관)
 */
import assert from 'node:assert';
import { Detector } from '../src/detect.js';

function run(name, fn) {
  try { fn(); console.log(`  ✅ ${name}`); }
  catch (e) { console.log(`  ❌ ${name}\n     ${e.message}`); process.exitCode = 1; }
}

const PASSAGE = { bookId: 'jhn', chapter: 2, verses: Array.from({ length: 24 }, (_, i) => i + 2) }; // 요 2:2-25
const QUOTES = [
  { bookId: 'mat', chapter: 13, verses: [7, 8, 9, 10, 11, 12, 13] },   // 마 13:7-13
];
const mk = () => new Detector({ passage: PASSAGE, quoteList: QUOTES });
const shown = (evs) => evs.filter((e) => e.action !== 'ignore').map((e) => e.display);

console.log('\n본문↔인용 혼선 검증  (본문 요 2:2-25 / 인용 마 13:7-13)');

run('인용 진입 후 "8절"은 인용으로 간다', () => {
  const d = mk();
  assert.deepStrictEqual(shown(d.feed('마태복음 13장 7절을 보십시오', 100)), ['마태복음 13:7']);
  assert.deepStrictEqual(shown(d.feed('8절은 또 이렇게 말하고 있습니다', 130)), ['마태복음 13:8']);
});

run('설교가 길어져도(5분 뒤) 인용 범위면 인용 유지', () => {
  const d = mk();
  d.feed('마태복음 13장 7절을 보십시오', 100);
  // 인접성·경과시간 추정만으로는 실패하는 구간 (300초 후, 7→12는 5 차이)
  assert.deepStrictEqual(shown(d.feed('12절을 보시면', 400)), ['마태복음 13:12']);
});

run('인용 범위를 벗어난 절은 본문으로 간다', () => {
  const d = mk();
  d.feed('마태복음 13장 7절을 보십시오', 100);
  assert.deepStrictEqual(shown(d.feed('20절을 보십시오', 160)), ['요한복음 2:20'],
    '20절은 인용(7-13) 밖, 본문(2-25) 안');
});

run('"본문"이라고 말씀하시면 즉시 본문 복귀', () => {
  const d = mk();
  d.feed('마태복음 13장 7절을 보십시오', 100);
  assert.deepStrictEqual(shown(d.feed('본문 8절을 다시 보시면', 160)), ['요한복음 2:8'],
    '겹치는 8절이라도 본문 명시가 우선');
});

run('본문 복귀 후에는 절 번호가 본문으로 해석된다', () => {
  const d = mk();
  d.feed('마태복음 13장 7절을 보십시오', 100);
  d.feed('본문 8절을 다시 보시면', 160);
  assert.deepStrictEqual(shown(d.feed('9절을 보십시오', 200)), ['요한복음 2:9'],
    '인용이 해제됐으므로 본문');
});

run('다른 인용으로 넘어가면 그쪽이 활성화된다', () => {
  const d = mk();
  d.feed('마태복음 13장 7절을 보십시오', 100);
  const other = new Detector({
    passage: PASSAGE,
    quoteList: [...QUOTES, { bookId: 'rom', chapter: 8, verses: [28, 29, 30] }],
  });
  other.feed('마태복음 13장 7절을 보십시오', 100);
  assert.deepStrictEqual(shown(other.feed('로마서 8장 28절을 보십시오', 200)), ['로마서 8:28']);
  assert.deepStrictEqual(shown(other.feed('29절도 보십시오', 230)), ['로마서 8:29'],
    '새 인용구절 범위로 따라가야 함');
});

console.log('');
