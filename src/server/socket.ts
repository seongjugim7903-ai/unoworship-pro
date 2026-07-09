// socket.io 초기화 + Phase 0 에코 핸들러 — 서버(server.ts)와 계약 테스트가 공용으로 사용

import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';

/** http 서버에 socket.io를 부착한다. websocket 전용(폴링 업그레이드 없음 — LAN 최소 지연). */
export function attachSocket(server: HttpServer): Server {
  const io = new Server(server, { transports: ['websocket'] });

  io.on('connection', (socket) => {
    // Phase 0 검증용 에코 — ack 콜백이 있으면 ack로, 없으면 같은 이벤트로 반사
    socket.on('echo', (payload: unknown, ack?: (v: unknown) => void) => {
      if (typeof ack === 'function') ack(payload);
      else socket.emit('echo', payload);
    });
  });

  return io;
}
