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

const { app, BrowserWindow, dialog, ipcMain, screen, session, shell, utilityProcess } = require('electron');
const fs = require('fs');
const { spawn, spawnSync } = require('child_process');
const path = require('path');
const os = require('os');
const http = require('http');

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

// 디바이스 인증(로그인·토큰 발급·검증)은 내부 서버가 아니라 클라우드 웹에서 수행한다.
//   설치된 앱에는 Supabase service role 키가 없기 때문 (RUNBOOK §5).
//   교회 등록·구독도 이 웹에서 미리 끝내는 온보딩 구조
//   (docs/UNOWORSHIP_ONBOARDING_DEVICE_AUTH_PLAN_2026-07-23.md).
const CLOUD_BASE = (process.env.UNOLIVE_CLOUD_BASE || 'https://unoworship-pro-eight.vercel.app')
  .replace(/\/+$/, '');

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

// ─── 로컬 라이브러리 (교회 데이터는 앱 번들 밖에 저장) ─────────────
//   docs/UNOWORSHIP_SAAS_ELECTRON_DATA_ARCHITECTURE_PLAN.md §5
function getLibraryDir() {
  return process.env.UNOLIVE_LIBRARY_DIR
    || path.join(app.getPath('documents'), 'UnoWorship Library');
}

function ensureLibraryDirs(libraryDir) {
  const subdirs = ['data', 'generated', 'archive', 'files', 'manifests'];
  for (const sub of subdirs) {
    try { fs.mkdirSync(path.join(libraryDir, sub), { recursive: true }); } catch { /* ignore */ }
  }
}

function buildServerEnv(libraryDir) {
  return {
    ...process.env,
    PORT: String(SERVER_PORT),
    UNOLIVE_BIND_HOST: process.env.UNOLIVE_BIND_HOST || '0.0.0.0',
    UNOLIVE_STRICT_HOSTS: process.env.UNOLIVE_STRICT_HOSTS || '1',
    UNOLIVE_SERVER_LAN_IP: process.env.UNOLIVE_SERVER_LAN_IP || LAN_IPV4S[0] || '',
    UNOLIVE_ALLOWED_LAN_HOSTS: process.env.UNOLIVE_ALLOWED_LAN_HOSTS || DEFAULT_ALLOWED_LAN_HOSTS,
    UNOLIVE_ALLOWED_WRITE_ORIGINS: process.env.UNOLIVE_ALLOWED_WRITE_ORIGINS || process.env.UNOLIVE_ALLOWED_LAN_HOSTS || DEFAULT_ALLOWED_LAN_HOSTS,
    ...(libraryDir ? { UNOLIVE_LIBRARY_DIR: libraryDir } : {}),
  };
}

// ─── Next.js 서버 기동 ─────────────────────────────────────────
//   dev: 기존처럼 npm run dev:watch (개발 머신에는 npm/tsx 존재)
//   패키지 앱: .resources/app-server/unoworship-server.js 를 Electron 내장
//   Node(utilityProcess)로 직접 기동 — 사용자 컴퓨터에 Node/npm 불필요.
function spawnNextServer() {
  if (nextProcess) return;

  if (app.isPackaged) {
    const serverRoot = path.join(process.resourcesPath, 'app-server');
    const serverEntry = path.join(serverRoot, 'unoworship-server.js');
    const libraryDir = getLibraryDir();
    ensureLibraryDirs(libraryDir);

    console.log(`[electron] 번들 서버 기동: ${serverEntry}`);
    console.log(`[electron] 로컬 라이브러리: ${libraryDir}`);

    // 서버 stdout/stderr → userData/logs/server.log
    //   GUI 앱은 콘솔이 없어 현장 장애 진단이 불가능하므로 파일로 남긴다.
    let logStream = null;
    try {
      const logDir = path.join(app.getPath('userData'), 'logs');
      fs.mkdirSync(logDir, { recursive: true });
      logStream = fs.createWriteStream(path.join(logDir, 'server.log'), { flags: 'a' });
      logStream.write(`\n──── ${new Date().toISOString()} 서버 기동 ────\n`);
    } catch { /* 로그 실패가 기동을 막지 않게 */ }

    nextProcess = utilityProcess.fork(serverEntry, [], {
      cwd: serverRoot,
      stdio: 'pipe',
      serviceName: 'unoworship-server',
      env: {
        ...buildServerEnv(libraryDir),
        NODE_ENV: 'production',
      },
    });
    if (logStream) {
      nextProcess.stdout?.on('data', (chunk) => logStream.write(chunk));
      nextProcess.stderr?.on('data', (chunk) => logStream.write(chunk));
    }
  } else {
    const projectRoot = path.join(__dirname, '..');
    const cmd = isDev ? 'dev:watch' : 'start';

    console.log(`[electron] Next.js 기동: npm run ${cmd}`);
    nextProcess = spawn('npm', ['run', cmd], {
      cwd: projectRoot,
      stdio: 'inherit',
      shell: true,
      env: buildServerEnv(null),
    });
  }

  nextProcess.on('exit', (code) => {
    console.log(`[electron] Next.js exit (${code}) — quit app`);
    if (!app.isQuiting) app.quit();
  });
}

// ─── 창 역할 정의 (현장 검증 구조: docs/field/setup-and-output-control.md) ───
//   composer  제어 화면
//   fill      ATEM Input 4 = Fill Source (원본 색상)
//   key       ATEM Input 5 = Key Source (흑백 매트) — 반드시 ?mode=key
//   sub       ATEM Input 6 = 무대 출력
//   relay     ATEM USB 클린피드 릴레이 — 모니터 불필요, 숨김 창으로 상주
const WINDOW_ROLES = [
  { role: 'composer', urlPath: '/composer', kiosk: false, title: 'UnoWorship Composer' },
  { role: 'fill', urlPath: '/atemsignal/fill?mode=fill', kiosk: true, title: 'UnoWorship FILL — ATEM Input 4' },
  { role: 'key', urlPath: '/atemsignal/key?mode=key', kiosk: true, title: 'UnoWorship KEY — ATEM Input 5' },
  { role: 'sub', urlPath: '/atem-sub', kiosk: true, title: 'UnoWorship SUB — 무대' },
];
const RELAY_ROLE = { role: 'relay', urlPath: '/atem-usb-relay-v2', title: 'UnoWorship Camera Relay (백그라운드)' };

// ─── 디스플레이 프로필 ─────────────────────────────────────────
//   Blackmagic 어댑터 2개는 동일 EDID 라 재부팅 시 순서가 뒤바뀔 수 있다.
//   userData/display-profile.json 에 역할→디스플레이 id 를 저장해 고정하고,
//   지정이 없거나 해당 디스플레이가 없으면 x좌표 순서 휴리스틱으로 배치한다.
//   부팅 때마다 감지된 디스플레이 목록과 실제 배치를 같은 파일에 기록해
//   사용자가 파일을 열어 id 만 바꾸면 다음 부팅부터 반영된다.
function displayProfilePath() {
  return path.join(app.getPath('userData'), 'display-profile.json');
}

function loadDisplayProfile() {
  try {
    return JSON.parse(fs.readFileSync(displayProfilePath(), 'utf-8'));
  } catch {
    return {};
  }
}

function saveDisplayProfile(profile) {
  try {
    fs.mkdirSync(path.dirname(displayProfilePath()), { recursive: true });
    fs.writeFileSync(displayProfilePath(), JSON.stringify(profile, null, 2), 'utf-8');
  } catch (err) {
    console.warn('[electron] display-profile 저장 실패:', err);
  }
}

// 역할별 디스플레이 결정. 반환: Map<role, Display|null>
function resolveRoleDisplays() {
  const displays = [...screen.getAllDisplays()].sort((a, b) => a.bounds.x - b.bounds.x);
  const profile = loadDisplayProfile();
  const saved = profile.assignments || {};
  const assigned = new Map();
  const used = new Set();

  // 1차: 프로필에 저장된 id 가 실제 연결되어 있으면 그대로 사용
  for (const { role } of WINDOW_ROLES) {
    const id = saved[role];
    const match = id != null ? displays.find((d) => d.id === id) : null;
    if (match && !used.has(match.id)) {
      assigned.set(role, match);
      used.add(match.id);
    }
  }

  // 2차: 남은 역할을 x좌표 순서로 배치 (composer → fill → key → sub)
  const remaining = displays.filter((d) => !used.has(d.id));
  for (const { role } of WINDOW_ROLES) {
    if (assigned.has(role)) continue;
    const next = remaining.shift();
    if (next) {
      assigned.set(role, next);
      used.add(next.id);
    } else {
      assigned.set(role, null); // 모니터 부족 — 이 역할 창은 열지 않음 (composer 는 예외 처리)
    }
  }

  // composer 는 모니터가 하나뿐이어도 반드시 primary 에 연다
  if (!assigned.get('composer')) {
    assigned.set('composer', screen.getPrimaryDisplay());
  }

  // 감지 결과와 실제 배치를 프로필 파일에 기록 (사용자 편집용)
  saveDisplayProfile({
    note: 'assignments 의 역할별 값에 lastDetectedDisplays 의 id 를 넣으면 다음 실행부터 그 모니터에 고정됩니다.',
    assignments: Object.fromEntries(
      WINDOW_ROLES.map(({ role }) => [role, assigned.get(role)?.id ?? saved[role] ?? null])
    ),
    lastDetectedDisplays: displays.map((d) => ({
      id: d.id,
      bounds: d.bounds,
      internal: d.internal,
      label: d.label || '',
    })),
    lastResolvedAt: new Date().toISOString(),
  });

  const summary = WINDOW_ROLES
    .map(({ role }) => `${role}=${assigned.get(role) ? assigned.get(role).id : '없음'}`)
    .join(', ');
  console.log(`[electron] 디스플레이 배치: ${summary}`);

  return assigned;
}

// ─── BrowserWindow 생성 헬퍼 ───────────────────────────────────
function createWindow(display, urlPath, opts = {}) {
  const {
    kiosk = false,
    title,
    deviceToken,
    deviceType,
    deviceName,
    desktopShell = false,
    hidden = false,
    noThrottle = false,
  } = opts;
  const bounds = display ? display.bounds : { x: 0, y: 0, width: 1280, height: 800 };
  const inset = desktopShell && !kiosk ? 12 : 0;

  const win = new BrowserWindow({
    x: bounds.x + inset,
    y: bounds.y + inset,
    width: bounds.width - inset * 2,
    height: bounds.height - inset * 2,
    kiosk,
    show: !hidden,
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
      // 출력·릴레이 창은 가려지거나 숨겨져도 렌더링/캡처가 멈추면 안 된다
      backgroundThrottling: !noThrottle,
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

// ─── 5창 배치: Composer / Fill / Key / Sub + 숨김 카메라 릴레이 ────
//   제어 창(composer) 이 "메인": 닫히면 앱 전체 종료.
//   Fill/Key/Sub 는 kiosk 라 UI 에서 닫을 수 없고, 모니터가 부족하면 열지 않는다.
//   릴레이는 모니터가 필요 없는 숨김 창으로 항상 상주한다.
function createAllWindows(stored) {
  const assigned = resolveRoleDisplays();

  const opts = {
    deviceToken: stored.token,
    deviceType:  DEVICE_TYPE,
    deviceName:  stored.deviceName,
  };

  let controlWin = null;
  for (const { role, urlPath, kiosk, title } of WINDOW_ROLES) {
    const display = assigned.get(role);
    if (!display) {
      console.log(`[electron] 모니터 부족 — ${role} 창 생략`);
      continue;
    }
    const win = createWindow(display, urlPath, {
      ...opts,
      kiosk,
      title,
      desktopShell: role === 'composer',
      // 출력 창은 다른 창에 가려져도 렌더링이 멈추면 안 됨
      noThrottle: role !== 'composer',
    });
    windows.push(win);
    if (role === 'composer') controlWin = win;
  }

  // 카메라 릴레이 — 항상 숨김 창으로 상주 (ATEM USB 클린피드 → WebRTC)
  const relayWin = createWindow(null, RELAY_ROLE.urlPath, {
    ...opts,
    title: RELAY_ROLE.title,
    hidden: true,
    noThrottle: true,
  });
  windows.push(relayWin);
  console.log('[electron] 카메라 릴레이 숨김 창 기동');

  // 제어 창 닫기 → 앱 전체 종료 (kiosk·숨김 창 포함 전부)
  if (controlWin) {
    controlWin.on('close', () => {
      console.log('[electron] 제어 창 닫힘 → 앱 종료');
      app.isQuiting = true;
      app.quit();
    });
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
    if (token && !headers['X-Device-Token'] && !headers['x-device-token']) {
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

// ─── 서버 ready 대기 (외부 의존성 없는 자체 폴링) ────────────────
//   패키지 앱에는 devDependency(wait-on)가 없으므로 http 폴링으로 대체.
function waitForServer(url, { timeout = 60_000, interval = 500 } = {}) {
  const deadline = Date.now() + timeout;
  return new Promise((resolve, reject) => {
    const probe = () => {
      const req = http.get(url, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode < 500) return resolve();
        retry();
      });
      req.on('error', retry);
      req.setTimeout(3_000, () => { req.destroy(); retry(); });
    };
    const retry = () => {
      if (Date.now() > deadline) return reject(new Error(`server not ready within ${timeout}ms: ${url}`));
      setTimeout(probe, interval);
    };
    probe();
  });
}

// ─── 메인 기동 루틴 ────────────────────────────────────────────
async function boot() {
  // 1. Next.js 서버 기동 + ready 대기
  spawnNextServer();
  try {
    await waitForServer(SERVER_URL, { timeout: 60_000, interval: 500 });
    console.log('[electron] Next.js ready');
  } catch (err) {
    console.error('[electron] Next.js 기동 실패:', err);
    showBlockingError('서버 기동 실패', '내부 서버를 시작하지 못했습니다.', String(err));
    app.quit();
    return;
  }

  // 2. 디바이스 토큰 인증 체크
  //   [DEV BYPASS] 맥미니가 아닌 개발 머신에는 디바이스 토큰·클라우드 인증이
  //   없어 로그인 창에서 막힌다. 개발 모드 + UNOLIVE_SKIP_DEVICE_AUTH=1 일 때만
  //   인증을 건너뛰고 창 배치/기능 개발을 허용한다. 프로덕션에서는 동작하지 않는다.
  const skipDeviceAuth = isDev && process.env.UNOLIVE_SKIP_DEVICE_AUTH === '1';
  if (skipDeviceAuth) {
    console.log('[electron] DEV: 디바이스 인증 우회 (UNOLIVE_SKIP_DEVICE_AUTH=1)');
    configureSession('');
    createAllWindows({ token: '', deviceName: 'dev-bypass' });
    registerGlobalShortcuts();
    return;
  }

  let stored = loadToken();
  let authResult = stored ? await checkAuth(CLOUD_BASE) : { status: 'no_token' };

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

    const result = await openLoginWindow(CLOUD_BASE, DEVICE_TYPE);
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
      shell.openExternal(CLOUD_BASE);
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

// 서버 프로세스 종료.
//   dev 모드는 shell:true 로 npm 을 띄우므로 kill() 이 쉘만 죽이고 tsx/node 가
//   고아로 남는다(포트 3000 점유 → 다음 실행 lock 충돌). Windows 는 taskkill /T
//   로 트리 전체를 정리한다. 패키지 앱(utilityProcess)은 kill() 로 충분하다.
function killServerProcess() {
  if (!nextProcess) return;
  const proc = nextProcess;
  nextProcess = null;
  try {
    if (!app.isPackaged && process.platform === 'win32' && proc.pid) {
      spawnSync('taskkill', ['/pid', String(proc.pid), '/T', '/F']);
    } else {
      proc.kill();
    }
  } catch { /* ignore */ }
}

app.on('window-all-closed', () => {
  app.isQuiting = true;
  killServerProcess();
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
