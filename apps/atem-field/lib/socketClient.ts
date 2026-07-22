/**
 * lib/socketClient.ts
 * Socket.io 클라이언트 싱글턴
 *
 * [FEATURE: SOCKET_IO]
 * ─ 클라이언트(브라우저) 전용 ─
 *
 * 역할:
 *   - 앱 전체에서 Socket.io 인스턴스를 단 하나만 유지 (싱글턴 패턴)
 *   - 서버 주소를 자동 감지 (현재 window.location.origin 기준)
 *   - SSR 환경에서는 null 반환 (서버 사이드 렌더링 안전)
 *
 * 사용:
 *   import { getSocket } from '@/lib/socketClient';
 *   const socket = getSocket();   // 항상 동일 인스턴스 반환
 */

import { io, Socket } from 'socket.io-client';

let socketInstance: Socket | null = null;

/**
 * Socket.io 클라이언트 싱글턴을 반환합니다.
 * 브라우저에서만 연결되며 SSR 시에는 null을 반환합니다.
 */
export function getSocket(): Socket | null {
  if (typeof window === 'undefined') return null;   // SSR 안전

  if (!socketInstance) {
    const serverUrl = window.location.origin;       // 현재 앱 서버에 연결
    // Electron preload 에서 주입한 기기 토큰. 없으면 서버가 연결을 거부한다.
    const deviceToken = (window as unknown as {
      unolive?: { device?: { token?: string | null } };
    }).unolive?.device?.token;

    socketInstance = io(serverUrl, {
      transports: ['websocket'],                    // WebSocket 전용 — polling 스킵으로 지연 최소화
      upgrade: false,                               // transport 업그레이드 불필요
      autoConnect: true,
      auth: deviceToken ? { deviceToken } : undefined,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 500,                       // 0.5초 후 재시도
      reconnectionDelayMax: 3000,
    });
  }

  return socketInstance;
}

/**
 * 테스트/SSR 등 특수 환경에서 싱글턴을 초기화합니다.
 * 일반 사용에서는 호출 불필요.
 */
export function resetSocket(): void {
  if (socketInstance) {
    socketInstance.disconnect();
    socketInstance = null;
  }
}
