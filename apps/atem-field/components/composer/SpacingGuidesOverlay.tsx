'use client';

/**
 * SpacingGuidesOverlay.tsx
 * 피그마 스타일 요소 간 간격 가이드 오버레이
 *
 * - 균등 간격 스냅 시 간격 영역에 빨간색 반투명 채움
 * - 간격 사이에 점선 + 거리(px) 숫자 뱃지 표시
 * - 양쪽 엔드캡으로 간격 범위 명확히 표시
 */

import React from 'react';
import { SpacingGuide } from '@/lib/elementSnap';

interface SpacingGuidesOverlayProps {
  guides: SpacingGuide[];
}

const GUIDE_COLOR = '#ff3366';
const FILL_COLOR = 'rgba(255, 51, 102, 0.08)';

export default function SpacingGuidesOverlay({ guides }: SpacingGuidesOverlayProps) {
  if (guides.length === 0) return null;

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 9992,
        overflow: 'hidden',
      }}
    >
      {guides.map((guide, i) => {
        const gapSize = Math.abs(guide.gapEnd - guide.gapStart);
        // 캔버스 기준 % → 1920×1080 px 환산
        const pxDistance = guide.axis === 'horizontal'
          ? Math.round(gapSize * 19.2)
          : Math.round(gapSize * 10.8);

        const crossSize = guide.crossEnd - guide.crossStart;

        if (guide.axis === 'horizontal') {
          const midX = (guide.gapStart + guide.gapEnd) / 2;
          const lineY = guide.crossPosition;

          return (
            <React.Fragment key={`spacing-h-${i}`}>
              {/* 간격 영역 빨간 반투명 채움 */}
              <div
                style={{
                  position: 'absolute',
                  left: `${guide.gapStart}%`,
                  top: `${guide.crossStart}%`,
                  width: `${gapSize}%`,
                  height: `${crossSize}%`,
                  background: FILL_COLOR,
                  borderLeft: `1px solid ${GUIDE_COLOR}`,
                  borderRight: `1px solid ${GUIDE_COLOR}`,
                }}
              />
              {/* 중앙 점선 */}
              <div
                style={{
                  position: 'absolute',
                  left: `${guide.gapStart}%`,
                  top: `${lineY}%`,
                  width: `${gapSize}%`,
                  height: 0,
                  borderTop: `1px dashed ${GUIDE_COLOR}`,
                  transform: 'translateY(-0.5px)',
                }}
              />
              {/* 거리 숫자 뱃지 */}
              <div
                style={{
                  position: 'absolute',
                  left: `${midX}%`,
                  top: `${lineY}%`,
                  transform: 'translate(-50%, -140%)',
                  background: GUIDE_COLOR,
                  color: '#fff',
                  fontSize: '9px',
                  fontWeight: 600,
                  padding: '1px 5px',
                  borderRadius: '3px',
                  whiteSpace: 'nowrap',
                  lineHeight: '1.4',
                  letterSpacing: '0.3px',
                }}
              >
                {pxDistance}
              </div>
            </React.Fragment>
          );
        } else {
          // 수직 간격
          const midY = (guide.gapStart + guide.gapEnd) / 2;
          const lineX = guide.crossPosition;

          return (
            <React.Fragment key={`spacing-v-${i}`}>
              {/* 간격 영역 빨간 반투명 채움 */}
              <div
                style={{
                  position: 'absolute',
                  left: `${guide.crossStart}%`,
                  top: `${guide.gapStart}%`,
                  width: `${crossSize}%`,
                  height: `${gapSize}%`,
                  background: FILL_COLOR,
                  borderTop: `1px solid ${GUIDE_COLOR}`,
                  borderBottom: `1px solid ${GUIDE_COLOR}`,
                }}
              />
              {/* 중앙 점선 */}
              <div
                style={{
                  position: 'absolute',
                  left: `${lineX}%`,
                  top: `${guide.gapStart}%`,
                  width: 0,
                  height: `${gapSize}%`,
                  borderLeft: `1px dashed ${GUIDE_COLOR}`,
                  transform: 'translateX(-0.5px)',
                }}
              />
              {/* 거리 숫자 뱃지 */}
              <div
                style={{
                  position: 'absolute',
                  left: `${lineX}%`,
                  top: `${midY}%`,
                  transform: 'translate(6px, -50%)',
                  background: GUIDE_COLOR,
                  color: '#fff',
                  fontSize: '9px',
                  fontWeight: 600,
                  padding: '1px 5px',
                  borderRadius: '3px',
                  whiteSpace: 'nowrap',
                  lineHeight: '1.4',
                  letterSpacing: '0.3px',
                }}
              >
                {pxDistance}
              </div>
            </React.Fragment>
          );
        }
      })}
    </div>
  );
}
