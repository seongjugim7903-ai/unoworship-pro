/**
 * electron/preload.js
 * Renderer (Next.js) ↔ Main 프로세스 IPC 브릿지
 *
 * contextIsolation: true 실행 → 여기서 명시적으로 expose 한 것만
 * 렌더러의 window.unolive.* 로 접근 가능.
 */

const { contextBridge, ipcRenderer } = require('electron');

// ── additionalArguments 로 전달받은 커맨드라인 플래그 파싱 ──
//   (loginWindow 에서 device_type/name/os_platform 을 이렇게 내려보냄)
function parseArg(prefix) {
  const arg = process.argv.find((a) => a.startsWith(prefix));
  if (!arg) return null;
  const value = arg.slice(prefix.length);
  try { return decodeURIComponent(value); } catch { return value; }
}

const deviceType   = parseArg('--unolive-device-type=');
const deviceName   = parseArg('--unolive-device-name=');
const osPlatform   = parseArg('--unolive-os-platform=');
const deviceToken  = parseArg('--unolive-device-token=');

contextBridge.exposeInMainWorld('unolive', {
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chrome:   process.versions.chrome,
    node:     process.versions.node,
  },

  // ── 디바이스 라이선스 브릿지 ─────────────────────────────────────────
  //   bridge 페이지에서 /api/auth/device/issue 호출 → 성공 시 토큰 전달
  device: {
    type:     deviceType,
    name:     deviceName,
    osPlatform,
    token:    deviceToken,        // 기동 중 창(대시보드)에 토큰 주입 — UI 에서 해제 버튼 등에 사용

    /** 토큰 발급 성공 → Electron main 으로 전달 (saveToken + 창 닫기) */
    issued: (payload) => ipcRenderer.send('device:issued', payload),

    /** 사용자가 로그인 포기 */
    cancelled: () => ipcRenderer.send('device:cancelled'),
  },

  // ── [FEATURE: YOUTUBE_LIVE / TWITCH_LIVE] WebM-stdin RTMP 송출 ───────
  //   렌더러의 MediaStream 을 MediaRecorder 로 인코딩해 chunk 를 main 에 전달.
  //   main 의 ffmpeg 가 H.264/AAC/FLV 로 재인코딩해 RTMP push.
  live: {
    checkFfmpeg:  ()      => ipcRenderer.invoke('live:check-ffmpeg'),
    start:        (opts)  => ipcRenderer.invoke('live:start', opts),
    pushChunk:    (chunk) => ipcRenderer.invoke('live:push-chunk', chunk),
    stop:         ()      => ipcRenderer.invoke('live:stop'),
    status:       ()      => ipcRenderer.invoke('live:status'),
    // 이벤트 구독 (started / stopped / stats / error / log)
    on: (event, cb) => {
      const channel = `live:event:${event}`;
      const listener = (_ev, payload) => cb(payload);
      ipcRenderer.on(channel, listener);
      return () => ipcRenderer.removeListener(channel, listener);
    },
  },

  // ── [FEATURE: LOCAL_RECORDING] WebM chunk 로컬 파일 저장 ─────────────
  recording: {
    start:     (opts)  => ipcRenderer.invoke('recording:start', opts),
    pushChunk: (chunk) => ipcRenderer.invoke('recording:push-chunk', chunk),
    stop:      ()      => ipcRenderer.invoke('recording:stop'),
    abort:     ()      => ipcRenderer.invoke('recording:abort'),
    status:    ()      => ipcRenderer.invoke('recording:status'),
    reveal:    (path)  => ipcRenderer.invoke('recording:reveal', path),
  },

  markerRecording: {
    start:     (opts)  => ipcRenderer.invoke('marker-recording:start', opts),
    pushChunk: (chunk) => ipcRenderer.invoke('marker-recording:push-chunk', chunk),
    stop:      ()      => ipcRenderer.invoke('marker-recording:stop'),
    abort:     ()      => ipcRenderer.invoke('marker-recording:abort'),
    status:    ()      => ipcRenderer.invoke('marker-recording:status'),
    reveal:    (path)  => ipcRenderer.invoke('marker-recording:reveal', path),
  },
});
