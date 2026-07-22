import { spawn, execFile, type ChildProcessWithoutNullStreams } from 'child_process';
import fs from 'fs';

type FfmpegStatus = {
  installed: boolean;
  path?: string;
  version?: string;
};

type LiveStartOptions = {
  streamUrl: string;
  streamKey: string;
  bitrate?: number;
};

type LiveRunner = {
  proc: ChildProcessWithoutNullStreams;
  pid: number | undefined;
  startedAt: number;
  rtmpUrl: string;
  logs: string[];
  lastStats: Record<string, number>;
  chunksReceived: number;
  bytesReceived: number;
};

const FFMPEG_CANDIDATES = [
  '/opt/homebrew/bin/ffmpeg',
  '/usr/local/bin/ffmpeg',
  '/usr/bin/ffmpeg',
  'ffmpeg',
];

let runner: LiveRunner | null = null;
const DEFAULT_LIVE_VIDEO_BITRATE_KBPS = 8500;

function resolveFfmpegPath(): string | null {
  for (const candidate of FFMPEG_CANDIDATES) {
    if (candidate === 'ffmpeg') return candidate;
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

export function checkServerLiveFfmpeg(): Promise<FfmpegStatus> {
  return new Promise((resolve) => {
    const bin = resolveFfmpegPath();
    if (!bin) {
      resolve({ installed: false });
      return;
    }

    execFile(bin, ['-version'], (err, stdout) => {
      if (err) {
        resolve({ installed: false });
        return;
      }

      resolve({
        installed: true,
        path: bin,
        version: String(stdout).split('\n')[0],
      });
    });
  });
}

export function startServerLiveStream(opts: LiveStartOptions) {
  if (runner) {
    return { ok: false, error: '이미 서버 라이브 송출이 실행 중입니다.' };
  }

  const bin = resolveFfmpegPath();
  if (!bin) {
    return { ok: false, error: '맥미니 서버에서 ffmpeg를 찾을 수 없습니다. brew install ffmpeg 후 다시 시도해 주세요.' };
  }

  const { streamUrl, streamKey, bitrate = DEFAULT_LIVE_VIDEO_BITRATE_KBPS } = opts;
  if (!streamUrl || !streamKey) {
    return { ok: false, error: 'streamUrl / streamKey 누락' };
  }

  const rtmpUrl = `${streamUrl.replace(/\/+$/, '')}/${streamKey}`;
  const minrate = Math.floor(bitrate * 0.85);
  const maxrate = bitrate;
  const bufsize = bitrate * 2;

  const args = [
    '-hide_banner',
    '-loglevel', 'info',
    '-stats',
    '-fflags', '+nobuffer+genpts+discardcorrupt',
    '-use_wallclock_as_timestamps', '1',
    '-thread_queue_size', '1024',
    '-f', 'webm',
    '-i', 'pipe:0',
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-tune', 'zerolatency',
    '-profile:v', 'main',
    '-level', '4.1',
    '-b:v', `${bitrate}k`,
    '-minrate', `${minrate}k`,
    '-maxrate', `${maxrate}k`,
    '-bufsize', `${bufsize}k`,
    '-pix_fmt', 'yuv420p',
    '-g', '60',
    '-keyint_min', '60',
    '-sc_threshold', '0',
    '-c:a', 'aac',
    '-b:a', '160k',
    '-ar', '44100',
    '-ac', '2',
    '-f', 'flv',
    rtmpUrl,
  ];

  const proc = spawn(bin, args, { stdio: ['pipe', 'pipe', 'pipe'] }) as ChildProcessWithoutNullStreams;

  runner = {
    proc,
    pid: proc.pid,
    startedAt: Date.now(),
    rtmpUrl,
    logs: [],
    lastStats: {},
    chunksReceived: 0,
    bytesReceived: 0,
  };

  proc.stderr.on('data', (buf) => {
    if (!runner) return;
    const text = buf.toString();
    runner.logs.push(text);
    if (runner.logs.length > 200) runner.logs.shift();

    const m = text.match(/frame=\s*(\d+)\s+fps=\s*([\d.]+).+bitrate=\s*([\d.]+)kbits\/s/);
    if (m) {
      runner.lastStats = {
        frame: Number.parseInt(m[1], 10),
        fps: Number.parseFloat(m[2]),
        bitrate: Number.parseFloat(m[3]),
      };
    }
  });

  proc.stdin.on('error', () => {
    // ffmpeg 종료 후 남은 chunk write에서 EPIPE가 날 수 있어 상태 조회로 처리한다.
  });

  proc.on('close', () => {
    runner = null;
  });

  proc.on('error', (err) => {
    if (runner) {
      runner.logs.push(String(err));
    }
  });

  return { ok: true, pid: proc.pid, rtmpUrl };
}

export function pushServerLiveChunk(chunk: Buffer | Uint8Array) {
  if (!runner || !runner.proc.stdin.writable) {
    return { ok: false, error: '서버 라이브 송출 프로세스가 실행 중이 아닙니다.' };
  }

  try {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    const acceptedImmediately = runner.proc.stdin.write(buf);
    runner.chunksReceived += 1;
    runner.bytesReceived += buf.length;
    return { ok: true, backpressure: !acceptedImmediately };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

export function stopServerLiveStream() {
  if (!runner) return { running: false };

  try {
    try { runner.proc.stdin.end(); } catch { /* ignore */ }
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

export function getServerLiveStatus() {
  if (!runner) return { running: false };

  return {
    running: true,
    pid: runner.pid,
    startedAt: runner.startedAt,
    rtmpUrl: runner.rtmpUrl,
    stats: runner.lastStats,
    chunksReceived: runner.chunksReceived,
    bytesReceived: runner.bytesReceived,
    logs: runner.logs.slice(-20),
  };
}
