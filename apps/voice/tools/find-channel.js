// 채널 찾기 — 믹서를 꽂고 "목사님 마이크가 몇 번인지" 눈으로 찾는 도구
//
// 실행: npm run find-channel -- --device M32
//       (장치 이름 일부만 맞으면 됩니다. 생략하면 시스템 기본 입력)
//
// 마이크에 대고 말하면 그 채널의 막대만 움직입니다. 그 번호를 config/church.json 의
// audio.channel 에 넣으면 됩니다. 전문 지식 없이 눈으로 찾으라고 만든 도구입니다.

import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(HERE, '../stt/UnoWorshipVoice.app');
const EXEC_MATCH = 'UnoWorshipVoice.app/Contents/MacOS/unoworship-stt';

const argIdx = process.argv.indexOf('--device');
const device = argIdx > 0 ? process.argv[argIdx + 1] : null;

if (!fs.existsSync(APP)) {
  console.error('STT 앱이 없습니다. 먼저 빌드하세요:  npm run build:stt');
  process.exit(1);
}

const outPath = path.join(os.tmpdir(), `unoworship-meter-${Date.now()}.jsonl`);
fs.writeFileSync(outPath, '');

try { execFileSync('pkill', ['-f', EXEC_MATCH]); } catch { /* 없으면 무시 */ }

const args = [APP, '--args', '--meter', '--out', outPath];
if (device) args.push('--device', device);
spawn('open', args, { stdio: 'ignore', detached: true }).unref();

console.log('\n════════════════════════════════════════════════════════');
console.log('  채널 찾기 — 마이크에 대고 말해 보세요');
console.log('════════════════════════════════════════════════════════');
console.log(`  장치: ${device ?? '시스템 기본 입력'}`);
console.log('  움직이는 막대가 그 마이크의 채널입니다. 종료는 Ctrl+C\n');

const BARS = ' ▁▂▃▄▅▆▇█';
const bar = (v) => BARS[Math.min(BARS.length - 1, Math.round(Math.sqrt(v) * (BARS.length - 1)))];

let pos = 0;
let buf = '';
let channels = 0;
const peak = [];        // 채널별 최대치 (누적) — 어디가 울렸는지 남는다
let printed = false;

function render(levels) {
  levels.forEach((v, i) => { peak[i] = Math.max(peak[i] ?? 0, v); });
  const lines = levels.map((v, i) => {
    const n = String(i + 1).padStart(2);
    const live = bar(v).repeat(1) + ''.padEnd(0);
    const meter = Array.from({ length: 24 }, (_, k) => (v * 24 > k ? '█' : '·')).join('');
    const mark = peak[i] > 0.05 ? ` ← 소리 감지 (최대 ${peak[i].toFixed(2)})` : '';
    return `  ${n}  ${meter}${mark}`;
  });
  if (printed) process.stdout.write(`\x1b[${levels.length + 1}A`);
  printed = true;
  console.log(lines.join('\n'));
}

function drain() {
  let fd;
  try { fd = fs.openSync(outPath, 'r'); } catch { return; }
  try {
    const st = fs.fstatSync(fd);
    if (st.size <= pos) return;
    const len = st.size - pos;
    const b = Buffer.alloc(len);
    fs.readSync(fd, b, 0, len, pos);
    pos = st.size;
    buf += b.toString('utf8');
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.trim()) continue;
      let m;
      try { m = JSON.parse(line); } catch { continue; }
      if (m.type === 'ready') {
        channels = m.channels;
        console.log(`  ✅ 연결됨 — ${m.channels}채널 · ${m.sampleRate}Hz\n`);
      } else if (m.type === 'error') {
        console.error(`  ❌ ${m.message}`);
        process.exit(1);
      } else if (m.type === 'levels') {
        render(m.ch);
      }
    }
  } finally { fs.closeSync(fd); }
}

setInterval(drain, 100);

process.on('SIGINT', () => {
  try { execFileSync('pkill', ['-f', EXEC_MATCH]); } catch { /* 무시 */ }
  const best = peak.map((v, i) => ({ ch: i + 1, v })).sort((a, b) => b.v - a.v).slice(0, 3);
  console.log('\n\n════════════════════════════════════════════════════════');
  console.log('  가장 크게 울린 채널');
  for (const b of best) if (b.v > 0.02) console.log(`    ${String(b.ch).padStart(2)}번  최대 ${b.v.toFixed(3)}`);
  console.log('\n  이 번호를 config/church.json 의 audio.channel 에 넣으세요.');
  console.log('════════════════════════════════════════════════════════');
  process.exit(0);
});
