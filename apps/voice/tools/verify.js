/**
 * tools/verify.js
 *
 * 전체 검증을 한 번에 실행한다.
 *   1) 단위 테스트 4종
 *   2) 실제 설교 3편 채점
 *
 * 사용:  npm run verify
 * 설치 직후 이 명령만 통과하면 로직 계층은 정상이다.
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const line = '═'.repeat(64);

function sh(args) {
  try {
    return execFileSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8' });
  } catch (e) {
    return (e.stdout || '') + (e.stderr || '');
  }
}

console.log(`\n${line}\n  우노워십 음성 감지 — 전체 검증\n${line}`);

// ── 1. 단위 테스트 ──
const tests = fs.readdirSync(path.join(ROOT, 'tests'))
  .filter((f) => f.endsWith('.test.mjs')).sort();

let pass = 0, fail = 0;
console.log('\n[ 단위 테스트 ]');
for (const t of tests) {
  const out = sh([path.join('tests', t)]);
  const p = (out.match(/✅/g) || []).length;
  const f = (out.match(/❌/g) || []).length;
  pass += p; fail += f;
  const mark = f === 0 ? '✅' : '❌';
  console.log(`  ${mark} ${t.replace('.test.mjs', '').padEnd(16)} 통과 ${p}  실패 ${f}`);
  if (f) console.log(out.split('\n').filter((l) => l.includes('❌') || l.trim().startsWith('실제')).join('\n'));
}

// ── 2. 설교 채점 ──
const dates = fs.readdirSync(path.join(ROOT, 'tests/fixtures'))
  .filter((f) => f.endsWith('.jsonl')).map((f) => f.replace('.jsonl', '')).sort();

let totHit = 0, totExp = 0, totFp = 0;
console.log('\n[ 실제 설교 채점 ]');
for (const d of dates) {
  const out = sh([path.join('tools', 'score.js'), d]);
  const m = out.match(/검출률\s+(\d+)\/(\d+)/);
  const fp = out.match(/오검출\s+(\d+)건/);
  if (!m) { console.log(`  ⚠️  ${d}  채점 실패`); continue; }
  const [, hit, exp] = m;
  const falsePos = fp ? +fp[1] : 0;
  totHit += +hit; totExp += +exp; totFp += falsePos;
  const mark = +hit === +exp && falsePos === 0 ? '✅' : '❌';
  console.log(`  ${mark} ${d}   검출 ${hit}/${exp}   오검출 ${falsePos}건`);
}

// ── 결과 ──
console.log(`\n${line}`);
console.log(`  단위 테스트   ${pass}개 통과 / ${fail}개 실패`);
console.log(`  설교 검출     ${totHit}/${totExp}`);
console.log(`  오검출        ${totFp}건   ${totFp === 0 ? '(목표 달성)' : '← 0이어야 함'}`);
const ok = fail === 0 && totFp === 0 && totHit === totExp;
console.log(`\n  ${ok ? '✅ 전체 통과' : '❌ 확인 필요'}`);
console.log(line + '\n');
process.exit(ok ? 0 : 1);
