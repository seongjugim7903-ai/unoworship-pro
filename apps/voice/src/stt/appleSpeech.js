// Apple Speech(온디바이스) STT 어댑터 — .app 을 띄우고 인식 결과를 스트림으로 되돌려준다.
//
// 왜 `open` 으로 띄우고 파일로 받는가:
//   macOS TCC 는 셸에서 직접 spawn 한 프로세스의 음성인식 접근을 부모 프로세스에 귀속시켜
//   거부한다(SIGABRT: "without a usage description"). LaunchServices(`open`)로 띄우면
//   앱 자신이 책임 프로세스가 되어 정상 동작하지만, 그때는 stdout 이 연결되지 않는다.
//   그래서 결과를 JSONL 파일로 흘리고 여기서 증분 읽기로 따라간다.
//   (이 파일은 PLAN 11절 블랙박스 로그도 겸한다)

import { EventEmitter } from 'node:events';
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP_PATH = path.resolve(HERE, '../../stt/UnoWorshipVoice.app');
const EXEC_MATCH = 'UnoWorshipVoice.app/Contents/MacOS/unoworship-stt';

/**
 * @fires ready   {locale, onDevice, sampleRate, hints}
 * @fires result  {type:'partial'|'final', t, audioEnd, text}
 * @fires error   {message}
 */
export class AppleSpeechSTT extends EventEmitter {
  /**
   * @param {object} opts
   *   hints    어휘 힌트(66권 책이름 등). 인식률을 올린다.
   *   locale   기본 ko-KR
   *   device   입력 장치 이름 일부 (예: 'BlackHole', 'M32'). 지정하면 이 앱만 그 장치를 듣는다
   *            — 운영 중인 맥의 시스템 기본 입력은 건드리지 않는다.
   *   outPath  결과 JSONL 경로 (없으면 임시 파일)
   */
  constructor(opts = {}) {
    super();
    this.locale = opts.locale ?? 'ko-KR';
    this.hints = opts.hints ?? [];
    this.device = opts.device ?? null;
    this.outPath = opts.outPath ?? path.join(os.tmpdir(), `unoworship-stt-${Date.now()}.jsonl`);
    this.hintsPath = `${this.outPath}.hints`;
    this.pos = 0;
    this.buf = '';
    this.watcher = null;
    this.poll = null;
  }

  static appExists() {
    return fs.existsSync(APP_PATH);
  }

  /** 이전 인스턴스 정리 — open 은 이미 떠 있으면 새로 띄우지 않는다 */
  static killExisting() {
    try { execFileSync('pkill', ['-f', EXEC_MATCH]); } catch { /* 없으면 무시 */ }
  }

  start() {
    if (!AppleSpeechSTT.appExists()) {
      throw new Error(`STT 앱이 없습니다. 먼저 빌드하세요: apps/voice/stt/build.sh\n  (기대 경로 ${APP_PATH})`);
    }
    AppleSpeechSTT.killExisting();

    fs.writeFileSync(this.hintsPath, this.hints.join('\n'), 'utf8');
    fs.writeFileSync(this.outPath, '', 'utf8');

    const args = [APP_PATH, '--args', '--locale', this.locale, '--out', this.outPath];
    if (this.hints.length) args.push('--hints', this.hintsPath);
    if (this.device) args.push('--device', this.device);
    spawn('open', args, { stdio: 'ignore', detached: true }).unref();

    this._follow();
  }

  /** 파일 증분 읽기 — fs.watch(FSEvents)로 즉시, 폴링은 놓친 변경 대비 보조 */
  _follow() {
    const drain = () => {
      let fd;
      try { fd = fs.openSync(this.outPath, 'r'); } catch { return; }
      try {
        const stat = fs.fstatSync(fd);
        if (stat.size <= this.pos) return;
        const len = stat.size - this.pos;
        const buffer = Buffer.alloc(len);
        fs.readSync(fd, buffer, 0, len, this.pos);
        this.pos = stat.size;
        this.buf += buffer.toString('utf8');
        const lines = this.buf.split('\n');
        this.buf = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.trim()) continue;
          let msg;
          try { msg = JSON.parse(line); } catch { continue; }
          if (msg.type === 'ready') this.emit('ready', msg);
          else if (msg.type === 'error') this.emit('error', msg);
          else this.emit('result', msg);
        }
      } finally {
        fs.closeSync(fd);
      }
    };

    try {
      this.watcher = fs.watch(this.outPath, drain);
    } catch { /* watch 실패 시 폴링만으로 동작 */ }
    this.poll = setInterval(drain, 40);
    drain();
  }

  stop() {
    if (this.watcher) { this.watcher.close(); this.watcher = null; }
    if (this.poll) { clearInterval(this.poll); this.poll = null; }
    AppleSpeechSTT.killExisting();
  }
}
