// 시퀀스 타이밍 일괄 조작 순수 함수 — 순차 배치 · 번호 재정렬 · 순서 교환

import { CanvasElement, MotionConfig } from '@/lib/canvasTypes';

export interface MotionUpdate {
  id: string;
  motion: MotionConfig;
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

/** 시퀀스가 부여된 요소를 번호순으로 정렬해 반환 */
export function getSequencedElements(elements: CanvasElement[]): CanvasElement[] {
  return elements
    .filter((el) => el.motion && (el.motion.sequence ?? 0) > 0)
    .sort((a, b) => (a.motion!.sequence ?? 0) - (b.motion!.sequence ?? 0));
}

export interface StaggerOptions {
  /** 요소 간 시작 시간 간격 (초) */
  interval: number;
  /** 각 요소의 전환 길이 (초) */
  duration: number;
}

/** 시퀀스 순서대로 시작/종료 시간을 자동 배치 */
export function staggerSequence(elements: CanvasElement[], opts: StaggerOptions): MotionUpdate[] {
  return getSequencedElements(elements).map((el, i) => {
    const startTime = round1(i * opts.interval);
    const endTime = round1(startTime + Math.max(0.1, opts.duration));
    return {
      id: el.id,
      motion: { ...el.motion!, startTime, endTime, duration: endTime - startTime },
    };
  });
}

/** 번호 구멍(1,3,4…)을 1..n으로 압축 (순서는 보존) */
export function compactSequences(elements: CanvasElement[]): MotionUpdate[] {
  const updates: MotionUpdate[] = [];
  getSequencedElements(elements).forEach((el, i) => {
    const next = i + 1;
    if ((el.motion!.sequence ?? 0) !== next) {
      updates.push({ id: el.id, motion: { ...el.motion!, sequence: next } });
    }
  });
  return updates;
}

/** 두 요소의 시퀀스 번호를 맞바꿈 */
export function swapSequence(a: CanvasElement, b: CanvasElement): MotionUpdate[] {
  if (!a.motion || !b.motion) return [];
  return [
    { id: a.id, motion: { ...a.motion, sequence: b.motion.sequence ?? 0 } },
    { id: b.id, motion: { ...b.motion, sequence: a.motion.sequence ?? 0 } },
  ];
}
