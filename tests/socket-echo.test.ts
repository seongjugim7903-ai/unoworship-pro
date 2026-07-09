// Phase 0 계약 테스트 — socket.io 에코 왕복 (attachSocket 서버·테스트 공용 구현 검증)

import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { io as connectClient, type Socket } from 'socket.io-client';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { attachSocket } from '../src/server/socket';

let server: HttpServer;
let client: Socket;

beforeAll(async () => {
  server = createServer();
  attachSocket(server);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  client = connectClient(`http://localhost:${port}`, { transports: ['websocket'] });
  await new Promise<void>((resolve) => client.on('connect', () => resolve()));
});

afterAll(async () => {
  client.disconnect();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

test('에코: ack 콜백으로 페이로드가 그대로 돌아온다', async () => {
  const payload = { type: 'PING', at: 123, text: '주 하나님 지으신 모든 세계' };
  const echoed = await new Promise((resolve) => client.emit('echo', payload, resolve));
  expect(echoed).toEqual(payload);
});

test('에코: ack 없이 보내면 같은 이벤트로 반사된다', async () => {
  const payload = 'blackout';
  const echoed = await new Promise((resolve) => {
    client.once('echo', resolve);
    client.emit('echo', payload);
  });
  expect(echoed).toBe(payload);
});
