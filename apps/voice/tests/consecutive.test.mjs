/**
 * 연속 인용 대비 검증.
 *
 * 송출 해제는 고려하지 않는다. 다음 구절이 오면 화면은 그대로 교체된다.
 * 관심사는 오직 "연달아 오는 인용을 빠짐없이, 정확히 잡는가"이다.
 *
 * 실측 최단 간격: 2026-07-19  45:37 "14절" → 45:41 "15절"  (4초)
 */
import assert from 'node:assert';
import { Detector } from '../src/detect.js';

function run(name, fn) {
  try { fn(); console.log(`  ✅ ${name}`); }
  catch (e) { console.log(`  ❌ ${name}\n     ${e.message}`); process.exitCode = 1; }
}
const mk = () => new Detector({
  passage: { bookId: 'jhn', chapter: 10, verses: [7,8,9,10,11,12,13,14,15,16,17,18] },
});
const fired = (evs) => evs.filter((e) => e.action !== 'ignore');
const shown = (evs) => fired(evs).map((e) => e.display);

console.log('\n연속 인용 검증');

run('실측 재현: 14절 → 15절 (4초 간격)', () => {
  const d = mk();
  const a = shown(d.feed('여러분 14절을 보실까요? 나는 선한 목자라', 2737));
  const b = shown(d.feed('나는 내 양을 알고 양도 나를 아는 것이 15절', 2741));
  assert.deepStrictEqual(a, ['요한복음 10:14']);
  assert.deepStrictEqual(b, ['요한복음 10:15']);
});

run('내려읽기: 7·8·9·10절을 2초 간격으로', () => {
  const d = mk();
  const got = [];
  [7, 8, 9, 10].forEach((v, i) => {
    got.push(...shown(d.feed(`${v}절을 보십시오`, 100 + i * 2)));
  });
  assert.deepStrictEqual(got, [
    '요한복음 10:7', '요한복음 10:8', '요한복음 10:9', '요한복음 10:10',
  ]);
});

run('한 발화에 두 책이 나오면 둘 다 잡는다', () => {
  const d = mk();
  const got = shown(d.feed('로마서 5장 8절과 요한일서 4장 7절을 보십시오', 300));
  assert.deepStrictEqual(got, ['로마서 5:8', '요한일서 4:7']);
});

run('범위 표현은 펼친다: 7절에서 10절까지', () => {
  const d = mk();
  const evs = fired(d.feed('요한복음 10장 7절에서 10절까지 보겠습니다', 400));
  assert.strictEqual(evs.length, 1);
  assert.deepStrictEqual(evs[0].ref.verses, [7, 8, 9, 10]);
});

run('나열 표현은 펼치지 않는다: 31절, 32절', () => {
  const d = mk();
  const evs = fired(d.feed('로마서 5장 31절, 32절 말씀입니다', 500));
  assert.strictEqual(evs.length, 1);
  assert.deepStrictEqual(evs[0].ref.verses, [31, 32]);
});

run('떨어진 두 절 나열은 사이를 채우지 않는다: 8절 그리고 15절', () => {
  const d = mk();
  const evs = fired(d.feed('로마서 5장 8절 그리고 15절을 보십시오', 600));
  assert.strictEqual(evs.length, 1);
  assert.deepStrictEqual(evs[0].ref.verses, [8, 15],
    `사이 절을 채우면 안 됨. 실제: ${evs[0].ref.verses}`);
});

run('타서 인용 후 본문 복귀가 연속으로 와도 따라온다', () => {
  const d = mk();
  const a = shown(d.feed('에베소서 5장 2절만 하나 보시죠', 700));
  const b = shown(d.feed('28절을 같이 보십시다', 760));
  assert.deepStrictEqual(a, ['에베소서 5:2']);
  assert.deepStrictEqual(b, ['요한복음 10:28'], '본문으로 복귀해야 함');
});

run('연속 10건을 1초 간격으로 흘려도 모두 잡는다', () => {
  const d = mk();
  let count = 0;
  for (let i = 0; i < 10; i++) {
    count += fired(d.feed(`${7 + i}절을 보십시오`, 900 + i)).length;
  }
  assert.strictEqual(count, 10, `10건 전부 송출되어야 함. 실제 ${count}`);
});

console.log('');
