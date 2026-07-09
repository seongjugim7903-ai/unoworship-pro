// UnoWorship Pro 커스텀 서버 — Next 핸들러 + socket.io + /health (dev·production 동일 진입점)

import { createServer } from 'node:http';
import next from 'next';
import { attachSocket } from './src/server/socket';
import { isFieldMode } from './src/lib/env';

const port = Number(process.env.PORT || 3100);
const dev = process.env.NODE_ENV !== 'production';

const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer((req, res) => {
    // /health 는 Next·인증을 거치지 않는 즉답 경로 (진단용)
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          status: 'ok',
          mode: dev ? 'dev' : 'production',
          fieldMode: isFieldMode(),
          uptimeSec: Math.round(process.uptime()),
        }),
      );
      return;
    }
    void handle(req, res);
  });

  attachSocket(server);

  server.listen(port, () => {
    console.log(
      `[unoworship-pro] ${dev ? 'dev' : 'production'} 서버 기동 — http://localhost:${port} (fieldMode=${isFieldMode()})`,
    );
  });
});
