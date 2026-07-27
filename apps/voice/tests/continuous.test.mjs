/**
 * 연속 인식 검증.
 * 송출 후 곧바로 다음 발화를 받을 준비가 되는지(대기 상태로 막히지 않는지) 확인한다.
 */
import assert from 'node:assert';
import { Detector } from '../src/detect.js';

function run(name, fn) {
  try { fn(); console.log(`  ✅ ${name}`); }
  catch (e) { console.log(`  ❌ ${name}\n     ${e.message}`); process.exitCode = 1; }
}
const mk = () => new Detector({ passage: { bookId: 'jhn', chapter: 13, verses: [31,32,33,34,35,36,37,38] } });
const fired = (evs) => evs.filter((e) => e.action !== 'ignore');

console.log('\n연속 인식 검증');

run('송출 직후 다른 구절을 3초 뒤에 받는다', () => {
  const d = mk();
  const a = fired(d.feed('누가복음 24장 26절을 보십시오', 100));
  const b = fired(d.feed('히브리서 1장 3절에는 이렇게 말씀합니다', 103));
  assert.strictEqual(a.length, 1, '첫 구절 송출');
  assert.strictEqual(b.length, 1, '둘째 구절도 즉시 송출');
  assert.strictEqual(b[0].display, '히브리서 1:3');
});

run('1초 간격 연속 3건도 모두 받는다', () => {
  const d = mk();
  const r1 = fired(d.feed('로마서 5장 8절', 200));
  const r2 = fired(d.feed('요한일서 4장 7절', 201));
  const r3 = fired(d.feed('마태복음 16장 24절', 202));
  assert.ok(r1.length && r2.length && r3.length, '세 건 모두 송출되어야 함');
  assert.deepStrictEqual(
    [r1[0].display, r2[0].display, r3[0].display],
    ['로마서 5:8', '요한일서 4:7', '마태복음 16:24'],
  );
});

run('중복 억제는 "같은 구절"에만 걸린다', () => {
  const d = mk();
  const a = fired(d.feed('로마서 5장 8절을 보십시오', 300));
  const same = fired(d.feed('로마서 5장 8절', 305));      // 같은 구절 → 억제
  const other = fired(d.feed('로마서 5장 6절', 306));     // 다른 절 → 통과
  assert.strictEqual(a.length, 1);
  assert.strictEqual(same.length, 0, '같은 구절은 억제');
  assert.strictEqual(other.length, 1, '다른 구절은 즉시 통과');
});

run('억제 창이 지나면 같은 구절도 다시 받는다', () => {
  const d = mk();
  fired(d.feed('로마서 5장 8절을 보십시오', 400));
  const later = fired(d.feed('로마서 5장 8절을 다시 보십시오', 500));
  assert.strictEqual(later.length, 1, '20초 창 이후에는 재송출');
});

run('자기정정도 대기 없이 즉시 반영된다', () => {
  const d = mk();
  const evs = fired(d.feed('요한복음 아 고린도서 13장을 보십시오', 600));
  assert.strictEqual(evs.length, 1);
  assert.ok(evs[0].display.startsWith('고린도전서'), `실제: ${evs[0].display}`);
});

console.log('');
