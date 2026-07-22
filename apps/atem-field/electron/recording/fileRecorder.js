/**
 * electron/recording/fileRecorder.js
 * Renderer MediaRecorder WebM chunks ->
 *   ~/Movies/UnoLive/Recordings/*.mp4|*.mov|*.webm
 *   ~/Movies/UnoLive/Markers/*.mp4|*.mov|*.webm
 *
 * MP4/MOV outputs are transcoded with ffmpeg to H.264/AAC so they can be
 * uploaded to YouTube and opened in common editing tools immediately.
 */

const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const { spawn } = require('child_process');
const { once } = require('events');

const FFMPEG_CANDIDATES = [
  '/opt/homebrew/bin/ffmpeg',
  '/usr/local/bin/ffmpeg',
  '/usr/bin/ffmpeg',
];

const OUTPUT_MIME = {
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
};

const CHANNELS = {
  recording: { directoryName: 'Recordings' },
  marker: { directoryName: 'Markers' },
};

const states = {
  recording: idleState('recording'),
  marker: idleState('marker'),
};

function idleState(channel = 'recording') {
  return {
    channel,
    active: false,
    mode: 'idle',
    filePath: null,
    fileName: null,
    writer: null,
    proc: null,
    bytesReceived: 0,
    startedAt: null,
    inputMimeType: 'video/webm',
    outputFormat: 'mp4',
    logs: [],
  };
}

function startRecording(opts = {}) {
  const channel = normalizeChannel(opts.channel);
  const state = states[channel];
  if (state.active) {
    throw new Error(channel === 'marker'
      ? '이미 마커 녹화가 진행 중입니다.'
      : '이미 로컬 녹화가 진행 중입니다.');
  }

  const outputFormat = normalizeOutputFormat(opts.outputFormat);
  const inputMimeType = typeof opts.mimeType === 'string' ? opts.mimeType : 'video/webm';
  const fileName = normalizeFileName(opts.fileName, outputFormat);
  const directory = getOutputDirectory(channel);
  fs.mkdirSync(directory, { recursive: true });
  const filePath = uniqueFilePath(path.join(directory, fileName));

  if (outputFormat === 'webm') {
    const writer = fs.createWriteStream(filePath, { flags: 'wx' });
    states[channel] = {
      ...idleState(channel),
      active: true,
      mode: 'webm',
      filePath,
      fileName: path.basename(filePath),
      writer,
      startedAt: Date.now(),
      inputMimeType,
      outputFormat,
    };
  } else {
    const ffmpegPath = resolveFfmpegPath();
    if (!ffmpegPath) {
      throw new Error('MP4/MOV 녹화를 위해 ffmpeg 이 필요합니다. `brew install ffmpeg` 후 다시 시도해 주세요.');
    }
    const proc = spawn(ffmpegPath, buildFfmpegArgs(filePath, outputFormat, opts), {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    states[channel] = {
      ...idleState(channel),
      active: true,
      mode: 'ffmpeg',
      filePath,
      fileName: path.basename(filePath),
      proc,
      startedAt: Date.now(),
      inputMimeType,
      outputFormat,
      logs: [],
    };

    proc.stderr.on('data', (buf) => {
      const text = buf.toString();
      const current = states[channel];
      current.logs.push(text);
      if (current.logs.length > 200) current.logs.shift();
    });

    proc.stdin.on('error', (err) => {
      if (err.code !== 'EPIPE') {
        states[channel].logs.push(String(err.message || err));
      }
    });

    proc.on('error', (err) => {
      states[channel].logs.push(String(err.message || err));
    });
  }

  const current = states[channel];
  return {
    ok: true,
    filePath,
    fileName: current.fileName,
    directory,
    startedAt: current.startedAt,
    mimeType: OUTPUT_MIME[outputFormat],
    outputFormat,
  };
}

async function pushChunk(chunk, channelInput = 'recording') {
  const channel = normalizeChannel(channelInput);
  const state = states[channel];
  if (!state.active) {
    return { ok: false, error: channel === 'marker'
      ? '마커 녹화 파일 스트림이 열려 있지 않습니다.'
      : '녹화 파일 스트림이 열려 있지 않습니다.' };
  }

  const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
  if (buffer.length === 0) {
    return { ok: true, bytesWritten: state.bytesReceived };
  }

  if (state.mode === 'webm') {
    if (!state.writer) return { ok: false, error: 'WebM 파일 writer 가 없습니다.' };
    const canContinue = state.writer.write(buffer);
    state.bytesReceived += buffer.length;
    if (!canContinue) {
      await once(state.writer, 'drain');
    }
    return { ok: true, bytesWritten: state.bytesReceived };
  }

  if (state.mode === 'ffmpeg') {
    if (!state.proc || !state.proc.stdin.writable) {
      return { ok: false, error: 'ffmpeg 녹화 프로세스가 준비되지 않았습니다.' };
    }
    const canContinue = state.proc.stdin.write(buffer);
    state.bytesReceived += buffer.length;
    if (!canContinue) {
      await once(state.proc.stdin, 'drain');
    }
    return { ok: true, bytesWritten: state.bytesReceived };
  }

  return { ok: false, error: '알 수 없는 녹화 모드입니다.' };
}

async function stopRecording(channelInput = 'recording') {
  const channel = normalizeChannel(channelInput);
  const state = states[channel];
  if (!state.active) {
    return { ok: false, error: channel === 'marker'
      ? '진행 중인 마커 녹화가 없습니다.'
      : '진행 중인 녹화가 없습니다.' };
  }

  const snapshot = { ...state, logs: [...state.logs] };

  try {
    if (snapshot.mode === 'webm') {
      await stopWebmWriter(snapshot);
    } else if (snapshot.mode === 'ffmpeg') {
      await stopFfmpeg(snapshot);
    }

    const size = readFileSize(snapshot.filePath);
    const ok = size > 0;
    return {
      ok,
      filePath: snapshot.filePath,
      fileName: snapshot.fileName,
      size,
      verified: ok,
      startedAt: snapshot.startedAt,
      endedAt: Date.now(),
      mimeType: OUTPUT_MIME[snapshot.outputFormat],
      outputFormat: snapshot.outputFormat,
      error: ok ? undefined : buildErrorMessage(snapshot, '녹화 파일 크기가 0 bytes 입니다.'),
    };
  } catch (err) {
    return {
      ok: false,
      filePath: snapshot.filePath,
      fileName: snapshot.fileName,
      size: readFileSize(snapshot.filePath),
      verified: false,
      startedAt: snapshot.startedAt,
      endedAt: Date.now(),
      mimeType: OUTPUT_MIME[snapshot.outputFormat],
      outputFormat: snapshot.outputFormat,
      error: buildErrorMessage(snapshot, String(err.message || err)),
    };
  } finally {
    states[channel] = idleState(channel);
  }
}

async function abortRecording(channelInput = 'recording') {
  const channel = normalizeChannel(channelInput);
  const state = states[channel];
  if (!state.active) {
    return { ok: true };
  }

  try {
    if (state.writer) state.writer.destroy();
    if (state.proc) {
      try { state.proc.stdin.destroy(); } catch { /* ignore */ }
      try { state.proc.kill('SIGKILL'); } catch { /* ignore */ }
    }
  } finally {
    states[channel] = idleState(channel);
  }
  return { ok: true };
}

function getStatus(channelInput = 'recording') {
  const channel = normalizeChannel(channelInput);
  const state = states[channel];
  return {
    active: state.active,
    filePath: state.filePath,
    bytesWritten: state.bytesReceived,
    startedAt: state.startedAt,
    outputFormat: state.outputFormat,
  };
}

function getOutputDirectory(channelInput = 'recording') {
  const channel = normalizeChannel(channelInput);
  return path.join(app.getPath('videos'), 'UnoLive', CHANNELS[channel].directoryName);
}

function normalizeChannel(value) {
  return value === 'marker' ? 'marker' : 'recording';
}

function buildFfmpegArgs(filePath, outputFormat, opts) {
  const bitrate = Math.max(1_000_000, Number(opts.videoBitrate) || 8_000_000);
  const bitrateK = Math.round(bitrate / 1000);
  const fps = Number(opts.fps) === 60 ? 60 : 30;
  const gop = fps * 2;
  const container = outputFormat === 'mov' ? 'mov' : 'mp4';

  return [
    '-hide_banner',
    '-loglevel', 'warning',
    '-fflags', '+genpts+discardcorrupt',
    '-use_wallclock_as_timestamps', '1',
    '-thread_queue_size', '1024',
    '-f', 'webm',
    '-i', 'pipe:0',
    '-map', '0:v:0',
    '-map', '0:a?',
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-profile:v', 'main',
    '-level', '4.1',
    '-b:v', `${bitrateK}k`,
    '-maxrate', `${bitrateK}k`,
    '-bufsize', `${bitrateK * 2}k`,
    '-pix_fmt', 'yuv420p',
    '-g', String(gop),
    '-keyint_min', String(gop),
    '-sc_threshold', '0',
    '-c:a', 'aac',
    '-b:a', '160k',
    '-ar', '48000',
    '-ac', '2',
    '-movflags', '+faststart',
    '-f', container,
    filePath,
  ];
}

function stopWebmWriter(snapshot) {
  return new Promise((resolve, reject) => {
    snapshot.writer.once('error', reject);
    snapshot.writer.end(resolve);
  });
}

function stopFfmpeg(snapshot) {
  return new Promise((resolve, reject) => {
    const proc = snapshot.proc;
    let settled = false;
    let sigintTimer = null;
    let sigkillTimer = null;

    const cleanup = () => {
      if (sigintTimer) clearTimeout(sigintTimer);
      if (sigkillTimer) clearTimeout(sigkillTimer);
    };
    const finish = (code, signal) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`ffmpeg 종료 코드 ${code ?? 'unknown'}${signal ? ` (${signal})` : ''}`));
      }
    };

    proc.once('close', finish);
    proc.once('error', (err) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
    });

    try { proc.stdin.end(); } catch { /* ignore */ }

    sigintTimer = setTimeout(() => {
      try { proc.kill('SIGINT'); } catch { /* ignore */ }
    }, 5000);
    sigkillTimer = setTimeout(() => {
      try { proc.kill('SIGKILL'); } catch { /* ignore */ }
    }, 10000);
  });
}

function resolveFfmpegPath() {
  for (const p of FFMPEG_CANDIDATES) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function normalizeOutputFormat(value) {
  if (value === 'mov' || value === 'webm') return value;
  return 'mp4';
}

function normalizeFileName(fileName, outputFormat) {
  const fallback = `unolive-${Date.now()}.${outputFormat}`;
  const safe = sanitizeFileName(fileName || fallback);
  const withoutKnownExt = safe.replace(/\.(webm|mp4|mov)$/i, '');
  return `${withoutKnownExt}.${outputFormat}`;
}

function uniqueFilePath(filePath) {
  if (!fs.existsSync(filePath)) return filePath;
  const parsed = path.parse(filePath);
  let i = 2;
  while (true) {
    const candidate = path.join(parsed.dir, `${parsed.name}-${i}${parsed.ext}`);
    if (!fs.existsSync(candidate)) return candidate;
    i += 1;
  }
}

function sanitizeFileName(fileName) {
  return String(fileName)
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 120) || `unolive-${Date.now()}.mp4`;
}

function readFileSize(filePath) {
  try {
    return fs.statSync(filePath).size;
  } catch {
    return 0;
  }
}

function buildErrorMessage(snapshot, message) {
  const tail = snapshot.logs.filter(Boolean).slice(-5).join('\n').trim();
  return tail ? `${message}\n${tail}` : message;
}

module.exports = {
  startRecording,
  pushChunk,
  stopRecording,
  abortRecording,
  getStatus,
  getOutputDirectory,
};
