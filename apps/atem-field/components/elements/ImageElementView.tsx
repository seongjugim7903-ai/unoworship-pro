'use client';

/**
 * ImageElementView.tsx
 * 에디터 캔버스 위에 표시되는 이미지 요소
 *
 * - % 좌표 기반 위치/크기 (다른 요소와 동일)
 * - objectFit: cover | contain | fill 지원
 * - 선택 시 파란색 하이라이트
 * - BoundingBox 와 연동 (드래그, 리사이즈, 회전)
 */

import React from 'react';
import { ImageElement, resolveCornerRadii } from '@/lib/canvasTypes';
import { buildMaskStyle } from '@/lib/gradientMaskCss';
import { HandleId } from '@/hooks/useCanvasEditor';

interface ImageElementViewProps {
  element: ImageElement;
  isSelected: boolean;
  onPointerDown: (handleId: HandleId) => (e: React.PointerEvent<HTMLDivElement>) => void;
}

export default function ImageElementView({
  element,
  isSelected,
  onPointerDown,
}: ImageElementViewProps) {
  const radii = resolveCornerRadii(element);
  const hasRadius = radii.some((r) => r > 0);
  const borderRadiusCss = `${radii[0]}px ${radii[1]}px ${radii[2]}px ${radii[3]}px`;

  // 테두리
  const sw = element.strokeWidth ?? 0;
  const hasStroke = sw > 0 && element.stroke && element.stroke !== 'transparent';

  // 쉐도우
  const boxShadow = element.useShadow && element.shadow
    ? `${element.shadow.offsetX}px ${element.shadow.offsetY}px ${element.shadow.blur}px ${element.shadow.spread}px ${element.shadow.color}`
    : undefined;

  // 외부 광채 — filter: drop-shadow()는 알파 채널(투명 윤곽)을 따라감
  const glowFilter = element.useGlow && element.glow
    ? Array.from({ length: element.glow.intensity || 1 }, () =>
        `drop-shadow(0 0 ${element.glow!.blur}px ${element.glow!.color})`
      ).join(' ')
    : undefined;

  return (
    <div
      style={{
        position: 'absolute',
        left: `${element.x}%`,
        top: `${element.y}%`,
        width: `${element.width}%`,
        height: `${element.height}%`,
        transform: element.rotation ? `rotate(${element.rotation}deg)` : undefined,
        transformOrigin: 'center center',
        opacity: element.opacity,
        display: element.visible ? 'block' : 'none',
        cursor: isSelected ? 'move' : 'pointer',
        zIndex: element.zIndex,
        pointerEvents: 'all',
        overflow: 'hidden',
        borderRadius: hasRadius ? borderRadiusCss : undefined,
        border: hasStroke ? `${sw}px solid ${element.stroke}` : undefined,
        boxSizing: 'border-box',
        boxShadow,
        filter: glowFilter,
        // 지우개 + 그라데이션 마스크 적용
        ...buildMaskStyle(element.gradientMask, element.eraserMask),
      } as React.CSSProperties}
      onPointerDown={onPointerDown('move')}
    >
      {/* 이미지 */}
      <img
        src={element.src}
        alt=""
        draggable={false}
        style={{
          width: '100%',
          height: '100%',
          objectFit: element.objectFit || 'fill',
          display: 'block',
          pointerEvents: 'none',
          userSelect: 'none',
        }}
      />

      {/* 선택 하이라이트 */}
      {isSelected && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(59, 130, 246, 0.08)',
            border: '1px solid rgba(59, 130, 246, 0.3)',
            pointerEvents: 'none',
          }}
        />
      )}
    </div>
  );
}
