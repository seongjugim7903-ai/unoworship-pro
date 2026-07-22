/**
 * server.ts
 * UnoLive 커스텀 HTTP 서버 + Socket.io 서버 진입점
 *
 * [FEATURE: SOCKET_IO]
 * Next.js 내장 dev 서버 대신 이 파일이 앱을 기동.
 * Socket.io를 Next.js HTTP 서버에 attach하여 PC1 ↔ PC2 LAN 통신 지원.
 *
 * 실행: tsx server.ts  (dev/prod 공통)
 * 포트: $PORT 환경변수 (기본: 3000)
 * 바인딩: $UNOLIVE_BIND_HOST (기본 0.0.0.0)
 */

import { createServer } from 'http';
import { AsyncLocalStorage } from 'async_hooks';
import {
  describeDeploymentConfig,
  getBindHost,
  getServerPort,
  isHostAllowed,
  isOriginAllowed,
} from './lib/server/deploymentConfig';

(globalThis as unknown as { AsyncLocalStorage?: typeof AsyncLocalStorage }).AsyncLocalStorage ??= AsyncLocalStorage;

const dev      = process.env.NODE_ENV !== 'production';
const hostname = getBindHost();
const port     = getServerPort();

// ── 프로세스 레벨 안전망 — 예배 중 무인 운영에서 예외 1건이 서버를 죽이지 않도록 ──
//    (Node 15+는 unhandledRejection 기본 동작이 프로세스 종료. 로깅만 하고 계속 간다.)
process.on('unhandledRejection', (reason) => {
  console.error('[server] unhandledRejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[server] uncaughtException:', err);
});

async function startServer() {
  const [{ default: next }, { Server: SocketIOServer }, { setupSocketServer }] = await Promise.all([
    import('next'),
    import('socket.io'),
    import('./lib/server/socketServer'),
  ]);

  const app    = next({ dev, hostname, port, dir: process.cwd() });
  const handle = app.getRequestHandler();

  await app.prepare();

  const httpServer = createServer((req, res) => {
    if (!isHostAllowed(req.headers.host)) {
      res.statusCode = 403;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ error: 'Forbidden: host not allowed' }));
      return;
    }
    handle(req, res);
  });

  // ── Socket.io 서버 설정 ────────────────────────────────────────────────────
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin(origin, callback) {
        callback(null, isOriginAllowed(origin));
      },
      methods: ['GET', 'POST'],
    },
    // WebSocket 전용 — LAN 환경에서 최소 지연
    transports: ['websocket'],
    // Base64 이미지(PNG 등) 포함 메시지를 위해 50MB 허용
    maxHttpBufferSize: 50 * 1024 * 1024,
  });

  setupSocketServer(io);

  // ── HTTP 서버 기동 ────────────────────────────────────────────────────────
  //   ※ 과거에는 여기서 Chrome 키오스크 쉘 스크립트를 execFile 로 띄웠지만,
  //     Electron 전환 이후 창 배치는 electron/main.js 가 전적으로 담당.
  httpServer.listen(port, hostname, () => {
    console.log(`> UnoLive ready on http://${hostname === '0.0.0.0' ? 'localhost' : hostname}:${port}`);
    console.log(`> Deployment guard: ${describeDeploymentConfig()}`);
    console.log(`> Socket.io 활성화 — LAN PC 간 통신 가능`);
  });

  // ── [FEATURE: ATEM_AUTOCONNECT] 부팅 시 ATEM 자동 연결 ──────────────────────
  //   재부팅 후에도 카메라 전환(그리드 제어)이 사람 손 없이 살아 있게 한다.
  //   UNOLIVE_ATEM_IP 미설정이면 완전 비활성 (기존 동작 무변화).
  const atemIp = process.env.UNOLIVE_ATEM_IP;
  if (atemIp) {
    const { AtemBridge } = await import('./lib/atemBridge');
    // [FEATURE: DSK_FILLKEY_GUARANTEE] 부팅 최초 연결 성공 시 1회 — DSK를 필앤키
    // (fill=입력4, key=입력5)로 보증하고 ON AIR. 이후 재연결에서는 건드리지 않음
    // (예배 중 운영자가 내린 키를 멋대로 다시 켜지 않기 위해).
    const dskFill = Number(process.env.UNOLIVE_ATEM_DSK_FILL ?? '4');
    const dskKey = Number(process.env.UNOLIVE_ATEM_DSK_KEY ?? '5');
    let fillKeyEnsured = false;
    const tryConnect = async () => {
      const state = AtemBridge.status.state;
      if (state === 'connected' || state === 'connecting') return;
      try {
        await AtemBridge.connect(atemIp);
        console.log(`> ATEM 자동 연결: ${atemIp}`);
        if (!fillKeyEnsured && Number.isInteger(dskFill) && Number.isInteger(dskKey) && dskFill > 0 && dskKey > 0) {
          fillKeyEnsured = true;
          try {
            await AtemBridge.ensureDskFillKey(dskFill, dskKey, true);
            console.log(`> DSK 필앤키 보증: fill=${dskFill} key=${dskKey} + ON AIR`);
          } catch (err) {
            console.warn(`> DSK 필앤키 보증 실패: ${String(err)}`);
          }
        }
      } catch (err) {
        console.warn(`> ATEM 자동 연결 실패(20초 후 재시도): ${String(err)}`);
      }
    };
    void tryConnect();
    setInterval(tryConnect, 20_000); // 끊기면 자동 복구
  }
}

startServer().catch((err) => {
  console.error('[server] UnoLive 서버 기동 실패:', err);
  process.exit(1);
});
