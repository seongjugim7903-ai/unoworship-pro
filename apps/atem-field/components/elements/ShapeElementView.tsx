'use client';

/**
 * ShapeElementView.tsx
 * 에디터 캔버스 위에 표시되는 도형 요소 (SVG 기반)
 * 그라데이션 지원 (SVG linearGradient / radialGradient)
 */

import React, { useMemo, useRef, useState, useEffect } from 'react';
import { ShapeElement, resolveCornerRadii } from '@/lib/canvasTypes';
import { buildMaskStyle } from '@/lib/gradientMaskCss';
import { HandleId } from '@/hooks/useCanvasEditor';
import { calcImageFillRect } from '@/lib/imageProcessing/shapeFill';

interface ShapeElementViewProps {
  element: ShapeElement;
  isSelected: boolean;
  onPointerDown: (handleId: HandleId) => (e: React.PointerEvent<HTMLDivElement>) => void;
}

export default function ShapeElementView({
  element,
  isSelected,
  onPointerDown,
}: ShapeElementViewProps) {
  // SVG gradient ID (고유)
  const gradId = `grad-${element.id}`;

  const sw = element.strokeWidth;
  const inset = sw / 2;

  // 코너 래디우스 해석
  const radii = resolveCornerRadii(element);
  const hasRadius = radii.some((r) => r > 0);
  const borderRadiusCss = `${radii[0]}px ${radii[1]}px ${radii[2]}px ${radii[3]}px`;

  // 채움 값 결정
  const fillValue = element.useGradient && element.gradient
    ? `url(#${gradId})`
    : hexToRgba(element.fill, element.fillOpacity);

  const strokeValue = sw > 0 && element.stroke !== 'transparent' ? element.stroke : 'none';

  // SVG gradient 각도 → x1/y1/x2/y2 변환
  const gradientCoords = useMemo(() => {
    if (!element.gradient || element.gradient.type === 'radial') return null;
    const angle = element.gradient.angle;
    const rad   = ((angle - 90) * Math.PI) / 180;
    const x2    = 0.5 + Math.cos(rad) * 0.5;
    const y2    = 0.5 + Math.sin(rad) * 0.5;
    const x1    = 1 - x2;
    const y1    = 1 - y2;
    return { x1: `${x1 * 100}%`, y1: `${y1 * 100}%`, x2: `${x2 * 100}%`, y2: `${y2 * 100}%` };
  }, [element.gradient]);

  function renderGradientDef() {
    if (!element.useGradient || !element.gradient) return null;
    const { stops, type } = element.gradient;

    if (type === 'radial') {
      return (
        <radialGradient id={gradId} cx="50%" cy="50%" r="50%">
          {stops.map((s, i) => (
            <stop key={i} offset={`${s.offset * 100}%`} stopColor={s.color} />
          ))}
        </radialGradient>
      );
    }
    return (
      <linearGradient id={gradId} {...(gradientCoords ?? { x1: '0%', y1: '0%', x2: '100%', y2: '0%' })}>
        {stops.map((s, i) => (
          <stop key={i} offset={`${s.offset * 100}%`} stopColor={s.color} />
        ))}
      </linearGradient>
    );
  }

  /** rect / roundRect 인지 (CSS border-radius 로 렌더링) */
  const isRectLike = element.shapeType === 'rect' || element.shapeType === 'roundRect';

  /** rect/roundRect: CSS 기반 채움+테두리 스타일 */
  const rectCssStyle = useMemo((): React.CSSProperties | undefined => {
    if (!isRectLike) return undefined;

    // 그라데이션 배경
    let bg: string;
    if (element.useGradient && element.gradient) {
      const stops = element.gradient.stops.map((s) => `${s.color} ${s.offset * 100}%`).join(', ');
      bg = element.gradient.type === 'radial'
        ? `radial-gradient(circle, ${stops})`
        : `linear-gradient(${element.gradient.angle}deg, ${stops})`;
    } else {
      bg = hexToRgba(element.fill, element.fillOpacity);
    }

    return {
      position: 'absolute',
      inset: 0,
      background: bg,
      borderRadius: borderRadiusCss,
      border: strokeValue !== 'none' ? `${sw}px solid ${element.stroke}` : undefined,
      boxSizing: 'border-box',
      pointerEvents: 'none',
    };
  }, [isRectLike, element.useGradient, element.gradient, element.fill, element.fillOpacity,
      borderRadiusCss, strokeValue, sw, element.stroke]);

  function renderShapeStrokeOnly() {
    // rect/roundRect 은 CSS 에서 처리
    switch (element.shapeType) {
      case 'ellipse':
        return <ellipse cx="50%" cy="50%" rx={`calc(50% - ${inset}px)`} ry={`calc(50% - ${inset}px)`}
          fill="none" stroke={strokeValue} strokeWidth={sw} />;
      default:
        return null;
    }
  }

  function renderShape() {
    // rect/roundRect 은 CSS div 로 렌더링
    switch (element.shapeType) {
      case 'ellipse':
        return (
          <ellipse cx="50%" cy="50%"
            rx={`calc(50% - ${inset}px)`} ry={`calc(50% - ${inset}px)`}
            fill={fillValue} stroke={strokeValue} strokeWidth={sw} />
        );
      case 'line':
        return (
          <line x1="0%" y1="50%" x2="100%" y2="50%"
            stroke={element.useGradient ? `url(#${gradId})` : element.stroke}
            strokeWidth={Math.max(sw, 2)} strokeLinecap="round" />
        );
      default:
        return null;
    }
  }

  // 이미지 채우기: 원본 이미지 크기 필요
  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [imgNatSize, setImgNatSize] = useState<{ w: number; h: number } | null>(null);

  const hasImageFill = !!element.imageFill && element.shapeType !== 'line';

  useEffect(() => {
    if (!element.imageFill) { setImgNatSize(null); return; }
    const img = new Image();
    img.onload = () => setImgNatSize({ w: img.naturalWidth, h: img.naturalHeight });
    img.src = element.imageFill.src;
  }, [element.imageFill?.src]);

  // CSS clip-path for image fill
  const clipPath = useMemo(() => {
    if (!hasImageFill) return undefined;
    switch (element.shapeType) {
      case 'ellipse':
        return 'ellipse(50% 50% at 50% 50%)';
      case 'rect':
      case 'roundRect': {
        return hasRadius
          ? `inset(0 round ${borderRadiusCss})`
          : 'inset(0)';
      }
      default:
        return 'inset(0)';
    }
  }, [hasImageFill, element.shapeType, hasRadius, borderRadiusCss]);

  // 이미지 채우기 좌표 계산
  const imgStyle = useMemo((): React.CSSProperties | null => {
    if (!hasImageFill || !imgNatSize || !element.imageFill) return null;
    // 컨테이너 크기를 100% 기준으로 계산
    const fill = element.imageFill;
    const boxW = 100; // % 기준
    const boxH = 100;
    const rect = calcImageFillRect(fill, imgNatSize.w, imgNatSize.h, boxW, boxH);
    return {
      position: 'absolute',
      left: `${rect.dx}%`,
      top: `${rect.dy}%`,
      width: `${rect.dw}%`,
      height: `${rect.dh}%`,
      pointerEvents: 'none',
      userSelect: 'none',
      display: 'block',
    };
  }, [hasImageFill, imgNatSize, element.imageFill]);

  // 쉐도우 CSS
  const boxShadow = element.useShadow && element.shadow
    ? `${element.shadow.offsetX}px ${element.shadow.offsetY}px ${element.shadow.blur}px ${element.shadow.spread}px ${element.shadow.color}`
    : undefined;

  // 외부 광채 — filter: drop-shadow()는 도형 윤곽을 따라감
  const glowFilter = element.useGlow && element.glow
    ? Array.from({ length: element.glow.intensity || 1 }, () =>
        `drop-shadow(0 0 ${element.glow!.blur}px ${element.glow!.color})`
      ).join(' ')
    : undefined;

  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        left:    `${element.x}%`,
        top:     `${element.y}%`,
        width:   `${element.width}%`,
        height:  `${element.height}%`,
        transform: element.rotation ? `rotate(${element.rotation}deg)` : undefined,
        transformOrigin: 'center center',
        opacity: element.opacity,
        display: element.visible ? 'block' : 'none',
        cursor: isSelected ? 'move' : 'pointer',
        zIndex: element.zIndex,
        pointerEvents: 'all',
        overflow: (hasImageFill || (isRectLike && hasRadius)) ? 'hidden' : 'visible',
        borderRadius: isRectLike && hasRadius ? borderRadiusCss : undefined,
        clipPath: hasImageFill ? clipPath : undefined,
        WebkitClipPath: hasImageFill ? clipPath : undefined,
        boxShadow,
        filter: glowFilter,
        // 지우개 + 그라데이션 마스크
        ...buildMaskStyle(element.gradientMask, element.eraserMask),
      } as React.CSSProperties}
      onPointerDown={onPointerDown('move')}
    >
      {/* 이미지 채우기 */}
      {hasImageFill && imgStyle && element.imageFill && (
        <img
          ref={imgRef}
          src={element.imageFill.src}
          alt=""
          draggable={false}
          style={imgStyle}
        />
      )}

      {/* rect / roundRect: CSS div 로 채움+테두리+코너 렌더링 */}
      {isRectLike && !hasImageFill && rectCssStyle && (
        <div style={rectCssStyle} />
      )}
      {/* 이미지 채우기 시 rect/roundRect 테두리 (CSS) */}
      {isRectLike && hasImageFill && strokeValue !== 'none' && (
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          borderRadius: borderRadiusCss,
          border: `${sw}px solid ${element.stroke}`,
          boxSizing: 'border-box',
        }} />
      )}

      {/* ellipse / line: SVG 렌더링 */}
      {!isRectLike && !hasImageFill && (
        <svg width="100%" height="100%" overflow="visible" style={{ display: 'block' }}>
          <defs>{renderGradientDef()}</defs>
          {renderShape()}
        </svg>
      )}
      {!isRectLike && hasImageFill && strokeValue !== 'none' && (
        <svg width="100%" height="100%" overflow="visible"
          style={{ position: 'absolute', inset: 0, display: 'block', pointerEvents: 'none' }}>
          {renderShapeStrokeOnly()}
        </svg>
      )}

      {isSelected && (
        <div style={{
          position: 'absolute', inset: 0,
          background: 'rgba(59, 130, 246, 0.06)',
          pointerEvents: 'none',
        }} />
      )}
    </div>
  );
}

function hexToRgba(hex: string, alpha: number): string {
  if (!hex || hex === 'transparent') return 'transparent';
  if (!hex.startsWith('#') || hex.length < 7) return hex;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
