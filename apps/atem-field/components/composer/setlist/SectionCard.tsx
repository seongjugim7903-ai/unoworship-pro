'use client';

/**
 * components/composer/setlist/SectionCard.tsx
 * [기능1] 섹션 카드 — 에디터 캔버스 축소판 미러링
 *
 * 1920×1080 캔버스를 260×146 카드 안에 축소하여 동일하게 렌더링
 * canvasRenderer.renderElements() 를 그대로 사용하므로
 * 텍스트, 도형, 그라데이션 등 출력 화면과 100% 동일한 결과
 *
 * 이미지: canvasRenderer 의 이미지 캐시로 렌더링 (Base64 자동 캐시)
 * 영상: 플레이스홀더 표시
 */

import { useRef, useEffect, useState, useCallback, memo } from 'react';
import { Section } from '@/lib/types';
import { CanvasElement } from '@/lib/canvasTypes';
import { renderElements, preloadImages } from '@/lib/canvasRenderer';
import { hasMotion } from '@/lib/motionEngine';
import { isSectionCueMacroEnabled } from '@/lib/sectionCueMacro';
import SectionCueMacroModal from '@/components/composer/setlist/SectionCueMacroModal';
import type { SectionCueMacro } from '@/lib/types';
import { useSectionClick } from '@/features/section-broadcast/useSectionClick';

// 출력 해상도 (1920×1080) — 축소 비율 계산용
const SOURCE_W = 1920;
const SOURCE_H = 1080;

// 카드 표시 크기
const CARD_W = 260;
const CARD_H = 146;

// 오프스크린 렌더링 해상도 (성능과 품질 균형)
// 카드의 2배로 렌더링 후 CSS로 축소 → 선명한 텍스트
const RENDER_W = 520;
const RENDER_H = 292;

// 프로그램 순서별 레인보우 색상 (10색 순환)
const RAINBOW_COLORS = [
  '#ef4444', // 빨강
  '#f97316', // 주황
  '#eab308', // 노랑
  '#22c55e', // 초록
  '#06b6d4', // 하늘
  '#3b82f6', // 파랑
  '#8b5cf6', // 보라
  '#ec4899', // 분홍
  '#14b8a6', // 민트
  '#f59e0b', // 황금
];

interface SectionCardProps {
  section: Section;
  itemTitle: string;
  index: number;
  itemIndex: number;       // 프로그램 순서 (0-based) — 레인보우 색상 결정용
  isActive: boolean;
  /** 지금 송출(라이브) 중인 섹션 — 빨강 굵은 테두리로 표시 */
  isLive: boolean;
  isFirstOfItem: boolean;
  scrollRef: (el: HTMLElement | null) => void;
  onSelect: () => void;
  onDoubleClick: () => void;
  onDelete?: () => void;
  onDuplicate?: () => void;
  onUpdateCueMacro?: (cueMacro: SectionCueMacro | undefined) => void;
  /** 책갈피 토글 — 우상단 원 마커 클릭 */
  onToggleBookmark?: () => void;
}

/** 영상 플레이스홀더 렌더링 (이미지는 canvasRenderer가 직접 처리) */
function renderVideoPlaceholders(
  ctx: CanvasRenderingContext2D,
  elements: CanvasElement[],
  cw: number,
  ch: number
) {
  for (const el of elements) {
    if (!el.visible || el.type !== 'video') continue;

    const x = (el.x / 100) * cw;
    const y = (el.y / 100) * ch;
    const w = (el.width / 100) * cw;
    const h = (el.height / 100) * ch;

    ctx.save();
    ctx.globalAlpha = el.opacity * 0.5;
    ctx.fillStyle = '#3a1e5f';
    ctx.fillRect(x, y, w, h);
    ctx.globalAlpha = el.opacity * 0.8;
    ctx.fillStyle = '#8899aa';
    const iconSize = Math.min(w, h) * 0.3;
    ctx.font = `${Math.max(iconSize, 12)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🎬', x + w / 2, y + h / 2);
    ctx.restore();
  }
}

const SectionCard = memo(function SectionCard({
  section,
  itemTitle,
  index,
  itemIndex,
  isActive,
  isLive,
  isFirstOfItem,
  scrollRef,
  onSelect,
  onDoubleClick,
  onDelete,
  onDuplicate,
  onUpdateCueMacro,
  onToggleBookmark,
}: SectionCardProps) {
  const rainbowColor = RAINBOW_COLORS[itemIndex % RAINBOW_COLORS.length];
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [cueModalOpen, setCueModalOpen] = useState(false);
  const hasCueMacro = isSectionCueMacroEnabled(section);
  // [FEATURE: MOTION_SEQUENCE] 송출 시 모션이 재생되는 섹션 표시
  const sectionHasMotion = hasMotion(section.elements);

  // ── 클릭 판정: 한번=선택 / 두번=송출 / 세번+=무시 (별도 훅으로 분리) ──
  const runSectionClick = useSectionClick({ onSingle: onSelect, onDouble: onDoubleClick });

  const handlePointerDown = useCallback(() => {
    if (contextMenu) { setContextMenu(null); return; } // 컨텍스트 메뉴 열려 있으면 닫기만
    runSectionClick();
  }, [contextMenu, runSectionClick]);

  // 캔버스 렌더링 — section.elements 또는 section.text 변경 시 다시 그리기
  // 캔버스 렌더링 함수 (이미지 로드 완료 시 재호출 가능)
  const redraw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, RENDER_W, RENDER_H);

    const scaleX = RENDER_W / SOURCE_W;
    const scaleY = RENDER_H / SOURCE_H;

    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, RENDER_W, RENDER_H);

    const hasElements = section.elements && section.elements.length > 0;

    if (hasElements) {
      ctx.save();
      ctx.scale(scaleX, scaleY);
      renderElements(ctx, section.elements, section.text, SOURCE_W, SOURCE_H);
      renderVideoPlaceholders(ctx, section.elements, SOURCE_W, SOURCE_H);
      ctx.restore();
    } else if (section.text) {
      ctx.save();
      ctx.scale(scaleX, scaleY);
      renderFallbackText(ctx, section.text, SOURCE_W, SOURCE_H);
      ctx.restore();
    } else {
      ctx.fillStyle = '#333333';
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('내용 없음', RENDER_W / 2, RENDER_H / 2);
    }
  };

  useEffect(() => {
    redraw();

    // 이미지 프리로드 — 완료 후 항상 다시 그리기
    // (첫 redraw 시 getCachedImage가 null 반환 → 프리로드 후 재렌더 필수)
    if (section.elements && section.elements.length > 0) {
      const hasImages = section.elements.some((el) => el.type === 'image' && el.visible);
      if (hasImages) {
        preloadImages(section.elements).then(() => redraw());
      }
    }
  }, [section.elements, section.text]);

  return (
    <>
    {/* 카드 루트는 div(role=button) — 내부에 책갈피 button 이 중첩되므로 button 사용 불가.
        중첩 button 은 브라우저마다 DOM 을 재구성해 우클릭/클릭 핸들러가 유실되던 원인이었다. */}
    <div
      role="button"
      tabIndex={0}
      ref={(el) => {
        // 스크롤 ref (SectionScroller 용)
        scrollRef(el);
      }}
      onPointerDown={handlePointerDown}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setContextMenu({ x: e.clientX, y: e.clientY });
      }}
      style={{ width: CARD_W, height: CARD_H }}
      className={`relative flex-shrink-0 rounded-lg overflow-hidden transition-all outline-none cursor-pointer ${
        isLive
          ? 'border-4 border-red-500 shadow-[0_0_10px_rgba(239,68,68,0.75)]'
          : isActive
            ? 'border-2 border-blue-500'
            : 'border-2 border-[#2a2a2a] hover:border-[#444]'
      }`}
    >
      {/* 캔버스 축소판 — 전체 카드 배경 */}
      <canvas
        ref={canvasRef}
        width={RENDER_W}
        height={RENDER_H}
        style={{ width: CARD_W, height: CARD_H }}
        className="absolute inset-0"
      />

      {/* 좌측 레인보우 색상 띠 — 프로그램 순서별 색상 */}
      <span
        className="absolute left-0 top-0 bottom-0 w-1 z-10"
        style={{ backgroundColor: rainbowColor }}
      />

      {/* 우상단: 책갈피 마커 + 번호 뱃지 */}
      <div className="absolute top-1.5 right-2 z-20 flex items-center gap-1.5">
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onToggleBookmark?.();
          }}
          title={section.bookmarked ? '책갈피 해제' : '책갈피 표시 (후렴 등 빠른 이동)'}
          aria-label={section.bookmarked ? '책갈피 해제' : '책갈피 표시'}
          className="rounded-full transition-all hover:brightness-110"
          style={{
            width: section.bookmarked ? 12 : 6,
            height: section.bookmarked ? 12 : 6,
            backgroundColor: section.bookmarked ? '#ef4444' : '#facc15',
            boxShadow: section.bookmarked ? '0 0 6px rgba(239, 68, 68, 0.85)' : 'none',
          }}
        />
        <span className="text-[20px] font-bold text-white drop-shadow-md leading-none">
          {index + 1}
        </span>
      </div>

      {/* Cue/Macro 표시 */}
      {hasCueMacro && (
        <span className="absolute left-2 top-1.5 z-10 rounded border border-amber-400/50 bg-black/70 px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-amber-200">
          MACRO
        </span>
      )}

      {/* [FEATURE: MOTION_SEQUENCE] 모션 있는 섹션 표시 — 송출 시 애니메이션 재생됨 */}
      {sectionHasMotion && (
        <span
          title="이 섹션은 송출 시 모션이 재생됩니다"
          className={`absolute left-2 z-10 rounded border border-purple-400/50 bg-black/70 px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-purple-300 ${
            hasCueMacro ? 'top-7' : 'top-1.5'
          }`}
        >
          MOTION
        </span>
      )}

      {/* 하단: 프로그램명 + 순번 */}
      <div className="absolute bottom-0 left-0 right-0 z-10 bg-gradient-to-t from-black/80 to-transparent px-2 py-1 flex items-baseline gap-1.5">
        <p className="truncate font-semibold" style={{
          fontSize: '13px',
          color: rainbowColor,
        }}>
          {itemTitle}
        </p>
        <span className={`flex-shrink-0 text-[10px] ${
          isActive ? 'text-blue-300' : 'text-gray-500'
        }`}>
          {index + 1}
        </span>
      </div>
    </div>

    {/* 우클릭 컨텍스트 메뉴 */}
    {contextMenu && (
      <>
        {/* 배경 클릭 시 닫기 */}
        <div className="fixed inset-0 z-[9998]" onClick={() => setContextMenu(null)} onContextMenu={(e) => { e.preventDefault(); setContextMenu(null); }} />
        <div
          className="fixed z-[9999] bg-[#2a2a2a] border border-[#444] rounded-lg shadow-xl py-1 min-w-[160px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <div className="px-3 py-1.5 text-[11px] text-gray-500 truncate">
            #{index + 1} {itemTitle}
          </div>
          <hr className="border-[#444] my-0.5" />
          {onUpdateCueMacro && (
            <button
              className="w-full text-left px-3 py-1.5 text-[13px] text-amber-200 hover:bg-amber-500/15 transition-colors"
              onClick={() => {
                setContextMenu(null);
                setCueModalOpen(true);
              }}
            >
              Cue/Macro 설정
            </button>
          )}
          {onUpdateCueMacro && hasCueMacro && (
            <button
              className="w-full text-left px-3 py-1.5 text-[13px] text-gray-300 hover:bg-white/10 transition-colors"
              onClick={() => {
                setContextMenu(null);
                onUpdateCueMacro(undefined);
              }}
            >
              Cue/Macro 해제
            </button>
          )}
          {(onDuplicate || onDelete) && <hr className="border-[#444] my-0.5" />}
          {onDuplicate && (
            <button
              className="w-full text-left px-3 py-1.5 text-[13px] text-gray-200 hover:bg-white/10 transition-colors"
              onClick={() => {
                setContextMenu(null);
                onDuplicate();
              }}
            >
              섹션 복제
            </button>
          )}
          {onDelete && (
            <button
              className="w-full text-left px-3 py-1.5 text-[13px] text-red-400 hover:bg-red-500/20 transition-colors"
              onClick={() => {
                setContextMenu(null);
                onDelete();
              }}
            >
              섹션 삭제
            </button>
          )}
        </div>
      </>
    )}

    {cueModalOpen && onUpdateCueMacro && (
      <SectionCueMacroModal
        section={section}
        onClose={() => setCueModalOpen(false)}
        onSave={(cueMacro) => {
          onUpdateCueMacro(cueMacro);
          setCueModalOpen(false);
        }}
      />
    )}
    </>
  );
});

/** 요소 없이 텍스트만 있을 때 기본 자막 스타일 렌더링 */
function renderFallbackText(
  ctx: CanvasRenderingContext2D,
  text: string,
  cw: number,
  ch: number
) {
  const fontSize = Math.round(cw * 0.05); // 약 26px @ 520w
  ctx.font = `bold ${fontSize}px "Noto Sans KR", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = Math.max(fontSize * 0.08, 1);
  ctx.lineJoin = 'round';

  const lines = text.split('\n').filter((l) => l.trim());
  const lineHeight = fontSize * 1.4;
  const totalH = lines.length * lineHeight;
  const startY = ch / 2 - totalH / 2 + lineHeight / 2;

  lines.forEach((line, i) => {
    const y = startY + i * lineHeight;
    ctx.strokeText(line, cw / 2, y);
    ctx.fillText(line, cw / 2, y);
  });
}

export default SectionCard;
