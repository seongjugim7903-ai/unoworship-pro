// 실시간 파이프라인 러너 — 마이크 → STT → Detector → 이벤트 (2단계)
//
// 실행: npm run listen
// 종료: Ctrl+C  → 지연·검출 요약을 출력한다 (PLAN 13절 채점 지표)
//
// 이 도구는 이벤트를 화면에 찍기만 한다. 컴포저 송출(3단계)은 2단계 수치 확인 후.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { Detector } from '../src/detect.js';
import { tryLoadBible } from '../src/bible/localBibleSource.js';
import { AppleSpeechSTT } from '../src/stt/appleSpeech.js';
import { BOOK_ALIASES } from '../src/parser/books.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

const expand = (p) => (p?.startsWith('~') ? path.join(os.homedir(), p.slice(1)) : p);

// ── 설정 ────────────────────────────────────────────────────────────────
const configPath = path.join(ROOT, 'config', 'church.json');
let config = {};
if (fs.existsSync(configPath)) {
  config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
} else {
  console.log('⚠️  config/church.json 이 없습니다. church.example.json 을 복사해 본문·인용목록을 넣으면');
  console.log('   "6절을 보세요" 같은 발화까지 해석합니다. 지금은 완전한 책·장·절만 감지합니다.\n');
}

const biblePath = expand(config.biblePath);
const bible = biblePath ? tryLoadBible(biblePath) : null;

const detector = new Detector({
  passage: config.service?.passage ?? null,
  quoteList: config.service?.quoteList ?? [],
  bibleSource: bible,
  repeatWindow: config.detector?.repeatWindow,
  staleSec: config.detector?.staleSec,
  search: config.detector?.search,
});

// 어휘 힌트 — 66권 이름을 주입해 STT 의 책이름 인식률을 올린다 (PLAN 12절 contextualStrings)
const hints = Object.values(BOOK_ALIASES).flat();

// ── 상태 ────────────────────────────────────────────────────────────────
let readyAt = 0;              // 'ready' 수신 벽시계
const detections = [];        // {display, action, sttMs, totalMs}
let lastFedText = '';

const fmt = (n) => `${Math.round(n)}ms`;

console.log('════════════════════════════════════════════════════════');
console.log('  우노워십 음성 감지 — 실시간 (2단계)');
console.log('════════════════════════════════════════════════════════');
console.log(`  성경 데이터   ${bible ? '✅ ' + biblePath : '❌ 미연결 (장 검색·절 수 검증 비활성)'}`);
console.log(`  본문          ${config.service?.passage ? `${config.service.passage.bookId} ${config.service.passage.chapter}장` : '미등록'}`);
console.log(`  인용 목록     ${config.service?.quoteList?.length ?? 0}건`);
console.log(`  어휘 힌트     ${hints.length}개`);
console.log('════════════════════════════════════════════════════════\n');

// 입력 장치 — --device 인자 > config.audio.device > 시스템 기본
//   유튜브 설교로 테스트할 땐 'BlackHole' (맥 재생 소리를 그대로 받음)
//   현장에서는 믹서(M32) 또는 'Blackmagic'(ATEM)
const deviceArg = process.argv.indexOf('--device');
const device = deviceArg > 0 ? process.argv[deviceArg + 1] : (config.audio?.device ?? null);
// 믹서 채널 선택 — 설교 마이크가 M32 CH3 이면 3. 없으면 장치 전체를 듣는다.
const chArg = process.argv.indexOf('--channel');
const channel = chArg > 0 ? Number(process.argv[chArg + 1]) : (config.audio?.channel ?? null);

const stt = new AppleSpeechSTT({ hints, device, channel });

stt.on('ready', (m) => {
  readyAt = Date.now();
  const chLabel = m.channel ? ` · CH${m.channel}` : '';
  console.log(`🎙  듣는 중 — ${m.locale} · ${m.onDevice ? '온디바이스' : '서버'} · ${m.sampleRate}Hz · 입력 ${m.device ?? '기본'}${chLabel}\n`);
});

stt.on('error', (m) => {
  console.error(`\n❌ ${m.message}\n`);
});

stt.on('result', (m) => {
  if (!m.text || m.text === lastFedText) return;
  lastFedText = m.text;

  const t0 = performance.now();
  const events = detector.feed(m.text, m.audioEnd);
  const detectMs = performance.now() - t0;

  const sttMs = (m.t - m.audioEnd) * 1000;
  const nodeElapsed = readyAt ? (Date.now() - readyAt) / 1000 : m.t;
  const totalMs = Math.max(0, (nodeElapsed - m.audioEnd) * 1000);

  for (const e of events) {
    if (e.action === 'ignore') continue;
    const mark = e.action === 'auto' ? '🔵 송출' : '🟡 보류';
    console.log(`${mark}  ${e.display}   conf ${e.confidence?.toFixed(2)} (${e.reason})`);
    console.log(`      원문 "${m.text}"`);
    console.log(`      지연 STT ${fmt(sttMs)} · 감지 ${detectMs.toFixed(2)}ms · 합계 ${fmt(totalMs)}\n`);
    detections.push({ display: e.display, action: e.action, sttMs, totalMs });
  }
});

// ── 종료 요약 ───────────────────────────────────────────────────────────
function summary() {
  console.log('\n════════════════════════════════════════════════════════');
  console.log('  요약');
  console.log('════════════════════════════════════════════════════════');
  if (detections.length === 0) {
    console.log('  감지 없음');
  } else {
    const auto = detections.filter((d) => d.action === 'auto').length;
    const totals = detections.map((d) => d.totalMs).sort((a, b) => a - b);
    const avg = totals.reduce((s, v) => s + v, 0) / totals.length;
    const p50 = totals[Math.floor(totals.length / 2)];
    console.log(`  감지        ${detections.length}건 (자동 ${auto} · 보류 ${detections.length - auto})`);
    console.log(`  지연        평균 ${fmt(avg)} · 중앙값 ${fmt(p50)} · 최대 ${fmt(totals[totals.length - 1])}`);
    console.log(`  목표(≤600ms) ${avg <= 600 ? '✅ 달성' : '⚠️ 초과'}`);
  }
  console.log(`  로그        ${stt.outPath}`);
  console.log('════════════════════════════════════════════════════════');
}

process.on('SIGINT', () => { stt.stop(); summary(); process.exit(0); });
process.on('SIGTERM', () => { stt.stop(); process.exit(0); });

try {
  stt.start();
} catch (err) {
  console.error(`\n❌ ${err.message}\n`);
  process.exit(1);
}
