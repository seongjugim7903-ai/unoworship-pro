'use client';

/**
 * InlineTextEditor.tsx
 * 텍스트 요소 인라인 편집 전담 컴포넌트 (EditorCanvas에서 분리)
 *
 * 사용처: TextElementView — 더블클릭(requestEdit) 시 렌더링
 *
 * [FEATURE: CANVAS_SCALE]
 *   TextElementView에서 계산한 scale(= 캔버스실제너비 / 1920)을 prop으로 받아
 *   fontSize / strokeWidth / letterSpacing 을 동일하게 스케일 적용.
 *   에디터 창 크기 변경 시 텍스트·편집 커서가 함께 스케일됨.
 *
 * 기능:
 *  - 마운트 즉시 textarea 포커스 + 커서 끝으로 이동
 *  - linked 요소이고 content가 없으면 sectionText를 편집 초기값으로 표시
 *  - Esc / Ctrl+Enter → onClose
 *  - blur → onClose
 *  - 캔버스 단축키 이벤트 버블링 차단
 */

import React, { useCallback, useEffect, useRef } from 'react';
import { TextElement } from '@/lib/canvasTypes';
import { getTextElementContent } from '@/lib/sectionText';

export interface InlineTextEditorProps {
  element: TextElement;
  sectionText: string;
  /** 캔버스 스케일 (= 실제캔버스너비 / 1920). 기본값 1 */
  scale?: number;
  /** 캔버스 실제 높이 (px) — 자동 높이 계산용 */
  canvasHeight?: number;
  /** 캔버스 실제 너비 (px) — 자동 너비 계산용 */
  canvasWidth?: number;
  /** true면 전체 선택 상태로 열림 (클릭 진입), false면 커서 끝 (더블클릭 진입) */
  selectAll?: boolean;
  onContentChange: (content: string) => void;
  /** 텍스트 줄이 늘어나면 요소 높이 자동 확장 (% 단위) */
  onHeightChange?: (newHeight: number) => void;
  /** 텍스트가 늘어나면 요소 너비 자동 확장 (% 단위) */
  onWidthChange?: (newWidth: number) => void;
  onClose: () => void;
}

export default function InlineTextEditor({
  element,
  sectionText,
  scale = 1,
  canvasHeight = 1080,
  canvasWidth = 1920,
  selectAll: selectAllProp = false,
  onContentChange,
  onHeightChange,
  onWidthChange,
  onClose,
}: InlineTextEditorProps) {
  const aw = element.autoWidth ?? true;
  const ah = element.autoHeight ?? true;
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ── [AUTO_SIZE] textarea 크기를 콘텐츠에 맞게 실시간 조절 ──
  const autoResizeTextarea = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;

    // 높이 자동 조절 (autoHeight 모드)
    if (ah && onHeightChange && canvasHeight > 0) {
      ta.style.height = 'auto';
      const scrollH = ta.scrollHeight;
      ta.style.height = `${scrollH}px`;
      const pctH = (scrollH / canvasHeight) * 100;
      onHeightChange(Math.round(pctH * 10) / 10);
    }

    // 너비 자동 조절 (autoWidth 모드)
    if (aw && onWidthChange && canvasWidth > 0) {
      ta.style.width = 'auto';
      const scrollW = ta.scrollWidth;
      // 최소 너비: 커서 + 여유
      const minW = element.fontSize * scale * 2;
      const finalW = Math.max(scrollW, minW);
      ta.style.width = `${finalW}px`;
      const pctW = (finalW / canvasWidth) * 100;
      onWidthChange(Math.round(pctW * 10) / 10);
    }
  }, [aw, ah, canvasWidth, canvasHeight, scale, element.fontSize, onWidthChange, onHeightChange]);

  // ── 마운트 시 포커스 + 선택 모드 결정 ──
  const isPlaceholderText = element.content === '여기에 텍스트 입력';
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      const ta = textareaRef.current;
      if (!ta) return;
      ta.focus();
      if (isPlaceholderText || selectAllProp) {
        // 플레이스홀더 또는 클릭 진입 → 전체 선택 (바로 타이핑하면 대체)
        ta.setSelectionRange(0, ta.value.length);
      } else {
        // 더블클릭 진입 → 커서 끝
        const len = ta.value.length;
        ta.setSelectionRange(len, len);
      }
      autoResizeTextarea();
    });
    return () => cancelAnimationFrame(raf);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 키보드 핸들러 ───────────────────────────────────
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      e.stopPropagation();
      onClose();
      return;
    }
    e.stopPropagation(); // 캔버스 단축키 차단
  };

  // ── [FEATURE: CANVAS_SCALE] 스케일된 스타일 ────────
  const sw = element.strokeWidth * scale;
  const strokeShadow = sw > 0
    ? [
        `0 0 ${sw}px ${element.strokeColor}`,
        `${sw}px 0 ${element.strokeColor}`,
        `-${sw}px 0 ${element.strokeColor}`,
        `0 ${sw}px ${element.strokeColor}`,
        `0 -${sw}px ${element.strokeColor}`,
      ].join(', ')
    : undefined;

  const gradientStyle: React.CSSProperties =
    element.useGradient && element.gradient
      ? {
          background:
            element.gradient.type === 'radial'
              ? `radial-gradient(circle, ${element.gradient.stops
                  .map((s) => `${s.color} ${s.offset * 100}%`).join(', ')})`
              : `linear-gradient(${element.gradient.angle}deg, ${element.gradient.stops
                  .map((s) => `${s.color} ${s.offset * 100}%`).join(', ')})`,
          WebkitBackgroundClip: 'text',
          backgroundClip: 'text',
        }
      : {};

  const textareaStyle: React.CSSProperties = {
    fontFamily:    `"${element.fontFamily}", sans-serif`,
    fontSize:      `${element.fontSize * scale}px`,        // ← 스케일 적용
    fontWeight:    element.fontWeight,
    fontStyle:     element.fontStyle,
    textAlign:     element.textAlign,
    lineHeight:    element.lineHeight,
    letterSpacing: `${element.letterSpacing * scale}px`,   // ← 스케일 적용
    color:         element.useGradient ? 'transparent' : element.color,
    textShadow:    element.useGradient ? undefined : strokeShadow,
    whiteSpace:    aw ? 'pre' : 'pre-wrap',      // auto너비: 줄바꿈 없이 / 고정너비: 자동 줄바꿈
    wordBreak:     'keep-all',
    overflowWrap:  aw ? 'normal' : 'break-word',
    ...gradientStyle,
    // 레이아웃
    width:   aw ? 'auto' : '100%',
    minWidth: aw ? `${element.fontSize * scale * 2}px` : undefined,  // 최소 커서 너비
    minHeight: ah ? undefined : '100%',
    height:  ah ? 'auto' : '100%',
    padding: `0 ${Math.ceil(element.fontSize * 0.08 * scale)}px`,  // 좌우 여백 (출력 Canvas와 동일)
    boxSizing: 'border-box',
    overflow: 'hidden',      // 스크롤바 제거
    // 편집 UI
    background:          'transparent',
    border:              'none',
    outline:             'none',
    resize:              'none',
    cursor:              'text',
    caretColor:          '#3b82f6',
    WebkitTextFillColor: element.useGradient ? undefined : element.color,
  };
  // [/FEATURE: CANVAS_SCALE]

  // linked 요소이고 content가 없으면 sectionText를 초기값으로 표시
  // non-linked 요소: content 그대로 표시 (플레이스홀더 포함)
  const editValue = getTextElementContent(element, sectionText);

  return (
    <textarea
      ref={textareaRef}
      value={editValue}
      onChange={(e) => {
        onContentChange(e.target.value);
        // 다음 프레임에서 auto-resize (DOM 업데이트 후)
        requestAnimationFrame(autoResizeTextarea);
      }}
      onBlur={() => onClose()}
      onPointerDown={(e) => e.stopPropagation()} // 드래그 방지
      onKeyDown={handleKeyDown}
      placeholder={
        element.linked
          ? '가사 대신 직접 입력 (빈 칸이면 가사 사용)'
          : '여기에 텍스트 입력'
      }
      style={textareaStyle}
    />
  );
}
