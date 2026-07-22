/**
 * elementSnap.ts
 * 요소 간(element-to-element) 스냅 & 정렬 가이드라인 로직
 *
 * 피그마처럼 드래그 중인 요소의 바운딩 박스 가장자리/센터가
 * 다른 요소의 바운딩 박스 가장자리/센터와 수직·수평 정렬될 때
 * 자동으로 스냅하고 가이드라인 정보를 반환한다.
 *
 * ── 피그마 스타일 동작 ──
 * 1) 각 축(X/Y)에서 드래그 요소의 3개 기준점(left/center/right, top/center/bottom)을
 *    모든 타 요소의 3개 기준점과 비교
 * 2) 가장 가까운 매칭 하나를 선택하여 스냅 (nearest-edge-first)
 * 3) 스냅 후 해당 위치에 정렬된 모든 요소의 범위를 수집하여 가이드라인 생성
 * 4) 가이드라인은 정렬된 요소들의 top~bottom (또는 left~right) 전체를 커버
 */

import { CanvasElement } from '@/lib/canvasTypes';

// ─────────────────────────────────────────
// 설정
// ─────────────────────────────────────────
/** 요소 간 스냅 감도 (% 단위) — 피그마 수준 */
export const ELEMENT_SNAP_THRESHOLD = 1.0;

/** 스냅 확정 후 가이드라인 매칭 허용 오차 */
const GUIDE_MATCH_TOLERANCE = 0.05;

// ─────────────────────────────────────────
// 타입 정의
// ─────────────────────────────────────────
/** 화면에 그릴 가이드라인 한 줄 */
export interface AlignGuideLine {
  /** 수직선이면 'vertical', 수평선이면 'horizontal' */
  axis: 'vertical' | 'horizontal';
  /** 해당 축의 위치 (%) — vertical이면 x좌표, horizontal이면 y좌표 */
  position: number;
  /** 가이드라인이 그려질 시작 (%) — vertical이면 y시작, horizontal이면 x시작 */
  start: number;
  /** 가이드라인이 그려질 끝 (%) */
  end: number;
}

/** 요소 간 간격 표시 가이드 (피그마 스타일) */
export interface SpacingGuide {
  axis: 'horizontal' | 'vertical';
  /** 간격 영역의 시작 좌표 (%) — horizontal이면 x, vertical이면 y */
  gapStart: number;
  /** 간격 영역의 끝 좌표 (%) */
  gapEnd: number;
  /** 교차 축에서 표시할 위치 (%) — 요소들의 중앙 */
  crossPosition: number;
  /** 교차 축 영역 시작 (%) — 간격 채움 영역의 범위 */
  crossStart: number;
  /** 교차 축 영역 끝 (%) */
  crossEnd: number;
  /** 간격 거리 (%) */
  distance: number;
}

/** 요소 간 스냅 결과 */
export interface ElementSnapResult {
  /** 스냅 적용된 x 좌표 (%) */
  x: number;
  /** 스냅 적용된 y 좌표 (%) */
  y: number;
  /** 화면에 표시할 가이드라인 목록 */
  guides: AlignGuideLine[];
  /** 간격 가이드 (피그마 균등 분배 스냅) */
  spacingGuides: SpacingGuide[];
}

// ─────────────────────────────────────────
// 내부 헬퍼: 요소의 기준선 추출
// ─────────────────────────────────────────
interface ElementEdges {
  left: number;
  centerX: number;
  right: number;
  top: number;
  centerY: number;
  bottom: number;
}

function getEdges(el: { x: number; y: number; width: number; height: number }): ElementEdges {
  return {
    left: el.x,
    centerX: el.x + el.width / 2,
    right: el.x + el.width,
    top: el.y,
    centerY: el.y + el.height / 2,
    bottom: el.y + el.height,
  };
}

// ─────────────────────────────────────────
// 스냅 후보 타입
// ─────────────────────────────────────────
interface SnapCandidate {
  /** 보정값: rawPosition + delta = targetPosition */
  delta: number;
  /** 절대 거리 */
  dist: number;
  /** 스냅 대상 좌표 값 (%) */
  targetPos: number;
  /** 타 요소의 교차 축 범위 시작 */
  otherCrossStart: number;
  /** 타 요소의 교차 축 범위 끝 */
  otherCrossEnd: number;
}

// ─────────────────────────────────────────
// 메인 함수
// ─────────────────────────────────────────
/**
 * 드래그 중인 요소를 다른 요소들의 바운딩 박스에 스냅
 *
 * @param rawX      드래그 중인 요소의 raw x (%)
 * @param rawY      드래그 중인 요소의 raw y (%)
 * @param dragW     드래그 중인 요소의 너비 (%)
 * @param dragH     드래그 중인 요소의 높이 (%)
 * @param dragId    드래그 중인 요소의 id (자기 자신 제외)
 * @param allElements 캔버스 위의 모든 요소
 * @returns 스냅 적용된 좌표 + 가이드라인 정보
 */
export function snapToElements(
  rawX: number,
  rawY: number,
  dragW: number,
  dragH: number,
  dragId: string,
  allElements: CanvasElement[],
): ElementSnapResult {
  const others = allElements.filter(
    (el) => el.id !== dragId && el.visible !== false,
  );

  if (others.length === 0) {
    return { x: rawX, y: rawY, guides: [], spacingGuides: [] };
  }

  // 드래그 요소의 기준선 (raw 위치 기반)
  const dragEdges = getEdges({ x: rawX, y: rawY, width: dragW, height: dragH });

  // 드래그 요소의 기준점들
  const dragXPoints = [dragEdges.left, dragEdges.centerX, dragEdges.right];
  const dragYPoints = [dragEdges.top, dragEdges.centerY, dragEdges.bottom];

  // ── 각 축에서 가장 가까운 스냅 후보 찾기 ──
  let bestX: SnapCandidate | null = null;
  let bestY: SnapCandidate | null = null;

  // 모든 후보 수집 (가이드라인 생성에 필요)
  const allXCandidates: SnapCandidate[] = [];
  const allYCandidates: SnapCandidate[] = [];

  for (const other of others) {
    const oe = getEdges(other);
    const otherXPoints = [oe.left, oe.centerX, oe.right];
    const otherYPoints = [oe.top, oe.centerY, oe.bottom];

    // ── 수직 정렬 (X축): 드래그 요소의 left/center/right ↔ 타 요소의 left/center/right ──
    for (const dp of dragXPoints) {
      for (const op of otherXPoints) {
        const dist = Math.abs(dp - op);
        if (dist < ELEMENT_SNAP_THRESHOLD) {
          const candidate: SnapCandidate = {
            delta: op - dp,
            dist,
            targetPos: op,
            otherCrossStart: oe.top,
            otherCrossEnd: oe.bottom,
          };
          allXCandidates.push(candidate);
          if (!bestX || dist < bestX.dist) {
            bestX = candidate;
          }
        }
      }
    }

    // ── 수평 정렬 (Y축): 드래그 요소의 top/center/bottom ↔ 타 요소의 top/center/bottom ──
    for (const dp of dragYPoints) {
      for (const op of otherYPoints) {
        const dist = Math.abs(dp - op);
        if (dist < ELEMENT_SNAP_THRESHOLD) {
          const candidate: SnapCandidate = {
            delta: op - dp,
            dist,
            targetPos: op,
            otherCrossStart: oe.left,
            otherCrossEnd: oe.right,
          };
          allYCandidates.push(candidate);
          if (!bestY || dist < bestY.dist) {
            bestY = candidate;
          }
        }
      }
    }
  }

  // ── 스냅 적용 ──
  const snappedX = bestX ? rawX + bestX.delta : rawX;
  const snappedY = bestY ? rawY + bestY.delta : rawY;

  // ── 가이드라인 생성 ──
  const guides: AlignGuideLine[] = [];

  if (bestX) {
    const snappedDragEdges = getEdges({ x: snappedX, y: snappedY, width: dragW, height: dragH });

    // 스냅 후 실제로 정렬된 X 위치들 수집
    const alignedPositions = new Set<number>();
    const snappedDragXPoints = [snappedDragEdges.left, snappedDragEdges.centerX, snappedDragEdges.right];

    for (const sdp of snappedDragXPoints) {
      for (const c of allXCandidates) {
        if (Math.abs(sdp - c.targetPos) < GUIDE_MATCH_TOLERANCE) {
          alignedPositions.add(c.targetPos);
        }
      }
    }

    // 각 정렬 위치에 대해 가이드라인 생성
    for (const pos of alignedPositions) {
      let minY = snappedDragEdges.top;
      let maxY = snappedDragEdges.bottom;

      for (const c of allXCandidates) {
        if (Math.abs(c.targetPos - pos) < GUIDE_MATCH_TOLERANCE) {
          minY = Math.min(minY, c.otherCrossStart);
          maxY = Math.max(maxY, c.otherCrossEnd);
        }
      }
      guides.push({ axis: 'vertical', position: pos, start: minY, end: maxY });
    }
  }

  if (bestY) {
    const snappedDragEdges = getEdges({ x: snappedX, y: snappedY, width: dragW, height: dragH });

    const alignedPositions = new Set<number>();
    const snappedDragYPoints = [snappedDragEdges.top, snappedDragEdges.centerY, snappedDragEdges.bottom];

    for (const sdp of snappedDragYPoints) {
      for (const c of allYCandidates) {
        if (Math.abs(sdp - c.targetPos) < GUIDE_MATCH_TOLERANCE) {
          alignedPositions.add(c.targetPos);
        }
      }
    }

    for (const pos of alignedPositions) {
      let minX = snappedDragEdges.left;
      let maxX = snappedDragEdges.right;

      for (const c of allYCandidates) {
        if (Math.abs(c.targetPos - pos) < GUIDE_MATCH_TOLERANCE) {
          minX = Math.min(minX, c.otherCrossStart);
          maxX = Math.max(maxX, c.otherCrossEnd);
        }
      }
      guides.push({ axis: 'horizontal', position: pos, start: minX, end: maxX });
    }
  }

  // ── 간격 균등 스냅 (피그마 스타일) ──
  const spacingGuides: SpacingGuide[] = [];
  const spacingSnap = snapToEqualSpacing(
    snappedX, snappedY, dragW, dragH, dragId, allElements,
  );
  if (spacingSnap) {
    if (spacingSnap.axis === 'horizontal' && !bestX) {
      // X축 간격 스냅 (align snap이 없을 때만)
      return { x: spacingSnap.snappedX, y: snappedY, guides, spacingGuides: spacingSnap.guides };
    } else if (spacingSnap.axis === 'vertical' && !bestY) {
      return { x: snappedX, y: spacingSnap.snappedY, guides, spacingGuides: spacingSnap.guides };
    } else if (spacingSnap.axis === 'horizontal') {
      return { x: spacingSnap.snappedX, y: snappedY, guides, spacingGuides: spacingSnap.guides };
    } else {
      return { x: snappedX, y: spacingSnap.snappedY, guides, spacingGuides: spacingSnap.guides };
    }
  }

  return { x: snappedX, y: snappedY, guides, spacingGuides };
}

// ─────────────────────────────────────────
// 간격 균등 스냅
// ─────────────────────────────────────────
/** 간격 스냅 감도 (%) */
const SPACING_SNAP_THRESHOLD = 1.2;

interface SpacingSnapResult {
  axis: 'horizontal' | 'vertical';
  snappedX: number;
  snappedY: number;
  guides: SpacingGuide[];
}

/**
 * 피그마 스타일 간격 균등 스냅
 * 드래그 중인 요소가 다른 두 요소 사이에 있을 때,
 * 양쪽 간격이 동일해지는 위치로 스냅
 */
function snapToEqualSpacing(
  rawX: number, rawY: number,
  dragW: number, dragH: number,
  dragId: string,
  allElements: CanvasElement[],
): SpacingSnapResult | null {
  const others = allElements.filter((el) => el.id !== dragId && el.visible !== false);
  if (others.length < 2) return null;

  const dragEdges = getEdges({ x: rawX, y: rawY, width: dragW, height: dragH });

  // ── 수평(X축) 간격 스냅 ──
  // 드래그 요소와 Y축으로 겹치는(또는 가까운) 요소만 대상
  const hOverlapping = others.filter((el) => {
    const oe = getEdges(el);
    return oe.bottom > dragEdges.top - 5 && oe.top < dragEdges.bottom + 5;
  });

  const hResult = findEqualSpacingOnAxis(
    rawX, dragW, dragEdges.centerY, dragEdges.top, dragEdges.bottom,
    hOverlapping, 'horizontal',
  );

  // ── 수직(Y축) 간격 스냅 ──
  const vOverlapping = others.filter((el) => {
    const oe = getEdges(el);
    return oe.right > dragEdges.left - 5 && oe.left < dragEdges.right + 5;
  });

  const vResult = findEqualSpacingOnAxis(
    rawY, dragH, dragEdges.centerX, dragEdges.left, dragEdges.right,
    vOverlapping, 'vertical',
  );

  // 더 가까운 축 선택
  if (hResult && vResult) {
    return hResult.dist < vResult.dist ? hResult.result : vResult.result;
  }
  if (hResult) return hResult.result;
  if (vResult) return vResult.result;
  return null;
}

function findEqualSpacingOnAxis(
  rawPos: number, dragSize: number, crossCenter: number,
  dragCrossStart: number, dragCrossEnd: number,
  candidates: CanvasElement[],
  axis: 'horizontal' | 'vertical',
): { dist: number; result: SpacingSnapResult } | null {
  if (candidates.length < 2) return null;

  const isH = axis === 'horizontal';

  // 축 방향으로 정렬된 요소 목록 (시작 좌표 기준)
  type Interval = { start: number; end: number; center: number; crossCenter: number; crossStart: number; crossEnd: number };
  const intervals: Interval[] = candidates.map((el) => {
    const e = getEdges(el);
    return isH
      ? { start: e.left, end: e.right, center: e.centerX, crossCenter: e.centerY, crossStart: e.top, crossEnd: e.bottom }
      : { start: e.top, end: e.bottom, center: e.centerY, crossCenter: e.centerX, crossStart: e.left, crossEnd: e.right };
  }).sort((a, b) => a.start - b.start);

  const dragStart = rawPos;
  const dragEnd = rawPos + dragSize;
  const dragCenter = rawPos + dragSize / 2;

  let bestDist = SPACING_SNAP_THRESHOLD;
  let bestResult: SpacingSnapResult | null = null;

  // 왼(위)쪽 이웃과 오른(아래)쪽 이웃 찾기
  for (let i = 0; i < intervals.length; i++) {
    for (let j = i + 1; j < intervals.length; j++) {
      const left = intervals[i];
      const right = intervals[j];

      // 드래그 요소가 left와 right 사이에 있어야 함
      if (left.end > dragStart + dragSize * 0.5) continue; // left가 드래그 뒤에
      if (right.start < dragEnd - dragSize * 0.5) continue; // right가 드래그 앞에

      // 균등 간격 계산: 양쪽 gap이 같아지는 위치
      // gap_left = dragStart - left.end
      // gap_right = right.start - dragEnd
      // 균등: gap_left === gap_right
      // dragStart - left.end = right.start - (dragStart + dragSize)
      // 2*dragStart = left.end + right.start - dragSize
      const equalPos = (left.end + right.start - dragSize) / 2;
      const dist = Math.abs(rawPos - equalPos);

      if (dist < bestDist) {
        bestDist = dist;
        const gapSize = equalPos - left.end;
        const guides: SpacingGuide[] = [];

        const crossPos = crossCenter;
        // 교차 축 범위: 드래그 요소와 이웃 요소의 교차 영역
        const leftCrossOverlapStart = Math.max(dragCrossStart, left.crossStart);
        const leftCrossOverlapEnd = Math.min(dragCrossEnd, left.crossEnd);
        const rightCrossOverlapStart = Math.max(dragCrossStart, right.crossStart);
        const rightCrossOverlapEnd = Math.min(dragCrossEnd, right.crossEnd);

        // 왼쪽(위) 간격
        guides.push({
          axis,
          gapStart: left.end,
          gapEnd: equalPos,
          crossPosition: crossPos,
          crossStart: leftCrossOverlapStart < leftCrossOverlapEnd ? leftCrossOverlapStart : dragCrossStart,
          crossEnd: leftCrossOverlapStart < leftCrossOverlapEnd ? leftCrossOverlapEnd : dragCrossEnd,
          distance: gapSize,
        });
        // 오른쪽(아래) 간격
        guides.push({
          axis,
          gapStart: equalPos + dragSize,
          gapEnd: right.start,
          crossPosition: crossPos,
          crossStart: rightCrossOverlapStart < rightCrossOverlapEnd ? rightCrossOverlapStart : dragCrossStart,
          crossEnd: rightCrossOverlapStart < rightCrossOverlapEnd ? rightCrossOverlapEnd : dragCrossEnd,
          distance: gapSize,
        });

        bestResult = {
          axis,
          snappedX: isH ? equalPos : rawPos,
          snappedY: isH ? rawPos : equalPos,
          guides,
        };
      }
    }
  }

  // 또한: 3개 이상 요소가 이미 균등 간격이면, 드래그 요소도 그 간격에 맞춤
  // 연속된 요소 쌍들의 간격을 측정하여 기존 간격에 스냅
  if (intervals.length >= 2) {
    // 기존 요소들 사이의 간격 수집
    const existingGaps: { gap: number; afterEnd: number; beforeStart: number; idx: number }[] = [];
    for (let i = 0; i < intervals.length - 1; i++) {
      const gap = intervals[i + 1].start - intervals[i].end;
      if (gap > 0.5) { // 의미 있는 간격만
        existingGaps.push({ gap, afterEnd: intervals[i].end, beforeStart: intervals[i + 1].start, idx: i });
      }
    }

    // 드래그 요소가 한 요소의 바로 옆에 위치할 때, 기존 간격과 같은 거리로 스냅
    for (const eg of existingGaps) {
      // 드래그 요소가 마지막 요소의 오른쪽에 위치 시도
      for (const interval of intervals) {
        // interval의 오른쪽에 same gap으로 배치
        const snapPos = interval.end + eg.gap;
        const dist = Math.abs(rawPos - snapPos);
        if (dist < bestDist && dist < SPACING_SNAP_THRESHOLD) {
          // 실제로 옆에 있는지 확인 (겹치면 안 됨)
          const snapEnd = snapPos + dragSize;
          const nextEl = intervals.find((iv) => iv.start > interval.end && iv.start < snapEnd + eg.gap * 0.5);
          if (!nextEl || Math.abs(nextEl.start - snapEnd) < SPACING_SNAP_THRESHOLD) {
            bestDist = dist;
            const guides: SpacingGuide[] = [{
              axis,
              gapStart: interval.end,
              gapEnd: snapPos,
              crossPosition: crossCenter,
              crossStart: Math.max(dragCrossStart, interval.crossStart),
              crossEnd: Math.min(dragCrossEnd, interval.crossEnd),
              distance: eg.gap,
            }];
            // 원래 간격도 표시
            const egLeft = intervals[eg.idx];
            const egRight = intervals[eg.idx + 1];
            guides.push({
              axis,
              gapStart: eg.afterEnd,
              gapEnd: eg.beforeStart,
              crossPosition: crossCenter,
              crossStart: Math.max(egLeft.crossStart, egRight.crossStart),
              crossEnd: Math.min(egLeft.crossEnd, egRight.crossEnd),
              distance: eg.gap,
            });

            bestResult = {
              axis,
              snappedX: isH ? snapPos : rawPos,
              snappedY: isH ? rawPos : snapPos,
              guides,
            };
          }
        }

        // interval의 왼쪽에 same gap으로 배치
        const snapPosLeft = interval.start - eg.gap - dragSize;
        const distLeft = Math.abs(rawPos - snapPosLeft);
        if (distLeft < bestDist && distLeft < SPACING_SNAP_THRESHOLD) {
          const snapStart = snapPosLeft;
          const prevEl = intervals.find((iv) => iv.end < interval.start && iv.end > snapStart - eg.gap * 0.5);
          if (!prevEl || Math.abs(snapStart - prevEl.end) > SPACING_SNAP_THRESHOLD * 0.5) {
            bestDist = distLeft;
            const egLeft = intervals[eg.idx];
            const egRight = intervals[eg.idx + 1];
            const guides: SpacingGuide[] = [{
              axis,
              gapStart: snapPosLeft + dragSize,
              gapEnd: interval.start,
              crossPosition: crossCenter,
              crossStart: Math.max(dragCrossStart, interval.crossStart),
              crossEnd: Math.min(dragCrossEnd, interval.crossEnd),
              distance: eg.gap,
            }];
            guides.push({
              axis,
              gapStart: eg.afterEnd,
              gapEnd: eg.beforeStart,
              crossPosition: crossCenter,
              crossStart: Math.max(egLeft.crossStart, egRight.crossStart),
              crossEnd: Math.min(egLeft.crossEnd, egRight.crossEnd),
              distance: eg.gap,
            });

            bestResult = {
              axis,
              snappedX: isH ? snapPosLeft : rawPos,
              snappedY: isH ? rawPos : snapPosLeft,
              guides,
            };
          }
        }
      }
    }
  }

  if (!bestResult) return null;
  return { dist: bestDist, result: bestResult };
}
