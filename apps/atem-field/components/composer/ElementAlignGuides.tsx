'use client';

/**
 * ElementAlignGuides.tsx
 * 요소 간 정렬 가이드라인 시각화 오버레이
 *
 * 드래그 중인 요소의 바운딩 박스가 다른 요소의 바운딩 박스와
 * 수직/수평으로 정렬될 때 피그마 스타일의 빨간 정렬선을 표시한다.
 *
 * - elementSnap.ts 에서 계산된 AlignGuideLine[] 을 받아 렌더링
 * - pointer-events: none — 가이드라인은 인터랙션에 영향 없음
 */

import React from 'react';
import { AlignGuideLine } from '@/lib/elementSnap';

interface ElementAlignGuidesProps {
  /** 표시할 가이드라인 목록 (드래그 중에만 전달) */
  guides: AlignGuideLine[];
}

/** 가이드라인 색상 — 피그마 스타일 빨간색 */
const GUIDE_COLOR = '#ff3366';
const GUIDE_WIDTH = 1;

export default function ElementAlignGuides({ guides }: ElementAlignGuidesProps) {
  if (guides.length === 0) return null;

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 9991,
        overflow: 'hidden',
      }}
    >
      {guides.map((guide, i) => {
        if (guide.axis === 'vertical') {
          // 수직 가이드라인 (x 위치 고정, y 방향으로 뻗음)
          return (
            <div
              key={`v-${i}`}
              style={{
                position: 'absolute',
                left: `${guide.position}%`,
                top: `${guide.start}%`,
                height: `${guide.end - guide.start}%`,
                width: 0,
                borderLeft: `${GUIDE_WIDTH}px solid ${GUIDE_COLOR}`,
                transform: 'translateX(-0.5px)',
              }}
            />
          );
        } else {
          // 수평 가이드라인 (y 위치 고정, x 방향으로 뻗음)
          return (
            <div
              key={`h-${i}`}
              style={{
                position: 'absolute',
                top: `${guide.position}%`,
                left: `${guide.start}%`,
                width: `${guide.end - guide.start}%`,
                height: 0,
                borderTop: `${GUIDE_WIDTH}px solid ${GUIDE_COLOR}`,
                transform: 'translateY(-0.5px)',
              }}
            />
          );
        }
      })}
    </div>
  );
}
