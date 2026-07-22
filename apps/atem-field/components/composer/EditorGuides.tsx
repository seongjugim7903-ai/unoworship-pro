'use client';

/**
 * EditorGuides.tsx
 * 에디터 캔버스 가이드라인 오버레이
 *
 * - 가로/세로 센터라인 (흰색 점선)
 * - Title Safe 영역 (10% 안쪽, 흰색 얇은 선)
 * - Action Safe 영역 (5% 안쪽, 반투명 점선)
 * - 스냅 활성화 시 해당 라인 하이라이트
 *
 * pointer-events: none — 가이드라인은 클릭/드래그에 영향 없음
 */

import React from 'react';

export interface SnapState {
  snappedCenterX: boolean;
  snappedCenterY: boolean;
  snappedLeft: boolean;
  snappedRight: boolean;
  snappedTop: boolean;
  snappedBottom: boolean;
}

const EMPTY_SNAP: SnapState = {
  snappedCenterX: false,
  snappedCenterY: false,
  snappedLeft: false,
  snappedRight: false,
  snappedTop: false,
  snappedBottom: false,
};

interface EditorGuidesProps {
  /** 현재 스냅 상태 (드래그 중에만 전달, 기본 비활성) */
  snapState?: SnapState;
  /** 가이드라인 표시 여부 */
  visible?: boolean;
}

/** 센터라인 스타일 */
const CENTER_LINE_BASE: React.CSSProperties = {
  position: 'absolute',
  pointerEvents: 'none',
};

/** 안전 영역 % */
const TITLE_SAFE = 10;
const ACTION_SAFE = 5;

export default function EditorGuides({
  snapState = EMPTY_SNAP,
  visible = true,
}: EditorGuidesProps) {
  if (!visible) return null;

  const {
    snappedCenterX,
    snappedCenterY,
    snappedLeft,
    snappedRight,
    snappedTop,
    snappedBottom,
  } = snapState;

  // 센터라인 활성 여부에 따른 색상/굵기
  const cxColor = snappedCenterX ? '#ffffff' : '#ffffff';
  const cyColor = snappedCenterY ? '#ffffff' : '#ffffff';
  const cxWidth = snappedCenterX ? 1.5 : 0.5;
  const cyWidth = snappedCenterY ? 1.5 : 0.5;

  // 안전 영역 라인 색상 (스냅 시 하이라이트)
  const safeColor = (snapped: boolean) =>
    snapped ? '#ffffff' : '#ffffff';
  const safeWidth = (snapped: boolean) => snapped ? 1.5 : 0.5;

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 9990,
        overflow: 'hidden',
      }}
    >
      {/* ═══ 세로 센터라인 (가운데 수직선) ═══ */}
      <div
        style={{
          ...CENTER_LINE_BASE,
          left: '50%',
          top: 0,
          bottom: 0,
          width: 0,
          borderLeft: `${cxWidth}px ${snappedCenterX ? 'solid' : 'dashed'} ${cxColor}`,
          transform: 'translateX(-50%)',
        }}
      />

      {/* ═══ 가로 센터라인 (가운데 수평선) ═══ */}
      <div
        style={{
          ...CENTER_LINE_BASE,
          top: '50%',
          left: 0,
          right: 0,
          height: 0,
          borderTop: `${cyWidth}px ${snappedCenterY ? 'solid' : 'dashed'} ${cyColor}`,
          transform: 'translateY(-50%)',
        }}
      />

      {/* ═══ Title Safe 영역 (10% 안쪽) ═══ */}
      <div
        style={{
          position: 'absolute',
          left: `${TITLE_SAFE}%`,
          top: `${TITLE_SAFE}%`,
          right: `${TITLE_SAFE}%`,
          bottom: `${TITLE_SAFE}%`,
          pointerEvents: 'none',
        }}
      >
        {/* 왼쪽 */}
        <div style={{
          position: 'absolute', left: 0, top: 0, bottom: 0, width: 0,
          borderLeft: `${safeWidth(snappedLeft)}px ${snappedLeft ? 'solid' : 'dashed'} ${safeColor(snappedLeft)}`,
        }} />
        {/* 오른쪽 */}
        <div style={{
          position: 'absolute', right: 0, top: 0, bottom: 0, width: 0,
          borderRight: `${safeWidth(snappedRight)}px ${snappedRight ? 'solid' : 'dashed'} ${safeColor(snappedRight)}`,
        }} />
        {/* 위 */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 0,
          borderTop: `${safeWidth(snappedTop)}px ${snappedTop ? 'solid' : 'dashed'} ${safeColor(snappedTop)}`,
        }} />
        {/* 아래 */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, height: 0,
          borderBottom: `${safeWidth(snappedBottom)}px ${snappedBottom ? 'solid' : 'dashed'} ${safeColor(snappedBottom)}`,
        }} />
      </div>

      {/* ═══ Action Safe 영역 (5% 안쪽 — 더 연하게) ═══ */}
      <div
        style={{
          position: 'absolute',
          left: `${ACTION_SAFE}%`,
          top: `${ACTION_SAFE}%`,
          right: `${ACTION_SAFE}%`,
          bottom: `${ACTION_SAFE}%`,
          border: '0.5px dashed #ffffff',
          pointerEvents: 'none',
        }}
      />

      {/* ═══ 코너 라벨 (Title Safe) ═══ */}
      <span
        style={{
          position: 'absolute',
          left: `${TITLE_SAFE}%`,
          top: `${TITLE_SAFE}%`,
          transform: 'translate(4px, 2px)',
          fontSize: 8,
          color: '#ffffff',
          fontFamily: 'monospace',
          letterSpacing: 0.5,
          pointerEvents: 'none',
          userSelect: 'none',
        }}
      >
        TITLE SAFE
      </span>

      <span
        style={{
          position: 'absolute',
          left: `${ACTION_SAFE}%`,
          top: `${ACTION_SAFE}%`,
          transform: 'translate(4px, 2px)',
          fontSize: 8,
          color: '#ffffff',
          fontFamily: 'monospace',
          letterSpacing: 0.5,
          pointerEvents: 'none',
          userSelect: 'none',
        }}
      >
        ACTION SAFE
      </span>
    </div>
  );
}
