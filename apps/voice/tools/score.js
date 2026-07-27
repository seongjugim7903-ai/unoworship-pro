/**
 * tools/score.js
 *
 * 1단계 오프라인 검증기.
 *   전사본(JSONL) → Detector → 정답지 대조 → 채점 리포트
 *
 * 사용:  node tools/score.js [--verbose]
 *
 * 지표
 *   검출률   정답 대비 잡아낸 비율
 *   오검출   구절이 아닌데 송출한 건수  ← 최우선 (0건 목표)
 *   문맥해결  "6절에" 같은 번호만 발화를 문맥으로 복원한 건수
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Detector, formatRef } from '../src/detect.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERBOSE = process.argv.includes('--verbose');
const DATE = process.argv.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a)) || '2026-07-26';

const lines = fs
  .readFileSync(path.join(ROOT, `tests/fixtures/${DATE}.jsonl`), 'utf8')
  .trim().split('\n').map((l) => JSON.parse(l));
const truth = JSON.parse(
  fs.readFileSync(path.join(ROOT, `tests/fixtures/${DATE}.truth.json`), 'utf8'),
);

/** "jhn 13:31-38" → 비교용 정규 문자열 */
function canon(s) {
  const m = s.match(/^(\S+)\s+(\d+)(?::(.+))?$/);
  if (!m) return s;
  const [, book, ch, vs] = m;
  if (!vs) return `${book} ${ch}`;
  const list = [];
  for (const part of vs.split(',')) {
    const r = part.match(/^(\d+)-(\d+)$/);
    if (r) for (let i = +r[1]; i <= +r[2]; i++) list.push(i);
    else list.push(+part);
  }
  return `${book} ${ch}:${[...new Set(list)].sort((a, b) => a - b).join(',')}`;
}

function canonRef(ref) {
  if (!ref) return '';
  if (!ref.verses || !ref.verses.length) return `${ref.bookId} ${ref.chapter}`;
  return `${ref.bookId} ${ref.chapter}:${[...new Set(ref.verses)].sort((a, b) => a - b).join(',')}`;
}

// ── 실행 ──────────────────────────────────────────────
const det = new Detector({ passage: truth.passage, quoteList: truth.quoteList });
const emitted = [];   // action !== ignore
const all = [];

for (const line of lines) {
  const evs = det.feed(line.text, line.t);
  for (const e of evs) {
    all.push(e);
    if (e.action !== 'ignore') emitted.push(e);
  }
}

// ── 채점 ──────────────────────────────────────────────
/**
 * 판정 기준: "그 시점에 화면에 그 구절이 떠 있었는가"
 *
 * "새로 송출했는가"로 세면, 이미 같은 구절이 떠 있어 중복을 억제한 경우가
 * 실패로 잡힌다. 운영상 중요한 것은 회중이 볼 수 있었는지이므로
 * 직전까지 유지되던 송출 상태를 기준으로 판정한다.
 */
function displayedAt(t) {
  let cur = null;
  for (const e of emitted) {
    if (e.at <= t + 8) cur = e;
    else break;
  }
  return cur;
}

const hits = [], misses = [];
const usedIdx = new Set();

for (const exp of truth.expect) {
  const want = canon(exp.ref);
  const idx = emitted.findIndex(
    (e, i) => !usedIdx.has(i) && Math.abs(e.at - exp.t) <= 8 && canonRef(e.ref) === want,
  );
  if (idx >= 0) { usedIdx.add(idx); hits.push({ exp, ev: emitted[idx] }); continue; }

  // 새 송출은 없었지만 같은 구절이 이미 떠 있던 경우 → 충족
  const shown = displayedAt(exp.t);
  if (shown && canonRef(shown.ref) === want) {
    hits.push({ exp, ev: shown, standing: true });
    continue;
  }
  misses.push({ exp, got: shown ? canonRef(shown.ref) : null });
}

const mustNot = new Set(truth.mustNotDetect);
const falsePos = emitted.filter((e) => mustNot.has(e.at));
const extra = emitted.filter((_, i) => !usedIdx.has(i) && !mustNot.has(emitted[i].at));

const ctxResolved = emitted.filter((e) => e.resolvedBy && e.resolvedBy !== 'explicit');

// ── 출력 ──────────────────────────────────────────────
const pct = (a, b) => (b ? ((a / b) * 100).toFixed(0) : '0');
const line = '─'.repeat(64);

console.log('\n' + line);
console.log('  우노워십 음성 감지 — 1단계 오프라인 검증');
console.log(`  픽스처: ${truth.date}  ·  발화 ${lines.length}건`);
console.log(line);

console.log(`\n  검출률       ${hits.length}/${truth.expect.length}   (${pct(hits.length, truth.expect.length)}%)`);
console.log(`  오검출       ${falsePos.length}건   ${falsePos.length === 0 ? '✅ 목표 달성' : '❌ 0건이어야 함'}`);
console.log(`  문맥 해결    ${ctxResolved.length}건   ("6절에" 같은 번호만 발화)`);
console.log(`  총 송출      ${emitted.length}건  (auto ${emitted.filter(e=>e.action==='auto').length} / hold ${emitted.filter(e=>e.action==='hold').length})`);

if (misses.length) {
  console.log(`\n  ▸ 놓친 구절 ${misses.length}건`);
  for (const m of misses) {
    const mm = String(Math.floor(m.exp.t / 60)).padStart(2, ' ');
    const ss = String(m.exp.t % 60).padStart(2, '0');
    console.log(`     ${mm}:${ss}  기대 ${m.exp.ref.padEnd(14)} ${m.got ? `실제 ${m.got}` : '(미검출)'}  [${m.exp.kind}]`);
  }
}

if (falsePos.length) {
  console.log(`\n  ▸ 오검출 ${falsePos.length}건  ← 반드시 0이어야 함`);
  for (const f of falsePos) {
    console.log(`     ${f.at}s  ${f.display}  ← "${f.raw.slice(0, 46)}…"`);
  }
}

if (extra.length) {
  console.log(`\n  ▸ 정답지에 없는 추가 검출 ${extra.length}건 (검토 필요)`);
  for (const x of extra.slice(0, 10)) {
    console.log(`     ${x.at}s  ${x.display}  [${x.reason}]  ← "${x.raw.slice(0, 40)}…"`);
  }
}

if (VERBOSE) {
  console.log(`\n${line}\n  전체 송출 로그\n${line}`);
  for (const e of emitted) {
    const mm = String(Math.floor(e.at / 60)).padStart(2, ' ');
    const ss = String(e.at % 60).padStart(2, '0');
    console.log(`  ${mm}:${ss}  ${e.action.toUpperCase().padEnd(5)} ${e.display.padEnd(16)} conf ${e.confidence}  ${e.resolvedBy}`);
  }
}

console.log('\n' + line);
const pass = falsePos.length === 0 && hits.length / truth.expect.length >= 0.95;
console.log(pass ? '  판정: 통과 — 2단계(실시간) 진행 가능' : '  판정: 미달 — 조정 필요');
console.log(line + '\n');
