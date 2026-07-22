/**
 * alignActions.ts
 * 캔버스 요소 정렬 · 균등분배 순수함수
 *
 * 모든 좌표는 캔버스 % 기준 (0~100)
 * React / Store 의존성 없음
 */

import type { CanvasElement } from '@/lib/canvasTypes';

// ─────────────────────────────────────────
// 반환 타입
// ─────────────────────────────────────────
export interface AlignUpdate {
  id: string;
  x: number;
  y: number;
}

// ─────────────────────────────────────────
// 수평 정렬 (Horizontal Align)
// ─────────────────────────────────────────

/** 좌측 정렬 — 모든 요소의 x = min(x) */
export function alignLeft(elements: CanvasElement[]): AlignUpdate[] {
  if (elements.length < 2) return [];
  const minX = Math.min(...elements.map((el) => el.x));
  return elements.map((el) => ({ id: el.id, x: minX, y: el.y }));
}

/** 수평 중앙 정렬 — 모든 요소의 centerX = avg(centerX) */
export function alignCenterH(elements: CanvasElement[]): AlignUpdate[] {
  if (elements.length < 2) return [];
  const avgCenterX =
    elements.reduce((sum, el) => sum + el.x + el.width / 2, 0) / elements.length;
  return elements.map((el) => ({
    id: el.id,
    x: avgCenterX - el.width / 2,
    y: el.y,
  }));
}

/** 우측 정렬 — 모든 요소의 right = max(right) */
export function alignRight(elements: CanvasElement[]): AlignUpdate[] {
  if (elements.length < 2) return [];
  const maxRight = Math.max(...elements.map((el) => el.x + el.width));
  return elements.map((el) => ({
    id: el.id,
    x: maxRight - el.width,
    y: el.y,
  }));
}

// ─────────────────────────────────────────
// 수직 정렬 (Vertical Align)
// ─────────────────────────────────────────

/** 상단 정렬 — 모든 요소의 y = min(y) */
export function alignTop(elements: CanvasElement[]): AlignUpdate[] {
  if (elements.length < 2) return [];
  const minY = Math.min(...elements.map((el) => el.y));
  return elements.map((el) => ({ id: el.id, x: el.x, y: minY }));
}

/** 수직 중앙 정렬 — 모든 요소의 centerY = avg(centerY) */
export function alignMiddleV(elements: CanvasElement[]): AlignUpdate[] {
  if (elements.length < 2) return [];
  const avgCenterY =
    elements.reduce((sum, el) => sum + el.y + el.height / 2, 0) / elements.length;
  return elements.map((el) => ({
    id: el.id,
    x: el.x,
    y: avgCenterY - el.height / 2,
  }));
}

/** 하단 정렬 — 모든 요소의 bottom = max(bottom) */
export function alignBottom(elements: CanvasElement[]): AlignUpdate[] {
  if (elements.length < 2) return [];
  const maxBottom = Math.max(...elements.map((el) => el.y + el.height));
  return elements.map((el) => ({
    id: el.id,
    x: el.x,
    y: maxBottom - el.height,
  }));
}

// ─────────────────────────────────────────
// 균등분배 (Distribute)
// ─────────────────────────────────────────

/** 가로 균등분배 — 첫/끝 요소 고정, 중간 요소 가로 간격 균등 */
export function distributeH(elements: CanvasElement[]): AlignUpdate[] {
  if (elements.length < 3) return [];

  const sorted = [...elements].sort((a, b) => a.x - b.x);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];

  const totalSpan = (last.x + last.width) - first.x;
  const sumWidths = sorted.reduce((sum, el) => sum + el.width, 0);
  const gap = (totalSpan - sumWidths) / (sorted.length - 1);

  let currentX = first.x;
  return sorted.map((el, i) => {
    const update: AlignUpdate = { id: el.id, x: currentX, y: el.y };
    currentX += el.width + gap;
    // 첫/끝 요소는 원래 위치 유지
    if (i === 0) update.x = first.x;
    if (i === sorted.length - 1) update.x = last.x;
    return update;
  });
}

/** 세로 균등분배 — 첫/끝 요소 고정, 중간 요소 세로 간격 균등 */
export function distributeV(elements: CanvasElement[]): AlignUpdate[] {
  if (elements.length < 3) return [];

  const sorted = [...elements].sort((a, b) => a.y - b.y);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];

  const totalSpan = (last.y + last.height) - first.y;
  const sumHeights = sorted.reduce((sum, el) => sum + el.height, 0);
  const gap = (totalSpan - sumHeights) / (sorted.length - 1);

  let currentY = first.y;
  return sorted.map((el, i) => {
    const update: AlignUpdate = { id: el.id, x: el.x, y: currentY };
    currentY += el.height + gap;
    if (i === 0) update.y = first.y;
    if (i === sorted.length - 1) update.y = last.y;
    return update;
  });
}
