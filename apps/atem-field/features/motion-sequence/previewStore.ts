'use client';

// 모션 미리보기 재생 상태 — 에디터 내 로컬 재생 전용 (송출 경로와 완전 분리)

import { useSyncExternalStore } from 'react';

export type MotionPreviewState = {
  playing: boolean;
  /** performance.now()/1000 기준 재생 시작 시각 */
  startedAt: number;
};

let state: MotionPreviewState = { playing: false, startedAt: 0 };
const listeners = new Set<() => void>();

function notify(next: MotionPreviewState) {
  state = next;
  listeners.forEach((fn) => fn());
}

export function startMotionPreview(): void {
  notify({ playing: true, startedAt: performance.now() / 1000 });
}

export function stopMotionPreview(): void {
  if (!state.playing) return;
  notify({ playing: false, startedAt: 0 });
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

function getSnapshot(): MotionPreviewState {
  return state;
}

export function useMotionPreview(): MotionPreviewState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
