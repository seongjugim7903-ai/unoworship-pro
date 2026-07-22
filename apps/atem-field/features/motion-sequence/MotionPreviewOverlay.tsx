'use client';

// 에디터 캔버스 위에 겹쳐 모션을 로컬 재생하는 미리보기 오버레이 — 송출과 무관

import { useEffect, useRef } from 'react';
import { useStore } from '@/lib/store';
import { renderElements, preloadImages } from '@/lib/canvasRenderer';
import { interpolateElements, maxMotionDuration } from '@/lib/motionEngine';
import { useMotionPreview, stopMotionPreview } from './previewStore';

const CANVAS_W = 1920;
const CANVAS_H = 1080;
/** 모션 종료 후 최종 상태를 잠깐 보여주고 자동 종료 */
const TAIL_SECONDS = 0.6;

export default function MotionPreviewOverlay() {
  const { playing, startedAt } = useMotionPreview();
  const canvasElRef = useRef<HTMLCanvasElement>(null);

  const section = useStore((s) => {
    const list = s.setlists.find((l) => l.id === s.currentSetlistId);
    const item = list?.items.find((i) => i.id === s.activeItemId);
    return item?.sections.find((sec) => sec.id === s.activeSectionId) ?? null;
  });

  useEffect(() => {
    if (!playing || !section) return;
    const canvas = canvasElRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    let raf = 0;
    let cancelled = false;
    const elements = section.elements;
    const sectionText = section.text;
    const total = maxMotionDuration(elements) + TAIL_SECONDS;

    const draw = () => {
      if (cancelled) return;
      const elapsed = performance.now() / 1000 - startedAt;
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      renderElements(ctx, interpolateElements(elements, elapsed), sectionText, CANVAS_W, CANVAS_H, {
        target: 'output',
      });
      if (elapsed >= total) {
        stopMotionPreview();
        return;
      }
      raf = requestAnimationFrame(draw);
    };

    // 이미지 캐시를 먼저 채워 첫 프레임 깜빡임 방지
    void preloadImages(elements).then(() => {
      if (!cancelled) draw();
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [playing, startedAt, section]);

  if (!playing || !section) return null;

  return (
    <div
      className="absolute inset-0 cursor-pointer"
      style={{ zIndex: 9999 }}
      title="클릭하면 미리보기 종료"
      onPointerDown={(e) => {
        e.stopPropagation();
        stopMotionPreview();
      }}
    >
      <canvas
        ref={canvasElRef}
        width={CANVAS_W}
        height={CANVAS_H}
        className="w-full h-full"
      />
      <span className="absolute top-2 left-2 flex items-center gap-1.5 px-2 py-1 rounded-md bg-purple-600/80 text-white text-[10px] font-bold pointer-events-none">
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
        모션 미리보기 · 클릭으로 종료
      </span>
    </div>
  );
}
