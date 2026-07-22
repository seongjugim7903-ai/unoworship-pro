'use client';

/**
 * hooks/useAtemStatus.ts
 * ATEM 브릿지 상태 폴링 훅 — /media/broadcast 대시보드 전용
 *
 * [FEATURE: BROADCAST_VIEWER]
 *
 * /api/atem GET 엔드포인트를 3초 주기로 호출해 AtemBridge 상태를 가져옵니다.
 * WebSocket 대신 폴링을 사용하는 이유:
 *   - 상태 변화가 드물어(연결/해제/DSK 토글) 폴링 비용이 매우 낮음
 *   - atem-connection 은 서버 전용이므로 브라우저에 이벤트를 push 하려면
 *     별도 Socket.io 이벤트 확장이 필요 → Phase 2C+ 에서 고려
 *
 * 반환:
 *   - status   : AtemBridgeStatus | null (아직 한 번도 폴링 성공 못 했을 때 null)
 *   - error    : 네트워크 오류 메시지
 *   - refetch  : 수동 재조회
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { AtemBridgeStatus, AtemBridgeConfig } from '@/lib/atemBridge';

export interface AtemApiResponse {
  status: AtemBridgeStatus;
  config: AtemBridgeConfig;
}

export interface UseAtemStatusResult {
  status: AtemBridgeStatus | null;
  config: AtemBridgeConfig | null;
  error: string | null;
  refetch: () => Promise<void>;
}

const POLL_INTERVAL_MS = 3000;

export function useAtemStatus(): UseAtemStatusResult {
  const [status, setStatus] = useState<AtemBridgeStatus | null>(null);
  const [config, setConfig] = useState<AtemBridgeConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/atem', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as AtemApiResponse;
      if (!mountedRef.current) return;
      setStatus(data.status);
      setConfig(data.config);
      setError(null);
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    fetchStatus(); // 즉시 1회
    const id = setInterval(fetchStatus, POLL_INTERVAL_MS);
    return () => {
      mountedRef.current = false;
      clearInterval(id);
    };
  }, [fetchStatus]);

  return { status, config, error, refetch: fetchStatus };
}
