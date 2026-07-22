'use client';

/**
 * useRecording.ts
 * 녹화 훅 — 브라우저 단독 녹화
 *
 * 현재 로컬 파일 녹화 파이프라인은 미구현이다.
 * UI는 준비 중 상태를 명시하고, 실제 녹화 상태를 켜지 않는다.
 */

import { useCallback } from 'react';
import { useBroadcastStore } from '@/lib/broadcast/broadcastStore';

const RECORDING_UNAVAILABLE_REASON = '로컬 파일 녹화는 아직 구현 전입니다.';

export function useRecording() {
  const settings = useBroadcastStore((s) => s.recordingSettings);

  const start = useCallback(() => {
    console.warn(`[useRecording] ${RECORDING_UNAVAILABLE_REASON}`);
    return false;
  }, []);

  const stop = useCallback(() => {
    return false;
  }, []);

  const toggle = useCallback(() => {
    return start();
  }, [start]);

  return {
    isAvailable: false,
    unavailableReason: RECORDING_UNAVAILABLE_REASON,
    isRecording: false,
    elapsed: 0,
    elapsedFormatted: '00:00',
    settings,
    start,
    stop,
    toggle,
  };
}
