/**
 * electron/live/ffmpegRtmp.js
 * WebM-over-stdin → H.264 RTMP 송출 래퍼
 *
 * [FEATURE: YOUTUBE_LIVE / TWITCH_LIVE]
 *
 * 전환 배경 (2026-04-20):
 *   기존: avfoundation 으로 물리 모니터 캡처 → RTMP
 *   현재: 렌더러의 PGM MediaStream 을 MediaRecorder(webm) 로 인코딩 →
 *         IPC 로 chunk 받아 ffmpeg stdin 에 write → H.264/AAC/FLV 로 RTMP push
 *
 *   장점:
 *     - macOS 화면 녹화 권한 불필요 (렌더러 내부 스트림)
 *     - 모니터 하드웨어 독립 (키오스크 꺼져도 OK)
 *     - 다른 창 간섭 0
 *     - WebRTC 파이프라인과 동일한 경로 → 품질 일관성
 *
 * ffmpeg 명령:
 *   ffmpeg -f webm -i pipe:0 \
 *     -c:v libx264 -preset veryfast -tune zerolatency -b:v 4500k ... \
 *     -c:a aac -b:a 160k -ar 44100 \
 *     -f flv <rtmp_url>
 */

const { spawn, execFile } = require('child_process');
const { EventEmitter } = require('events');
const fs = require('fs');

// ── ffmpeg 바이너리 위치 후보 ──
const FFMPEG_CANDIDATES = [
  '/opt/homebrew/bin/ffmpeg',
  '/usr/local/bin/ffmpeg',
  '/usr/bin/ffmpeg',
];

function resolveFfmpegPath() {
  for (const p of FFMPEG_CANDIDATES) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

let runner = null;
const emitter = new EventEmitter();

/** ffmpeg 바이너리 확인. */
function checkFfmpeg() {
  return new Promise((resolve) => {
    const bin = resolveFfmpegPath();
    if (!bin) return resolve({ installed: false });
    execFile(bin, ['-version'], (err, stdout) => {
      if (err) return resolve({ installed: false });
      const firstLine = String(stdout).split('\n')[0];
      resolve({ installed: true, path: bin, version: firstLine });
    });
  });
}

/**
 * RTMP 송출 파이프 시작.
 *   stdin 으로 WebM chunk 가 들어올 준비 완료.
 *   호출자는 이후 pushChunk(buffer) 로 webm 데이터를 흘려보냄.
 *
 * @param {object} opts
 * @param {string} opts.streamUrl  'rtmp://live.twitch.tv/app'
 * @param {string} opts.streamKey
 * @param {number} [opts.bitrate=4500]  kbps
 * @returns {{pid: number, rtmpUrl: string}}
 */
function startStream(opts) {
  if (runner) throw new Error('이미 송출 중입니다.');
  const bin = resolveFfmpegPath();
  if (!bin) throw new Error('ffmpeg 을 찾을 수 없습니다. `brew install ffmpeg` 필요');

  const { streamUrl, streamKey, bitrate = 4500 } = opts;
  if (!streamUrl || !streamKey) throw new Error('streamUrl / streamKey 누락');

  const rtmpUrl = `${streamUrl.replace(/\/+$/, '')}/${streamKey}`;
  const maxrate = bitrate;
  const bufsize = bitrate * 2;

  const args = [
    '-hide_banner',
    '-loglevel', 'warning',
    // WebM 입력 (stdin)
    //   MediaRecorder 가 만든 fragmented WebM 스트림을 live 로 읽기 위해:
    //     -fflags +nobuffer +genpts  : 버퍼링 최소화, PTS 재생성
    //     -use_wallclock_as_timestamps 1 : stdin 타임스탬프 대신 벽시계 기준 → 타이밍 안정
    //   ※ '-re' 는 파일용 플래그 (소스 레이트로 읽기 제한) — 라이브 stdin 에서는
    //     MediaRecorder 의 낮은 bitrate 에 출력이 끌려가 YouTube "낮은 비트레이트"
    //     경고 발생. 제거.
    '-fflags', '+nobuffer+genpts+discardcorrupt',
    '-use_wallclock_as_timestamps', '1',
    '-thread_queue_size', '1024',
    '-f', 'webm',
    '-i', 'pipe:0',
    // 비디오: H.264 재인코드
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-tune', 'zerolatency',
    '-profile:v', 'main',
    '-level', '4.1',
    '-b:v', `${bitrate}k`,
    '-minrate', `${Math.floor(bitrate * 0.6)}k`, // YouTube "저 비트레이트" 경고 방지
    '-maxrate', `${maxrate}k`,
    '-bufsize', `${bufsize}k`,
    '-pix_fmt', 'yuv420p',
    '-g', '60',                 // 2초 keyframe @ 30fps
    '-keyint_min', '60',
    '-sc_threshold', '0',       // scene change 에 의한 가변 keyframe 억제 (YouTube 선호)
    // 오디오: AAC
    '-c:a', 'aac',
    '-b:a', '160k',
    '-ar', '44100',
    '-ac', '2',
    // FLV 컨테이너 → RTMP
    '-f', 'flv',
    rtmpUrl,
  ];

  const proc = spawn(bin, args, { stdio: ['pipe', 'pipe', 'pipe'] });

  runner = {
    proc,
    pid: proc.pid,
    startedAt: Date.now(),
    rtmpUrl,
    lastStats: {},
    logs: [],
    chunksReceived: 0,
    bytesReceived: 0,
  };

  proc.stderr.on('data', (buf) => {
    const text = buf.toString();
    runner.logs.push(text);
    if (runner.logs.length > 200) runner.logs.shift();
    const m = text.match(/frame=\s*(\d+)\s+fps=\s*([\d.]+).+bitrate=\s*([\d.]+)kbits\/s/);
    if (m) {
      const stats = {
        frame: parseInt(m[1], 10),
        fps: parseFloat(m[2]),
        bitrate: parseFloat(m[3]),
      };
      runner.lastStats = stats;
      emitter.emit('stats', stats);
    }
    emitter.emit('log', text);
  });

  proc.stdin.on('error', (err) => {
    // EPIPE 은 ffmpeg 가 종료한 뒤 write 시도했을 때 나옴 → 정상 처리
    if (err.code !== 'EPIPE') emitter.emit('error', err);
  });

  proc.on('close', (code, signal) => {
    const wasRunner = runner;
    runner = null;
    emitter.emit('stopped', { code, signal, rtmpUrl: wasRunner?.rtmpUrl });
  });

  proc.on('error', (err) => emitter.emit('error', err));

  emitter.emit('started', { pid: proc.pid, rtmpUrl });
  return { pid: proc.pid, rtmpUrl };
}

/**
 * 렌더러에서 받은 WebM 청크를 ffmpeg stdin 에 흘려보낸다.
 * @param {Buffer|Uint8Array} chunk
 */
function pushChunk(chunk) {
  if (!runner || !runner.proc.stdin.writable) return false;
  try {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    const ok = runner.proc.stdin.write(buf);
    runner.chunksReceived++;
    runner.bytesReceived += buf.length;
    return ok;
  } catch {
    return false;
  }
}

function stopStream() {
  if (!runner) return { running: false };
  try {
    // stdin 닫기 → ffmpeg 가 EOF 로 정상 종료 시작
    try { runner.proc.stdin.end(); } catch { /* ignore */ }
    // 백업: 3초 뒤에도 살아있으면 SIGINT
    setTimeout(() => {
      if (runner) {
        try { runner.proc.kill('SIGINT'); } catch { /* ignore */ }
      }
    }, 3000);
    setTimeout(() => {
      if (runner) {
        try { runner.proc.kill('SIGKILL'); } catch { /* ignore */ }
      }
    }, 6000);
    return { running: false };
  } catch (err) {
    return { running: false, error: String(err) };
  }
}

function getStatus() {
  if (!runner) return { running: false };
  return {
    running: true,
    pid: runner.pid,
    startedAt: runner.startedAt,
    rtmpUrl: runner.rtmpUrl,
    stats: runner.lastStats,
    chunksReceived: runner.chunksReceived,
    bytesReceived: runner.bytesReceived,
  };
}

module.exports = {
  checkFfmpeg,
  startStream,
  pushChunk,
  stopStream,
  getStatus,
  events: emitter,
};
