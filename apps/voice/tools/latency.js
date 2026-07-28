// 지연 실측 — "발화 종료 → 이벤트 발행" (PLAN 13절 채점 지표)
//
// 실행: npm run latency
//
// 유튜브 설교로는 목사님이 "13절"을 언제 다 말했는지 알 수 없어 지연을 잴 수 없다.
// 그래서 macOS `say` 로 **끝나는 시각을 아는 발화**를 만들어 스피커(BlackHole)로 흘리고,
// say 프로세스가 끝난 순간부터 감지 이벤트가 뜰 때까지를 잰다.
//
// 전제: 시스템 사운드 출력이 BlackHole 이어야 한다(STT 입력과 같은 장치).

import { spawn } from 'node:child_process';
import { Detector } from '../src/detect.js';
import { tryLoadBible } from '../src/bible/localBibleSource.js';
import { AppleSpeechSTT } from '../src/stt/appleSpeech.js';
import { BOOK_ALIASES } from '../src/parser/books.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const expand = (p) => (p?.startsWith('~') ? path.join(os.homedir(), p.slice(1)) : p);

const configPath = path.join(ROOT, 'config', 'church.json');
const config = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, 'utf8')) : {};
const bible = config.biblePath ? tryLoadBible(expand(config.biblePath)) : null;

// 측정 문장 — 실제 설교 어투. 마지막이 구절 번호로 끝나야 "발화 종료" 시점이 명확하다.
const PHRASES = [
  { say: '마태복음 이십육장 십삼절',   expect: 'mat 26:13' },
  { say: '히브리서 구장 십이절',       expect: 'heb 9:12' },
  { say: '빌립보서 이장 오절',         expect: 'php 2:5' },
  { say: '야고보서 이장 이십육절',      expect: 'jas 2:26' },
  { say: '요한일서 삼장 십사절',       expect: '1jn 3:14' },
];

const detector = new Detector({
  passage: config.service?.passage ?? null,
  quoteList: config.service?.quoteList ?? [],
  bibleSource: bible,
});

const hints = Object.values(BOOK_ALIASES).flat();
const stt = new AppleSpeechSTT({ hints, device: 'BlackHole' });

let spokenAt = 0;        // say 종료 시각
let pending = null;      // 현재 측정 중인 문장
const results = [];
let lastText = '';

stt.on('error', (m) => console.error(`  ❌ ${m.message}`));

stt.on('result', (m) => {
  if (!m.text || m.text === lastText) return;
  lastText = m.text;
  const events = detector.feed(m.text, m.audioEnd).filter((e) => e.action !== 'ignore');
  if (!pending || !events.length) return;

  for (const e of events) {
    const got = `${e.ref.bookId} ${e.ref.chapter}:${e.ref.verses.join(',')}`;
    if (got !== pending.expect) continue;
    const ms = Date.now() - spokenAt;
    console.log(`  ✅ ${pending.say.padEnd(20)} → ${e.display.padEnd(16)} ${String(ms).padStart(5)}ms  [${e.action}]`);
    results.push({ ...pending, ms, action: e.action });
    pending = null;
    return;
  }
});

/** 한 문장을 말하고, 끝난 시각부터 감지까지 기다린다 */
function speak(phrase) {
  return new Promise((resolve) => {
    pending = phrase;
    const proc = spawn('say', ['-r', '180', phrase.say]);
    proc.on('exit', () => {
      spokenAt = Date.now();              // 소리가 끝난 시각 = 측정 기준
      setTimeout(() => {                   // 감지 여유 3초
        if (pending) {
          console.log(`  ❌ ${phrase.say.padEnd(20)} → 미검출`);
          results.push({ ...phrase, ms: null });
          pending = null;
        }
        resolve();
      }, 3000);
    });
  });
}

console.log('════════════════════════════════════════════════════════');
console.log('  지연 실측 — 발화 종료 → 이벤트 발행');
console.log('════════════════════════════════════════════════════════');
console.log('  ※ 시스템 사운드 출력이 BlackHole 이어야 합니다.\n');

stt.on('ready', async (m) => {
  console.log(`🎙  ${m.locale} · ${m.onDevice ? '온디바이스' : '서버'} · 입력 ${m.device}\n`);
  await new Promise((r) => setTimeout(r, 1500));   // 엔진 안정화

  for (const p of PHRASES) await speak(p);

  const ok = results.filter((r) => r.ms != null).map((r) => r.ms).sort((a, b) => a - b);
  console.log('\n════════════════════════════════════════════════════════');
  console.log(`  검출        ${ok.length}/${results.length}`);
  if (ok.length) {
    const avg = ok.reduce((s, v) => s + v, 0) / ok.length;
    console.log(`  지연        평균 ${Math.round(avg)}ms · 중앙값 ${ok[Math.floor(ok.length / 2)]}ms · 최대 ${ok[ok.length - 1]}ms`);
    console.log(`  목표 600ms  ${avg <= 600 ? '✅ 달성' : '⚠️ 초과'}`);
  }
  console.log('════════════════════════════════════════════════════════');
  stt.stop();
  process.exit(0);
});

process.on('SIGINT', () => { stt.stop(); process.exit(0); });
stt.start();
