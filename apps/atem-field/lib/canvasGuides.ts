/**
 * canvasGuides.ts
 * 에디터 캔버스 가이드라인 & 스냅 유틸리티
 *
 * - 가로/세로 센터라인
 * - 안전 영역 (Title Safe / Action Safe)
 * - 요소 센터 → 캔버스 센터 자석 스냅
 */

// ─────────────────────────────────────────
// 스냅 설정
// ─────────────────────────────────────────
/** 스냅이 발동되는 거리 (% 단위) */
export const SNAP_THRESHOLD = 1.2;

/** 스냅 결과 */
export interface SnapResult {
  x: number;
  y: number;
  /** 가로 센터에 스냅됨 */
  snappedCenterX: boolean;
  /** 세로 센터에 스냅됨 */
  snappedCenterY: boolean;
  /** 왼쪽 가장자리 스냅 */
  snappedLeft: boolean;
  /** 오른쪽 가장자리 스냅 */
  snappedRight: boolean;
  /** 위쪽 가장자리 스냅 */
  snappedTop: boolean;
  /** 아래쪽 가장자리 스냅 */
  snappedBottom: boolean;
}

/**
 * 요소의 이동 위치를 캔버스 가이드에 스냅
 * @param x 요소 좌상단 x (%)
 * @param y 요소 좌상단 y (%)
 * @param w 요소 너비 (%)
 * @param h 요소 높이 (%)
 * @returns 스냅 적용된 좌표 + 어떤 가이드에 스냅됐는지 정보
 */
export function snapToGuides(
  x: number,
  y: number,
  w: number,
  h: number,
): SnapResult {
  let snappedX = x;
  let snappedY = y;
  let snappedCenterX = false;
  let snappedCenterY = false;
  let snappedLeft = false;
  let snappedRight = false;
  let snappedTop = false;
  let snappedBottom = false;

  // 요소의 센터
  const elCenterX = x + w / 2;
  const elCenterY = y + h / 2;

  // 캔버스 센터 (50%)
  const canvasCX = 50;
  const canvasCY = 50;

  // ── 센터라인 스냅 ──
  if (Math.abs(elCenterX - canvasCX) < SNAP_THRESHOLD) {
    snappedX = canvasCX - w / 2;
    snappedCenterX = true;
  }
  if (Math.abs(elCenterY - canvasCY) < SNAP_THRESHOLD) {
    snappedY = canvasCY - h / 2;
    snappedCenterY = true;
  }

  // ── 안전 영역 가장자리 스냅 (Title Safe 10%) ──
  const SAFE = 10; // Title Safe %

  // 왼쪽 가장자리
  if (!snappedCenterX && Math.abs(x - SAFE) < SNAP_THRESHOLD) {
    snappedX = SAFE;
    snappedLeft = true;
  }
  // 오른쪽 가장자리
  if (!snappedCenterX && Math.abs((x + w) - (100 - SAFE)) < SNAP_THRESHOLD) {
    snappedX = (100 - SAFE) - w;
    snappedRight = true;
  }
  // 위쪽 가장자리
  if (!snappedCenterY && Math.abs(y - SAFE) < SNAP_THRESHOLD) {
    snappedY = SAFE;
    snappedTop = true;
  }
  // 아래쪽 가장자리
  if (!snappedCenterY && Math.abs((y + h) - (100 - SAFE)) < SNAP_THRESHOLD) {
    snappedY = (100 - SAFE) - h;
    snappedBottom = true;
  }

  return {
    x: snappedX,
    y: snappedY,
    snappedCenterX,
    snappedCenterY,
    snappedLeft,
    snappedRight,
    snappedTop,
    snappedBottom,
  };
}
