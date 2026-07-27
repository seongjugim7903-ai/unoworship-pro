/**
 * 장 검색 모드 알고리즘 검증.
 *
 * 성경 본문은 교회가 로컬에 설치한 데이터에서 읽으므로 여기에 담지 않는다.
 * 대신 같은 구조(장 → 절 목록)의 합성 문장으로 대조 알고리즘만 확인한다.
 * 실제 데이터 연결은 local-bible.json 을 읽는 어댑터로 교체한다.
 */

import assert from 'node:assert';
import { Detector } from '../src/detect.js';
import { similarity } from '../src/search/chapterSearch.js';

// 합성 장 데이터 — 실제 성경 본문 아님
const FAKE = {
  jhn: {
    6: [
      { num: 1, text: '첫째 절은 무리가 큰 바다를 건너 따라왔다는 이야기입니다' },
      { num: 12, text: '남은 조각을 거두고 버리는 것이 없게 하라 하시니라' },
      { num: 35, text: '내가 곧 생명의 양식이니 내게 오는 자는 결코 주리지 아니할 것이요' },
      { num: 44, text: '나를 보내신 아버지께서 이끌지 아니하시면 아무도 내게 올 수 없으니' },
      { num: 68, text: '주여 영원한 생명의 말씀이 계시니 우리가 누구에게로 가오리이까' },
    ],
  },
};

const source = {
  getChapter: (bookId, chapter) => (FAKE[bookId] && FAKE[bookId][chapter]) || [],
};

function run(name, fn) {
  try { fn(); console.log(`  ✅ ${name}`); }
  catch (e) { console.log(`  ❌ ${name}\n     ${e.message}`); process.exitCode = 1; }
}

console.log('\n장 검색 모드 검증');

run('유사도: 같은 문장이 다른 절보다 높다', () => {
  const a = '내가 곧 생명의 양식이니 내게 오는 자는 주리지 아니하리라';
  const s35 = similarity(a, FAKE.jhn[6][2].text);
  const s44 = similarity(a, FAKE.jhn[6][3].text);
  assert.ok(s35 > s44, `35절(${s35.toFixed(2)}) > 44절(${s44.toFixed(2)}) 이어야 함`);
  assert.ok(s35 > 0.35, `임계 초과 필요, 실제 ${s35.toFixed(2)}`);
});

run('장 지목 후 낭독하면 해당 절을 찾는다', () => {
  const det = new Detector({
    passage: { bookId: 'jhn', chapter: 5, verses: [1, 2, 3] },
    bibleSource: source,
  });
  det.feed('요한복음 6장에 보면 이런 말씀 있습니다', 100);
  const evs = det.feed('내가 곧 생명의 양식이니 내게 오는 자는 결코 주리지 아니할 것이요', 104);
  const hit = evs.find((e) => e.reason === 'chapter-text-search');
  assert.ok(hit, '검색 결과가 나와야 함');
  assert.strictEqual(hit.ref.chapter, 6);
  assert.deepStrictEqual(hit.ref.verses, [35]);
});

run('의역해도 찾는다 (부분 인용)', () => {
  const det = new Detector({ passage: { bookId: 'jhn', chapter: 5, verses: [1] }, bibleSource: source });
  det.feed('요한복음 6장을 보십시오', 200);
  const evs = det.feed('남은 조각을 거두고 버리는 것이 없게 하라 하셨어요', 203);
  const hit = evs.find((e) => e.reason === 'chapter-text-search');
  assert.ok(hit, '부분 인용도 찾아야 함');
  assert.deepStrictEqual(hit.ref.verses, [12]);
});

run('무관한 말에는 반응하지 않는다', () => {
  const det = new Detector({ passage: { bookId: 'jhn', chapter: 5, verses: [1] }, bibleSource: source });
  det.feed('요한복음 6장에 보면', 300);
  const evs = det.feed('여러분 오늘 날씨가 참 덥습니다 에어컨을 켜야 되겠어요', 303);
  assert.ok(!evs.find((e) => e.reason === 'chapter-text-search'), '오검출이 없어야 함');
});

run('장 지목 후 시간이 지나면 해제된다', () => {
  const det = new Detector({ passage: { bookId: 'jhn', chapter: 5, verses: [1] }, bibleSource: source });
  det.feed('요한복음 6장에 보면', 400);
  const evs = det.feed('내가 곧 생명의 양식이니 내게 오는 자는 결코 주리지 아니할 것이요', 600);
  assert.ok(!evs.find((e) => e.reason === 'chapter-text-search'), '90초 넘으면 해제되어야 함');
});

console.log('');
