/**
 * 중복 송출 억제 검증.
 *
 * 2026-07-28 실측(2026-07-12 설교, 유튜브 재생)에서 확인된 문제:
 *   "마태복음 26 장 13 절"        → 🔵 송출 마26:13
 *   "…13 절에 보면 예수님께서…"    → 🔵 송출 마26:13   ← 낭독 대조가 같은 절을 또 보냄
 *
 * STT 부분결과가 자라날 때마다 파이프라인이 다시 도는데, 명시 송출 경로에는 중복 억제가
 * 있었지만 장 검색(낭독 대조) 경로에는 없어서 같은 자막이 반복 송출됐다.
 */

import assert from 'node:assert';
import { Detector } from '../src/detect.js';

// 합성 장 데이터 — 실제 성경 본문 아님 (tests/chapterSearch.test.mjs 와 같은 방식)
const FAKE = {
  mat: {
    26: [
      { num: 13, text: '내가 진실로 너희에게 이르노니 온 천하에 어디서든지 이 복음이 전파되는 곳에서는 이 여자가 행한 일도 말하여 그를 기억하리라' },
      { num: 20, text: '저물 때에 예수께서 열두 제자와 함께 앉으셨더니' },
    ],
  },
};
const source = { getChapter: (b, c) => (FAKE[b] && FAKE[b][c]) || [] };

function run(name, fn) {
  try { fn(); console.log(`  ✅ ${name}`); }
  catch (e) { console.log(`  ❌ ${name}\n     ${e.message}`); process.exitCode = 1; }
}

const mk = () => new Detector({
  passage: { bookId: 'jhn', chapter: 12, verses: [1, 2, 3, 4, 5, 6, 7, 8] },
  quoteList: [{ bookId: 'mat', chapter: 26, verses: [13] }],
  bibleSource: source,
});

console.log('\n중복 송출 억제 검증');

run('명시 송출 직후 낭독 대조가 같은 절을 다시 보내지 않는다', () => {
  const det = mk();
  let autos = 0;
  const seq = [
    [147.1, '극찬을 하셨습니다 마태복음 26 장'],
    [147.5, '극찬을 하셨습니다 마태복음 26 장 13 절'],
    // 부분결과가 자라며 낭독이 붙는다 → 장 검색이 같은 절을 찾아낸다
    [148.3, '마태복음 26 장 13 절에 보면 온 천하에 어디서든지 이 복음이 전파되는 곳에서는 이 여자가 행한 일도 말하여'],
  ];
  for (const [at, text] of seq) {
    autos += det.feed(text, at).filter((e) => e.action === 'auto').length;
  }
  assert.strictEqual(autos, 1, `자동 송출은 1회여야 함, 실제 ${autos}회`);
});

run('억제 창이 지나면 재송출된다 (의도된 재호출은 막지 않는다)', () => {
  const det = mk();
  det.feed('마태복음 26장 13절을 보시겠습니다', 100);
  // repeatWindow(기본 20초) 밖 — 다시 그 구절로 돌아온 경우
  const later = det.feed('아까 본 마태복음 26장 13절 다시 봅시다', 140)
    .filter((e) => e.action === 'auto');
  assert.ok(later.length >= 1, '창 밖에서는 다시 송출돼야 함');
});

run('다른 절은 억제하지 않는다', () => {
  const det = mk();
  const a = det.feed('마태복음 26장 13절을 보시겠습니다', 200).filter((e) => e.action === 'auto');
  const b = det.feed('마태복음 26장 20절을 보시겠습니다', 205).filter((e) => e.action === 'auto');
  assert.strictEqual(a.length, 1, '첫 절 송출');
  assert.strictEqual(b.length, 1, '다른 절은 그대로 송출');
});
