/**
 * 한글 수사 + STT 띄어쓰기 오인식 복구 검증.
 *
 * 2026-07-28 Apple Speech 실측에서 드러난 문제:
 *   정답 롬 5:8  →  STT "그래서 로마 스 오장 팔 절에는…"  →  미검출
 * 유튜브 자동자막(픽스처)은 장·절을 숫자로 쓰지만, Apple 온디바이스는 한글 수사로 쓴다.
 *
 * 되살릴 때 반드시 함께 지켜야 하는 것 — 원래 미지원이었던 이유(일상어 충돌):
 *   "대제사장" → 4장 · "성경 구절" → 9절
 * 그래서 변환은 "책 이름 뒤 구간"으로만 제한한다. 아래 두 묶음을 같이 검사한다.
 */

import assert from 'node:assert';
import { parseSpoken, sinoToNumber } from '../src/parser/spokenAdapter.js';

function run(name, fn) {
  try { fn(); console.log(`  ✅ ${name}`); }
  catch (e) { console.log(`  ❌ ${name}\n     ${e.message}`); process.exitCode = 1; }
}

const first = (t) => parseSpoken(t)[0] ?? null;

console.log('\n한글 수사 · 띄어쓰기 복구 검증');

run('수사 변환: 한 자리 ~ 세 자리', () => {
  assert.strictEqual(sinoToNumber('오'), 5);
  assert.strictEqual(sinoToNumber('십삼'), 13);
  assert.strictEqual(sinoToNumber('삼십육'), 36);
  assert.strictEqual(sinoToNumber('백오십'), 150);
  assert.strictEqual(sinoToNumber('백칠십육'), 176); // 시편 119:176
  assert.ok(Number.isNaN(sinoToNumber('사랑')));
});

run('책 이름 뒤 한글 수사를 숫자로 읽는다', () => {
  const r = first('로마서 오장 팔절');
  assert.ok(r, '파싱 결과가 있어야 함');
  assert.strictEqual(r.bookId, 'rom');
  assert.strictEqual(r.chapter, 5);
  assert.deepStrictEqual(r.verses, [8]);
});

run('실측 발화: "로마 스 오장 팔 절에는" (띄어쓰기 오인식 + 한글 수사)', () => {
  const r = first('그래서 로마 스 오장 팔 절에는 우리가 아직 죄인 되었을 때');
  assert.ok(r, '파싱 결과가 있어야 함');
  assert.strictEqual(r.bookId, 'rom', `로마서여야 함, 실제 ${r.bookId}`);
  assert.strictEqual(r.chapter, 5);
  assert.deepStrictEqual(r.verses, [8]);
});

run('띄어쓰기 오인식이 다른 책으로 새지 않는다 (로마 스 → 에스라 금지)', () => {
  const r = first('로마 스 5장 8절');
  assert.ok(r);
  assert.strictEqual(r.bookId, 'rom', `에스라(ezr)로 새면 안 됨, 실제 ${r.bookId}`);
});

run('두 자리 수사 + 시편 "편" 표기', () => {
  const a = first('요한복음 십삼장 삼십일절');
  assert.strictEqual(a.bookId, 'jhn');
  assert.strictEqual(a.chapter, 13);
  assert.deepStrictEqual(a.verses, [31]);

  const b = first('시편 백십구편 백칠십육절');
  assert.strictEqual(b.bookId, 'psa');
  assert.strictEqual(b.chapter, 119);
  assert.deepStrictEqual(b.verses, [176]);
});

run('숫자 표기는 기존대로 동작한다 (회귀)', () => {
  const r = first('로마서 5장 8절을 보시겠습니다');
  assert.strictEqual(r.bookId, 'rom');
  assert.strictEqual(r.chapter, 5);
  assert.deepStrictEqual(r.verses, [8]);
});

run('책 이름 없는 한글 수사는 무시한다 (일상어 오검출 방지)', () => {
  // 원래 한글 수사를 막았던 실제 사례들 — 되살아나면 안 된다
  for (const t of [
    '대제사장이 말씀하시기를',      // 사(4)+장
    '성경 구절을 찾아보면',         // 구(9)+절
    '우리 회사 사장님이 오셨어요',   // 사장 + 님
    '영화 한 편 보고 왔습니다',
  ]) {
    assert.strictEqual(parseSpoken(t).length, 0, `"${t}" 는 잡히면 안 됨`);
  }
});
