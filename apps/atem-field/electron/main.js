/**
 * electron/main.js
 * UnoLive Electron 메인 프로세스
 *
 * 역할:
 *   1. Next.js 서버 기동 (dev: npm run dev:watch, prod: npm start)
 *   2. 디바이스 토큰 인증 체크 — 없으면 로그인 창, 있으면 바로 진행
 *      - 최초 로그인 후 OS 키체인에 토큰 저장
 *      - 이후 실행 시 로그인 없이 백그라운드로 구독만 확인 (오프라인 30일 grace)
 *   3. 모든 BrowserWindow 요청에 X-Device-Token 헤더 자동 주입
 *   4. 연결된 모니터 감지해 3개 창 배치
 *        - 제어(X=0)  : /                 (Composer, DevTools)
 *        - 중층       : /prompt           (키오스크)
 *        - 강대상      : /output           (키오스크)
 *   5. 카메라·마이크 권한 자동 허용
 */

const { app, BrowserWindow, dialog, ipcMain, screen, session, shell } = require('electron');
const fs = require('fs');
const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const waitOn = require('wait-on');

const { checkAuth } = require('./auth/verify');
const { openLoginWindow } = require('./auth/loginWindow');
const { loadToken, clearToken } = require('./auth/tokenStore');
const ffmpegRtmp = require('./live/ffmpegRtmp');
const fileRecorder = require('./recording/fileRecorder');

// [FIX: WebRTC LAN] Chrome 기본은 ICE host 후보를 xxx.local mDNS 로 난독화.
//   LAN 내 다른 머신(Windows 노트북 등) 이 .local 을 못 풀면 WebRTC 연결이
//   "connecting" 에서 멈춤. Electron 쪽에서 실제 LAN IP 를 노출하도록 해제.
app.commandLine.appendSwitch('disable-features', 'WebRtcHideLocalIpsWithMdns');

const isDev = process.env.NODE_ENV === 'development';
const SERVER_PORT = process.env.PORT || 3000;
const SERVER_URL = `http://localhost:${SERVER_PORT}`;
const DEVICE_TYPE = process.env.UNOLIVE_DEVICE_TYPE || 'server';

function getLanIPv4s() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter(Boolean)
    .filter((item) => item.family === 'IPv4' && !item.internal)
    .map((item) => item.address);
}

const LAN_IPV4S = getLanIPv4s();
const DEFAULT_ALLOWED_LAN_HOSTS = ['localhost', '127.0.0.1', ...LAN_IPV4S].join(',');

let nextProcess = null;
const windows = [];

function getRecordingDirectory(channel = 'recording') {
  return fileRecorder.getOutputDirectory(channel);
}

function resolveRecordingRevealTarget(targetPath, channel = 'recording') {
  const directory = getRecordingDirectory(channel);
  if (typeof targetPath !== 'string' || !targetPath.trim()) return directory;
  if (targetPath.startsWith('browser-download://')) return directory;

  const normalizedDirectory = path.normalize(directory);
  const normalizedTarget = path.normalize(targetPath);
  if (!path.isAbsolute(normalizedTarget) || !normalizedTarget.startsWith(normalizedDirectory)) {
    return directory;
  }
  return normalizedTarget;
}

// ─── Next.js 서버 기동 ─────────────────────────────────────────
function spawnNextServer() {
  if (nextProcess) return;

  const projectRoot = path.join(__dirname, '..');
  const cmd = isDev ? 'dev:watch' : 'start';

  console.log(`[electron] Next.js 기동: npm run ${cmd}`);
  nextProcess = spawn('npm', ['run', cmd], {
    cwd: projectRoot,
    stdio: 'inherit',
    shell: true,
    env: {
      ...process.env,
      PORT: String(SERVER_PORT),
      UNOLIVE_BIND_HOST: process.env.UNOLIVE_BIND_HOST || '0.0.0.0',
      UNOLIVE_STRICT_HOSTS: process.env.UNOLIVE_STRICT_HOSTS || '1',
      UNOLIVE_SERVER_LAN_IP: process.env.UNOLIVE_SERVER_LAN_IP || LAN_IPV4S[0] || '',
      UNOLIVE_ALLOWED_LAN_HOSTS: process.env.UNOLIVE_ALLOWED_LAN_HOSTS || DEFAULT_ALLOWED_LAN_HOSTS,
      UNOLIVE_ALLOWED_WRITE_ORIGINS: process.env.UNOLIVE_ALLOWED_WRITE_ORIGINS || process.env.UNOLIVE_ALLOWED_LAN_HOSTS || DEFAULT_ALLOWED_LAN_HOSTS,
    },
  });

  nextProcess.on('exit', (code) => {
    console.log(`[electron] Next.js exit (${code}) — quit app`);
    if (!app.isQuiting) app.quit();
  });
}

// ─── 모니터 자동 매핑 ──────────────────────────────────────────
function resolveMonitors() {
  const displays = screen.getAllDisplays();
  const sorted = [...displays].sort((a, b) => a.bounds.x - b.bounds.x);
  return {
    control: sorted[0],
    prompt:  sorted[1],
    output:  sorted[2],
  };
}

// ─── BrowserWindow 생성 헬퍼 ───────────────────────────────────
function createWindow(display, urlPath, opts = {}) {
  const { kiosk = false, title, deviceToken, deviceType, deviceName, desktopShell = false } = opts;
  const { x, y, width, height } = display.bounds;
  const inset = desktopShell && !kiosk ? 12 : 0;

  const win = new BrowserWindow({
    x: x + inset,
    y: y + inset,
    width: width - inset * 2,
    height: height - inset * 2,
    kiosk,
    frame: !kiosk,
    titleBarStyle: 'default',
    resizable: !kiosk,
    minimizable: !kiosk,
    maximizable: !kiosk,
    autoHideMenuBar: true,
    title: title ?? `UnoLive ${urlPath}`,
    backgroundColor: '#000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      additionalArguments: [
        `--unolive-device-type=${deviceType ?? DEVICE_TYPE}`,
        `--unolive-device-name=${encodeURIComponent(deviceName ?? '')}`,
        `--unolive-os-platform=${process.platform}`,
        `--unolive-device-token=${encodeURIComponent(deviceToken ?? '')}`,
      ],
    },
  });

  win.loadURL(`${SERVER_URL}${urlPath}`);

  if (isDev && !kiosk && process.env.UNOLIVE_OPEN_DEVTOOLS === '1') {
    win.webContents.openDevTools({ mode: 'detach' });
  }

  return win;
}

// ─── 3 모니터 창 배치 ──────────────────────────────────────────
//   제어 창(control) 을 "메인" 으로 취급: 이 창이 닫히면 앱 전체 종료.
//   강대상/중층 은 kiosk 창이라 UI 에서 닫을 수 없으므로, 제어 창의
//   close 이벤트를 따라 같이 닫히게 만든다.
function createAllWindows(stored) {
  const { control, prompt, output } = resolveMonitors();

  const opts = {
    deviceToken: stored.token,
    deviceType:  DEVICE_TYPE,
    deviceName:  stored.deviceName,
  };

  let controlWin = null;
  if (control) {
    controlWin = createWindow(control, '/', {
      ...opts, kiosk: false, desktopShell: true, title: 'UnoWorship Composer',
    });
    windows.push(controlWin);
  }
  if (prompt) {
    windows.push(createWindow(prompt, '/prompt', {
      ...opts, kiosk: true, title: 'UnoLive — Prompt',
    }));
  }
  if (output) {
    windows.push(createWindow(output, '/output', {
      ...opts, kiosk: true, title: 'UnoLive — Output',
    }));
  }

  // 제어 창 닫기 → 앱 전체 종료 (kiosk 창 포함 전부)
  if (controlWin) {
    controlWin.on('close', () => {
      console.log('[electron] 제어 창 닫힘 → 앱 종료');
      app.isQuiting = true;
      app.quit();
    });
  }

  if (!prompt && !output) {
    console.log('[electron] 단일 모니터 감지 — 창 하나만 배치');
  }
}

// ─── 전역 단축키: 어떤 창이 포커스여도 항상 작동 ──────────────
//   Cmd+Q (macOS) / Ctrl+Q (다른 OS) → 앱 전체 종료
//   Cmd+Shift+K → 강제 kiosk 해제 (디버깅용)
function registerGlobalShortcuts() {
  const { globalShortcut } = require('electron');
  const quitKey = process.platform === 'darwin' ? 'Command+Q' : 'Control+Q';

  globalShortcut.register(quitKey, () => {
    console.log('[electron] 단축키로 종료 요청');
    app.isQuiting = true;
    app.quit();
  });

  globalShortcut.register('CommandOrControl+Shift+K', () => {
    // kiosk 창 긴급 해제 (디버깅용)
    BrowserWindow.getAllWindows().forEach((w) => {
      if (w.isKiosk()) w.setKiosk(false);
    });
  });
}

// ─── 세션 설정: 권한 자동 허용 + X-Device-Token 헤더 주입 ──────
function configureSession(token) {
  // 카메라·마이크·디스플레이 권한
  session.defaultSession.setPermissionRequestHandler((_wc, perm, cb) => {
    const allowed = ['media', 'camera', 'microphone', 'display-capture', 'geolocation'];
    cb(allowed.includes(perm));
  });

  // 모든 요청에 X-Device-Token 헤더 자동 주입
  //   (localhost:3000 뿐 아니라 LAN IP 로 접근해도 동일하게 적용)
  session.defaultSession.webRequest.onBeforeSendHeaders((details, cb) => {
    const headers = { ...details.requestHeaders };
    if (!headers['X-Device-Token'] && !headers['x-device-token']) {
      headers['X-Device-Token'] = token;
    }
    cb({ requestHeaders: headers });
  });
}

// ─── 차단 모달 ──────────────────────────────────────────────────
function showBlockingError(title, message, detail) {
  dialog.showMessageBoxSync({
    type: 'error',
    title: title ?? 'UnoLive',
    message: message ?? '',
    detail: detail ?? '',
    buttons: ['종료'],
  });
}

// ─── 메인 기동 루틴 ────────────────────────────────────────────
async function boot() {
  // 1. Next.js 서버 기동 + ready 대기
  spawnNextServer();
  try {
    await waitOn({ resources: [SERVER_URL], timeout: 60_000, interval: 500 });
    console.log('[electron] Next.js ready');
  } catch (err) {
    console.error('[electron] Next.js 기동 실패:', err);
    showBlockingError('서버 기동 실패', '내부 서버를 시작하지 못했습니다.', String(err));
    app.quit();
    return;
  }

  // 2. 디바이스 토큰 인증 체크
  let stored = loadToken();
  let authResult = stored ? await checkAuth(SERVER_URL) : { status: 'no_token' };

  // 최초 기동 또는 토큰 무효 → 로그인 창
  if (authResult.status === 'no_token' || authResult.status === 'invalid_token' ||
      authResult.status === 'grace_expired') {
    const reason = authResult.status === 'grace_expired'
      ? '오프라인 사용 기간(30일)이 만료되었습니다. 다시 로그인해 주세요.'
      : authResult.status === 'invalid_token'
      ? '인증이 해제되었습니다. 다시 로그인해 주세요.'
      : null;

    if (reason) {
      dialog.showMessageBoxSync({ type: 'warning', message: reason, buttons: ['로그인'] });
    }

    const result = await openLoginWindow(SERVER_URL, DEVICE_TYPE);
    if (!result.success) {
      console.log('[electron] 로그인 취소됨 — 종료');
      app.quit();
      return;
    }
    stored = loadToken();
    authResult = { status: 'ok' };
  }

  // 구독 만료 → 재결제 유도
  if (authResult.status === 'subscription_expired') {
    const clicked = dialog.showMessageBoxSync({
      type: 'warning',
      title: '구독 만료',
      message: 'UnoLive 구독이 만료되었습니다.',
      detail: '구독을 갱신한 뒤 다시 실행해 주세요.',
      buttons: ['구독 페이지 열기', '종료'],
      defaultId: 0,
      cancelId: 1,
    });
    if (clicked === 0) {
      const { shell } = require('electron');
      shell.openExternal(`${SERVER_URL}/media/pricing`);
    }
    app.quit();
    return;
  }

  // 오프라인 grace 중이면 사용자에게 알림만 (기동은 진행)
  if (authResult.status === 'offline_grace') {
    console.log('[electron] 오프라인 grace 모드로 기동');
  }

  // 3. 세션 설정 (X-Device-Token 헤더 자동 주입)
  if (!stored) {
    showBlockingError('인증 오류', '토큰 로드 실패', '재설치가 필요합니다.');
    app.quit();
    return;
  }
  configureSession(stored.token);

  // 4. 3 모니터 창 배치
  createAllWindows(stored);

  // 5. 전역 단축키 등록 (Cmd+Q 로 언제든 종료 가능)
  registerGlobalShortcuts();
}

// ─── 앱 라이프사이클 ───────────────────────────────────────────
app.whenReady().then(() => {
  // Dock 아이콘 설정 (macOS) — electron:dev 에서도 UnoLive 아이콘 보이도록
  if (process.platform === 'darwin' && app.dock) {
    const iconPath = path.join(__dirname, '..', 'build', 'icon.png');
    try { app.dock.setIcon(iconPath); } catch { /* ignore */ }
  }
  boot();
});

app.on('window-all-closed', () => {
  app.isQuiting = true;
  if (nextProcess) {
    try { nextProcess.kill(); } catch { /* ignore */ }
    nextProcess = null;
  }
  app.quit();
});

app.on('before-quit', () => {
  app.isQuiting = true;
  const { globalShortcut } = require('electron');
  globalShortcut.unregisterAll();
  // kiosk 창들을 명시적으로 닫음 (kiosk 모드가 close 를 막는 경우 대비)
  BrowserWindow.getAllWindows().forEach((w) => {
    try {
      if (w.isKiosk()) w.setKiosk(false);
      w.removeAllListeners('close');
      w.destroy();
    } catch { /* ignore */ }
  });
});

// 외부에서 해제/삭제용 (개발 중 디버깅에 편함)
ipcMain.handle('device:clear', () => {
  clearToken();
  return { ok: true };
});

// ─── [FEATURE: YOUTUBE_LIVE / TWITCH_LIVE] WebM-stdin RTMP IPC ───
ipcMain.handle('live:check-ffmpeg', async () => {
  return ffmpegRtmp.checkFfmpeg();
});
ipcMain.handle('live:start', async (_ev, opts) => {
  try {
    const res = ffmpegRtmp.startStream(opts);
    return { ok: true, ...res };
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  }
});
// 렌더러의 MediaRecorder 가 ondataavailable 로 만든 WebM 청크를 전달.
// invoke 대신 on/send 비동기 경로로도 가능하지만, invoke 가 backpressure 신호를 주기 좋음.
ipcMain.handle('live:push-chunk', async (_ev, chunkArrayBuffer) => {
  if (!chunkArrayBuffer) return { ok: false };
  try {
    const ok = ffmpegRtmp.pushChunk(Buffer.from(chunkArrayBuffer));
    return { ok };
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  }
});
ipcMain.handle('live:stop', async () => {
  return ffmpegRtmp.stopStream();
});
ipcMain.handle('live:status', async () => {
  return ffmpegRtmp.getStatus();
});

// ffmpeg 이벤트 → 모든 렌더러 브로드캐스트
['started', 'stopped', 'stats', 'error', 'log'].forEach((name) => {
  ffmpegRtmp.events.on(name, (payload) => {
    BrowserWindow.getAllWindows().forEach((w) => {
      try { w.webContents.send(`live:event:${name}`, payload); } catch { /* ignore */ }
    });
  });
});

// ─── [FEATURE: LOCAL_RECORDING] MediaRecorder chunk 파일 저장 IPC ───
ipcMain.handle('recording:start', async (_ev, opts) => {
  try {
    return fileRecorder.startRecording(opts);
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  }
});
ipcMain.handle('recording:push-chunk', async (_ev, chunkArrayBuffer) => {
  if (!chunkArrayBuffer) return { ok: false, error: '빈 녹화 청크입니다.' };
  try {
    return await fileRecorder.pushChunk(Buffer.from(chunkArrayBuffer));
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  }
});
ipcMain.handle('recording:stop', async () => {
  try {
    return await fileRecorder.stopRecording();
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  }
});
ipcMain.handle('recording:abort', async () => {
  try {
    return await fileRecorder.abortRecording();
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  }
});
ipcMain.handle('recording:status', async () => {
  return fileRecorder.getStatus();
});
ipcMain.handle('recording:reveal', async (_ev, targetPath) => {
  try {
    const directory = getRecordingDirectory('recording');
    fs.mkdirSync(directory, { recursive: true });

    const target = resolveRecordingRevealTarget(targetPath, 'recording');
    if (fs.existsSync(target)) {
      const stat = fs.statSync(target);
      if (stat.isFile()) {
        shell.showItemInFolder(target);
        return { ok: true, path: target };
      }
      const openError = await shell.openPath(target);
      return openError ? { ok: false, error: openError } : { ok: true, path: target };
    }

    const parent = path.dirname(target);
    const fallback = fs.existsSync(parent) ? parent : directory;
    const openError = await shell.openPath(fallback);
    return openError ? { ok: false, error: openError } : { ok: true, path: fallback };
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  }
});

// ─── [FEATURE: MARKER_RECORDING] 클립 마커 구간 별도 파일 저장 IPC ───
ipcMain.handle('marker-recording:start', async (_ev, opts) => {
  try {
    return fileRecorder.startRecording({ ...opts, channel: 'marker' });
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  }
});
ipcMain.handle('marker-recording:push-chunk', async (_ev, chunkArrayBuffer) => {
  if (!chunkArrayBuffer) return { ok: false, error: '빈 마커 녹화 청크입니다.' };
  try {
    return await fileRecorder.pushChunk(Buffer.from(chunkArrayBuffer), 'marker');
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  }
});
ipcMain.handle('marker-recording:stop', async () => {
  try {
    return await fileRecorder.stopRecording('marker');
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  }
});
ipcMain.handle('marker-recording:abort', async () => {
  try {
    return await fileRecorder.abortRecording('marker');
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  }
});
ipcMain.handle('marker-recording:status', async () => {
  return fileRecorder.getStatus('marker');
});
ipcMain.handle('marker-recording:reveal', async (_ev, targetPath) => {
  try {
    const directory = getRecordingDirectory('marker');
    fs.mkdirSync(directory, { recursive: true });

    const target = resolveRecordingRevealTarget(targetPath, 'marker');
    if (fs.existsSync(target)) {
      const stat = fs.statSync(target);
      if (stat.isFile()) {
        shell.showItemInFolder(target);
        return { ok: true, path: target };
      }
      const openError = await shell.openPath(target);
      return openError ? { ok: false, error: openError } : { ok: true, path: target };
    }

    const parent = path.dirname(target);
    const fallback = fs.existsSync(parent) ? parent : directory;
    const openError = await shell.openPath(fallback);
    return openError ? { ok: false, error: openError } : { ok: true, path: fallback };
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  }
});
