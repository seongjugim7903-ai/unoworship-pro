'use client';

/**
 * TextClipMaskView.tsx
 * 텍스트 글리프 형태로 이미지/도형을 클리핑하는 캔버스 기반 뷰
 *
 * 포토샵 스타일: 텍스트 레이어가 마스크 → 위의 이미지 레이어가 글자 모양으로 잘림
 * Canvas 2D의 globalCompositeOperation = 'destination-in' 사용
 */

import React, { useRef, useEffect, useCallback } from 'react';
import { CanvasElement, TextElement, ImageElement, ShapeElement } from '@/lib/canvasTypes';

interface TextClipMaskViewProps {
  maskEl: TextElement;
  clippedEl: CanvasElement;
  displayText: string;
  isSelected: boolean;
  onContextMenu: (e: React.MouseEvent) => void;
  onPointerDown: (e: React.PointerEvent) => void;
}

// 이미지 캐시
const imgCache = new Map<string, HTMLImageElement>();
function loadImage(src: string): HTMLImageElement | null {
  const cached = imgCache.get(src);
  if (cached && cached.complete && cached.naturalWidth > 0) return cached;
  if (!cached) {
    const img = new Image();
    img.src = src;
    imgCache.set(src, img);
  }
  return null;
}

/** 텍스트 줄바꿈 (canvasRenderer 동일 로직) */
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const paragraphs = text.split('\n');
  const lines: string[] = [];
  for (const para of paragraphs) {
    if (!para) { lines.push(''); continue; }
    const words = para.split('');
    let line = '';
    for (const ch of words) {
      const test = line + ch;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = ch;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
  }
  return lines.length ? lines : [''];
}

export default function TextClipMaskView({
  maskEl,
  clippedEl,
  displayText,
  isSelected,
  onContextMenu,
  onPointerDown,
}: TextClipMaskViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const cw = Math.round(rect.width * dpr);
    const ch = Math.round(rect.height * dpr);

    if (cw === 0 || ch === 0) return;

    // 캔버스 크기 설정
    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw;
      canvas.height = ch;
    }

    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, cw, ch);

    // ── 1단계: 콘텐츠 요소 렌더 (클리핑 대상) ──
    ctx.save();
    ctx.scale(dpr, dpr);

    // 클리핑 대상의 위치를 마스크 기준 상대 좌표로 변환
    const containerW = rect.width;
    const containerH = rect.height;

    // 마스크 요소의 캔버스% 위치를 기준으로 클리핑 대상의 상대 위��� 계산
    // 부모 캔버스의 실제 크기가 필요 → container의 parent를 사용
    const parentEl = container.parentElement;
    const parentRect = parentEl?.getBoundingClientRect();
    const parentW = parentRect?.width || containerW;
    const parentH = parentRect?.height || containerH;

    // 클리핑 대상의 실제 px 위치 (부모 캔버스 기준)
    const clippedPxX = (clippedEl.x / 100) * parentW;
    const clippedPxY = (clippedEl.y / 100) * parentH;
    const clippedPxW = (clippedEl.width / 100) * parentW;
    const clippedPxH = (clippedEl.height / 100) * parentH;

    // 마스크의 실제 px 위치
    const maskPxX = (maskEl.x / 100) * parentW;
    const maskPxY = (maskEl.y / 100) * parentH;

    // 마스크 기��� 상대 좌표
    const relX = clippedPxX - maskPxX;
    const relY = clippedPxY - maskPxY;

    if (clippedEl.type === 'image') {
      const imgEl = clippedEl as ImageElement;
      const img = loadImage(imgEl.src);
      if (img) {
        ctx.drawImage(img, relX, relY, clippedPxW, clippedPxH);
      }
    } else if (clippedEl.type === 'shape') {
      const shapeEl = clippedEl as ShapeElement;
      ctx.fillStyle = shapeEl.fill;
      ctx.globalAlpha = shapeEl.fillOpacity;
      ctx.fillRect(relX, relY, clippedPxW, clippedPxH);
      ctx.globalAlpha = 1;
    }
    ctx.restore();

    // ── 2단계: 텍스트 글리프로 클리핑 (destination-in) ──
    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.globalCompositeOperation = 'destination-in';

    ctx.font = `${maskEl.fontStyle} ${maskEl.fontWeight} ${maskEl.fontSize}px "${maskEl.fontFamily}", sans-serif`;
    ctx.letterSpacing = `${maskEl.letterSpacing}px`;
    ctx.textAlign = maskEl.textAlign;
    ctx.textBaseline = 'middle';

    const lines = wrapText(ctx, displayText, containerW);
    const lh = maskEl.fontSize * maskEl.lineHeight;
    const totalH = lines.length * lh;

    let startY: number;
    if (maskEl.verticalAlign === 'top') startY = lh / 2;
    else if (maskEl.verticalAlign === 'bottom') startY = containerH - totalH + lh / 2;
    else startY = containerH / 2 - totalH / 2 + lh / 2;

    const anchorX =
      maskEl.textAlign === 'left'  ? 0 :
      maskEl.textAlign === 'right' ? containerW : containerW / 2;

    ctx.fillStyle = '#000';
    lines.forEach((line, i) => {
      ctx.fillText(line, anchorX, startY + i * lh);
    });

    // 텍스트 외곽선도 마스크에 포함 (strokeWidth > 0인 경우)
    if (maskEl.strokeWidth > 0) {
      ctx.lineWidth = maskEl.strokeWidth;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#000';
      lines.forEach((line, i) => {
        ctx.strokeText(line, anchorX, startY + i * lh);
      });
    }

    ctx.restore();
  }, [maskEl, clippedEl, displayText]);

  // 렌더링 트리거
  useEffect(() => {
    render();
    // 이미지 로드 대기 후 재렌더
    if (clippedEl.type === 'image') {
      const img = loadImage((clippedEl as ImageElement).src);
      if (!img) {
        const check = setInterval(() => {
          const loaded = loadImage((clippedEl as ImageElement).src);
          if (loaded) {
            clearInterval(check);
            render();
          }
        }, 100);
        return () => clearInterval(check);
      }
    }
  }, [render, clippedEl]);

  // ResizeObserver로 크기 변경 감지
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(() => render());
    ro.observe(container);
    return () => ro.disconnect();
  }, [render]);

  return (
    <div
      ref={containerRef}
      onContextMenu={onContextMenu}
      onPointerDown={onPointerDown}
      style={{
        position: 'absolute',
        left: `${maskEl.x}%`,
        top: `${maskEl.y}%`,
        width: `${maskEl.width}%`,
        height: `${maskEl.height}%`,
        transform: maskEl.rotation ? `rotate(${maskEl.rotation}deg)` : undefined,
        transformOrigin: 'center center',
        zIndex: maskEl.zIndex,
        pointerEvents: 'all',
        opacity: clippedEl.opacity,
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          width: '100%',
          height: '100%',
          display: 'block',
          pointerEvents: 'none',
        }}
      />
      {/* 선택 하이라이트 */}
      {isSelected && (
        <div style={{ position: 'absolute', inset: 0, border: '1.5px dashed rgba(59,130,246,0.6)', pointerEvents: 'none' }} />
      )}
    </div>
  );
}
