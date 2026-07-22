'use client';

// 송출 그리드 오버레이 — 홈키로 여는 전체화면 바둑판. 세트리스트 전 섹션을 16:9 타일로 덮는다.
//   타일 = 섹션 캔버스 미리보기(이미지·요소 포함, SectionCard 와 동일 렌더). 한 번 클릭 = 선택,
//   더블클릭/선택 후 Enter = 송출(부모의 sendToOutput 재사용). 송출 중 섹션은 강조하되 스크롤 위치는 유지한다.
//   헤더 슬라이더로 타일 크기(열 수)를 조절한다(localStorage 유지). Home/ESC 로 닫는다.

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import type { Section, PromptLayoutType } from '@/lib/types';
import type { TextElement } from '@/lib/canvasTypes';
import { renderElements, preloadImages, wrapText } from '@/lib/canvasRenderer';
import QuoteReferenceRail, {
  getQuoteReferenceItems,
  isQuoteReferenceProgram,
  useQuoteSectionViewport,
} from './QuoteReferenceRail';
import {
  runBroadcastGridPreflight,
  type BroadcastGridPreflightIssue,
} from './broadcastGridPreflight';
import styles from './BroadcastGridOverlay.module.css';
import { useBroadcastGridArrowNavigation } from './useBroadcastGridArrowNavigation';
import { useBroadcastGridProgramJump } from './useBroadcastGridProgramJump';

/**
 * 본문(body) 슬롯을 가진 템플릿 섹션의 텍스트를 추출한다(송출 그리드 전용 표시용).
 *   - 성경문구류(reference+body): 장절표기 + 본문
 *   - 찬송가·찬양 등 가사류(body만, reference 없음): 본문(가사)만 → 블랙+흰색가사 스타일로 표시
 *   body 가 없는 섹션(이미지·도형·PPT 슬라이드 등)은 null → 기존 요소 렌더 유지.
 */
function extractTextTileFields(section: Section): { reference: string; body: string } | null {
  let reference = '';
  let body = '';
  for (const el of section.elements ?? []) {
    if (el.type !== 'text') continue;
    const t = el as TextElement;
    const content = t.content?.trim();
    if (!content) continue;
    if (t.fieldRole === 'reference') reference = content;
    else if (t.fieldRole === 'body') body = content;
  }
  return body ? { reference, body } : null;
}

function hasVisibleRenderableElements(section: Section): boolean {
  return (section.elements ?? []).some((el) => el.visible !== false);
}

function hasRenderableLyricTextPath(section: Section): boolean {
  const fallback = section.text?.trim() ?? '';
  return (section.elements ?? []).some((el) => {
    if (el.type !== 'text' || el.visible === false) return false;
    const textElement = el as TextElement;
    if (textElement.content?.trim()) return true;
    return Boolean(fallback && (textElement.fieldRole === 'body' || textElement.linked));
  });
}

function resolveLyricPreviewText(
  section: Section,
  textTile: { reference: string; body: string } | null,
): { text: string; missingRenderableText: boolean } {
  const body = textTile?.body.trim() ?? '';
  if (body) return { text: textTile!.body, missingRenderableText: false };

  const fallback = section.text?.trim() ?? '';
  if (!fallback) return { text: '', missingRenderableText: false };

  // 요소가 있는 섹션에서 section.text 만으로 그리드가 정상 가사를 보여주면,
  // 실제 송출 캔버스에는 텍스트 요소가 없어 빈 화면이 나갈 수 있다.
  // 이 상태는 미리보기 폴백이 아니라 운영 경고로 드러낸다.
  const hasElements = hasVisibleRenderableElements(section);
  const hasLyricTextPath = hasRenderableLyricTextPath(section);
  return {
    text: section.text,
    missingRenderableText: hasElements && !hasLyricTextPath,
  };
}

const GRID_FONT = '"Apple SD Gothic Neo", "Noto Sans KR", sans-serif';
const FIXED_PRAISE_TITLES = ['송축해 내영혼', '파송의 노래', '오직 예수', '나의 하나님', '왕이신 나의 하나님'];
const FIXED_PRAISE_BG_FALLBACK = '#dbe8f6';
const FIXED_PRAISE_TEXT_FALLBACK = '#000000';

// [FEATURE: BROADCAST_GRID] 설교 타이틀류 카테고리 타일 — 파스텔 배경 + 검정 텍스트(내용만 센터).
//   말씀타이틀·제목/본문·설교자 = PASTEL_A, 대지타이틀 = PASTEL_B (구분색).
const PASTEL_A = '#dbe8f6'; // 연한 하늘
const PASTEL_B = '#f8e5cb'; // 연한 살구(대지타이틀 전용)

function normalizePraiseTitle(title: string): string {
  return title.replace(/[\s·:_()[\]<>-]+/g, '').trim().toLowerCase();
}

const FIXED_PRAISE_TITLE_KEYS = new Set(FIXED_PRAISE_TITLES.map((title) => normalizePraiseTitle(title)));

function isFixedPraiseProgram(title: string): boolean {
  const normalized = normalizePraiseTitle(title);
  return FIXED_PRAISE_TITLE_KEYS.has(normalized);
}

function isSermonMeditationSection(itemTitle: string, section: Section): boolean {
  return itemTitle.includes('설교대지') && /(?:^|-)meditation(?:-|$)/i.test(section.id);
}

function getCssVarColor(el: HTMLElement | null, name: string, fallback: string): string {
  if (!el) return fallback;
  return getComputedStyle(el).getPropertyValue(name).trim() || fallback;
}

function parseHymnDisplayTitle(title: string): { fullLabel: string; badgeLabel: string | null } {
  const cleaned = title.trim();
  const match = cleaned.match(/^[<\[]?\s*(\d{1,4})\s*장\s*[>\]]?\s*(?:[·:_-]\s*)?(.*)$/);
  if (!match) return { fullLabel: cleaned, badgeLabel: null };

  const hymnNumber = match[1];
  const titleText = (match[2] ?? '').trim();
  return {
    fullLabel: titleText ? `${hymnNumber} ${titleText}` : hymnNumber,
    badgeLabel: hymnNumber,
  };
}

function resolveHymnDisplayTitle(candidates: Array<string | undefined>): { fullLabel: string; badgeLabel: string | null } {
  const parsed = candidates
    .map((candidate) => parseHymnDisplayTitle(candidate ?? ''))
    .filter((item) => item.fullLabel);

  return (
    parsed.find((item) => item.badgeLabel && item.fullLabel !== item.badgeLabel) ??
    parsed.find((item) => item.badgeLabel) ??
    parsed[0] ??
    { fullLabel: '', badgeLabel: null }
  );
}

function normalizeHymnVerseLabel(value: string): string | null {
  const cleaned = value.trim();
  if (!cleaned) return null;
  if (/^후렴$/i.test(cleaned)) return '후렴';

  const verseMatch = cleaned.match(/^(\d{1,2})\s*절$/);
  if (verseMatch) return `${verseMatch[1]}절`;

  const bareNumberMatch = cleaned.match(/^(\d{1,2})$/);
  if (bareNumberMatch) return `${bareNumberMatch[1]}절`;

  return null;
}

function resolveHymnVerseLabel(section: Section): string | null {
  const verseSlot = (section.elements ?? []).find(
    (element): element is TextElement =>
      element.type === 'text' &&
      element.visible !== false &&
      element.fieldRole === 'verseLabel' &&
      Boolean(element.content?.trim()),
  );
  const fromSlot = verseSlot ? normalizeHymnVerseLabel(verseSlot.content) : null;
  if (fromSlot) return fromSlot;

  return normalizeHymnVerseLabel(section.label);
}

function getSlideBadgeTitle(title: string): string {
  return Array.from(title.trim()).slice(0, 15).join('');
}

function getCompactTextUnits(text: string): number {
  return Array.from(text).reduce((sum, char) => {
    if (/\s/.test(char)) return sum + 0.35;
    if (/[0-9A-Za-z]/.test(char)) return sum + 0.56;
    return sum + 1;
  }, 0);
}

function getHymnTitleBadgeStyle(label: string): CSSProperties {
  const units = Math.max(1, getCompactTextUnits(label));
  const fitCqw = Math.max(1.55, Math.min(4.7, 58 / units));
  return {
    '--broadcast-grid-hymn-badge-font-cqw': `${fitCqw.toFixed(2)}cqw`,
  } as CSSProperties;
}

/**
 * 설교 타이틀류(말씀타이틀/제목·본문/설교자/대지타이틀) 섹션이면 "파스텔+검정 내용" 타일로 표시.
 *   - 식별: 내용 요소(fieldRole 가진 텍스트)의 역할로 판별. body(본문형=성경·찬송·교독문 등)가
 *     있으면 대상 아님(기존 타일 유지) → 순수 additive, 기존 분기 불변.
 *   - point → 대지타이틀(PASTEL_B), title/name → 말씀·제목·설교자(PASTEL_A).
 *   - 표시 내용: 내용 요소들을 위→아래 순으로 이어붙인 "실제 내용"(템플릿 정적 문구 제외).
 */
function extractTitleTile(section: Section): { text: string; variant: 'a' | 'b' } | null {
  const contentEls = (section.elements ?? []).filter(
    (el): el is TextElement =>
      el.type === 'text' &&
      el.visible !== false &&
      !!(el as TextElement).fieldRole &&
      !!(el as TextElement).content?.trim(),
  );
  if (contentEls.length === 0) return null;
  const roles = new Set(contentEls.map((e) => e.fieldRole));
  if (roles.has('body')) return null; // 본문형(성경·찬송 등)은 기존 처리
  const variant: 'a' | 'b' | null = roles.has('point')
    ? 'b'
    : roles.has('title') || roles.has('name')
      ? 'a'
      : null;
  if (!variant) return null;
  const text = [...contentEls]
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .map((e) => e.content!.trim())
    .join('\n');
  return { text, variant };
}

/**
 * 가사 타일 — PMT black-white(renderBlackWhiteChoirLayout)와 동일 배치.
 *   배경 + 가사색을 받아 세로 중앙에 표시한다. 가사는 두 줄(줄바꿈 유지)로 두되, 한 줄이 폭을 넘치면
 *   그 줄만 폰트를 줄여 폭에 맞춘다.
 */
function drawLyricTile(
  ctx: CanvasRenderingContext2D,
  text: string,
  w: number,
  h: number,
  background: string,
  color: string,
  topInset = 0,
): void {
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, w, h);
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return;
  const maxW = w - w * 0.06 * 2;
  const safeTop = Math.max(0, Math.min(h * 0.32, topInset));
  const areaH = h - safeTop - h * 0.04;
  const lineHeightRatio = 1.35;

  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle = color;

  let baseFont = Math.round(h * 0.22); // 두 줄 기준 큰 가사
  let fontSizes: number[] = [];
  let lineHeights: number[] = [];
  let blockH = 0;
  while (baseFont >= 9) {
    // 줄별 폰트: 폭을 넘치는 줄만 축소 (PMT black-white 와 동일 규칙)
    fontSizes = lines.map((line) => {
      ctx.font = `bold ${baseFont}px ${GRID_FONT}`;
      const measured = ctx.measureText(line).width;
      return measured > maxW ? Math.max(9, Math.floor(baseFont * (maxW / measured))) : baseFont;
    });
    lineHeights = fontSizes.map((fs) => fs * lineHeightRatio);
    blockH = lineHeights.reduce((a, b) => a + b, 0);
    if (blockH <= areaH || baseFont === 9) break;
    baseFont = Math.max(9, baseFont - 2);
  }

  let y = safeTop + areaH / 2 - blockH / 2;
  lines.forEach((line, i) => {
    ctx.font = `bold ${fontSizes[i]}px ${GRID_FONT}`;
    ctx.fillText(line, w / 2, y);
    y += lineHeights[i];
  });
}

function drawHymnTile(ctx: CanvasRenderingContext2D, text: string, w: number, h: number, topInset = 0): void {
  drawLyricTile(ctx, text, w, h, '#000000', '#ffffff', topInset);
}

function drawMissingTextWarningTile(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.fillStyle = '#19070b';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#ef4444';
  ctx.lineWidth = Math.max(4, Math.round(w * 0.006));
  ctx.strokeRect(ctx.lineWidth / 2, ctx.lineWidth / 2, w - ctx.lineWidth, h - ctx.lineWidth);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fee2e2';
  ctx.font = `bold ${Math.round(h * 0.14)}px ${GRID_FONT}`;
  ctx.fillText('송출 텍스트 누락', w / 2, h * 0.42);

  ctx.fillStyle = '#fca5a5';
  ctx.font = `bold ${Math.round(h * 0.068)}px ${GRID_FONT}`;
  ctx.fillText('실제 텍스트 요소가 비어 있습니다', w / 2, h * 0.58);
}

/** 첫 줄만 폭을 줄여 본문을 감싼다 — 큰 장절표기 뒤에 본문을 이어 붙이는 인용 타일 전용. */
function wrapInlineReferenceBody(
  ctx: CanvasRenderingContext2D,
  text: string,
  firstLineMaxWidth: number,
  maxWidth: number,
): string[] {
  const result: string[] = [];
  const lineLimit = () => result.length === 0 ? firstLineMaxWidth : maxWidth;

  for (const para of text.split('\n')) {
    if (!para.trim()) {
      result.push('');
      continue;
    }

    const tokens = para.split(/(\s+)/).filter((token) => token.length > 0);
    let current = '';
    for (const rawToken of tokens) {
      const token = current ? rawToken : rawToken.replace(/^\s+/, '');
      if (!token) continue;

      const candidate = current + token;
      if (ctx.measureText(candidate).width <= lineLimit()) {
        current = candidate;
        continue;
      }

      if (current) {
        result.push(current.replace(/\s+$/, ''));
        current = '';
      }

      const cleanToken = token.replace(/^\s+/, '');
      if (!cleanToken) continue;
      if (ctx.measureText(cleanToken).width <= lineLimit()) {
        current = cleanToken;
        continue;
      }

      // 한 단어가 현재 줄 폭보다 길면 기존 wrapText 와 동일하게 글자 단위로 나눈다.
      for (const char of cleanToken) {
        if (current && ctx.measureText(current + char).width > lineLimit()) {
          result.push(current);
          current = char;
        } else {
          current += char;
        }
      }
    }
    if (current) result.push(current.replace(/\s+$/, ''));
  }

  return result.length > 0 ? result : [''];
}

/** 말씀찾기(인용) 타일 — 2배 장절표기를 본문 첫 줄 맨 앞에 두고 본문은 기존처럼 자동 축소. */
function drawInlineReferenceScriptureTile(
  ctx: CanvasRenderingContext2D,
  s: { reference: string; body: string },
  w: number,
  h: number,
  referenceSafeX = 0,
): void {
  const maxW = w - w * 0.06 * 2;
  const rightEdge = w - w * 0.06;
  const firstXFloor = Math.max(w * 0.06, referenceSafeX);
  const areaTop = h * 0.07;
  const areaH = h - areaTop - h * 0.06;
  const refFont = Math.max(22, Math.round(h * 0.17)); // 기존 0.085의 정확히 2배
  const gap = Math.max(8, Math.round(w * 0.015));

  ctx.textBaseline = 'top';
  ctx.font = `bold ${refFont}px ${GRID_FONT}`;
  const refWidth = ctx.measureText(s.reference).width;
  const availableFirstBodyWidth = rightEdge - firstXFloor - refWidth - gap;
  const referenceOnlyFirstLine = availableFirstBodyWidth < 20;
  const firstLineMaxWidth = Math.max(20, availableFirstBodyWidth);

  // 본문 시작 크기와 축소 단위는 기존 성경문구 타일과 동일하다.
  let fontSize = Math.round(h * 0.17);
  let lines: string[] = [];
  let bodyLineHeight = 0;
  let firstLineHeight = 0;
  let blockHeight = 0;
  while (fontSize >= 9) {
    ctx.font = `bold ${fontSize}px ${GRID_FONT}`;
    lines = referenceOnlyFirstLine
      ? ['', ...wrapText(ctx, s.body, maxW)]
      : wrapInlineReferenceBody(ctx, s.body, firstLineMaxWidth, maxW);
    bodyLineHeight = fontSize * 1.32;
    firstLineHeight = Math.max(refFont * 1.18, bodyLineHeight);
    blockHeight = firstLineHeight + Math.max(0, lines.length - 1) * bodyLineHeight;
    if (blockHeight <= areaH || fontSize === 9) break;
    fontSize = Math.max(9, fontSize - 2);
  }

  let y = areaTop + Math.max(0, (areaH - blockHeight) / 2);
  const firstBody = lines[0] ?? '';
  const inlineGap = firstBody ? gap : 0;
  ctx.font = `bold ${fontSize}px ${GRID_FONT}`;
  const firstBodyWidth = ctx.measureText(firstBody).width;
  const firstLineWidth = refWidth + inlineGap + firstBodyWidth;
  const firstX = Math.max((w - firstLineWidth) / 2, firstXFloor);

  ctx.textAlign = 'left';
  ctx.font = `bold ${refFont}px ${GRID_FONT}`;
  ctx.fillStyle = '#f5b53f';
  ctx.fillText(s.reference, firstX, y + Math.max(0, (firstLineHeight - refFont * 1.18) / 2));

  ctx.font = `bold ${fontSize}px ${GRID_FONT}`;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(firstBody, firstX + refWidth + inlineGap, y + Math.max(0, (firstLineHeight - bodyLineHeight) / 2));

  ctx.textAlign = 'center';
  y += firstLineHeight;
  for (let i = 1; i < lines.length; i += 1) {
    ctx.fillText(lines[i], w / 2, y);
    y += bodyLineHeight;
  }
}

type ScriptureTilePalette = {
  background?: string;
  reference?: string;
  body?: string;
};

/** 성경문구 타일 — 장절표기(위, 금색) + 본문(자동 축소해 타일 안에 다 들어오게, 흰색) */
function drawScriptureTile(
  ctx: CanvasRenderingContext2D,
  s: { reference: string; body: string },
  w: number,
  h: number,
  inlineReference = false,
  referenceSafeX = 0,
  palette: ScriptureTilePalette = {},
): void {
  if (palette.background) {
    ctx.fillStyle = palette.background;
    ctx.fillRect(0, 0, w, h);
  }

  if (inlineReference && s.reference) {
    drawInlineReferenceScriptureTile(ctx, s, w, h, referenceSafeX);
    return;
  }

  const maxW = w - w * 0.06 * 2;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  let areaTop = h * 0.07;
  if (s.reference) {
    const refFont = Math.max(11, Math.round(h * 0.085));
    ctx.font = `bold ${refFont}px ${GRID_FONT}`;
    ctx.fillStyle = palette.reference ?? '#f5b53f';
    ctx.fillText(s.reference, w / 2, areaTop);
    areaTop += refFont * 1.45;
  }

  const areaH = h - areaTop - h * 0.06;
  // 본문 폰트를 줄여가며 전체가 areaH 안에 들어오는 크기를 찾는다(fit-to-box)
  let fontSize = Math.round(h * 0.17);
  let lines: string[] = [];
  while (fontSize >= 9) {
    ctx.font = `bold ${fontSize}px ${GRID_FONT}`;
    lines = wrapText(ctx, s.body, maxW);
    if (lines.length * fontSize * 1.32 <= areaH) break;
    fontSize -= 2;
  }
  ctx.fillStyle = palette.body ?? '#ffffff';
  const blockH = lines.length * fontSize * 1.32;
  let y = areaTop + Math.max(0, (areaH - blockH) / 2);
  for (const line of lines) {
    ctx.fillText(line, w / 2, y);
    y += fontSize * 1.32;
  }
}

/** 설교 타이틀류 타일 — 파스텔 배경 + 검정 텍스트, 수평·수직 센터(자동 축소로 타일 안에) */
function drawTitleTile(ctx: CanvasRenderingContext2D, text: string, w: number, h: number, bg: string): void {
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  const maxW = w - w * 0.08 * 2;
  const areaH = h - h * 0.14;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  let fontSize = Math.round(h * 0.2);
  let lines: string[] = [];
  while (fontSize >= 10) {
    ctx.font = `bold ${fontSize}px ${GRID_FONT}`;
    lines = text.split('\n').flatMap((l) => wrapText(ctx, l, maxW));
    if (lines.length * fontSize * 1.3 <= areaH) break;
    fontSize -= 2;
  }
  ctx.fillStyle = '#000000';
  const blockH = lines.length * fontSize * 1.3;
  let y = Math.max(h * 0.07, (h - blockH) / 2);
  for (const line of lines) {
    ctx.fillText(line, w / 2, y);
    y += fontSize * 1.3;
  }
}

/** 순수 텍스트 섹션(요소 없음) 폴백 — 본문을 자동 축소해 중앙에 */
function drawFallbackText(ctx: CanvasRenderingContext2D, text: string, w: number, h: number): void {
  const maxW = w - w * 0.06 * 2;
  const areaH = h - h * 0.12;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  let fontSize = Math.round(h * 0.15);
  let lines: string[] = [];
  while (fontSize >= 9) {
    ctx.font = `bold ${fontSize}px ${GRID_FONT}`;
    lines = wrapText(ctx, text, maxW);
    if (lines.length * fontSize * 1.3 <= areaH) break;
    fontSize -= 2;
  }
  ctx.fillStyle = '#ffffff';
  const blockH = lines.length * fontSize * 1.3;
  let y = h * 0.06 + Math.max(0, (areaH - blockH) / 2);
  for (const line of lines) {
    ctx.fillText(line, w / 2, y);
    y += fontSize * 1.3;
  }
}

export interface BroadcastGridEntry {
  /** allSections 전역 인덱스(0-based) — 송출 번호는 index+1 */
  index: number;
  /** 프로그램 고유 ID — Tab 프로그램 점프의 그룹 기준 */
  itemId: string;
  itemTitle: string;
  section: Section;
  /** 이 섹션이 속한 프로그램의 PMT 레이아웃 — 'black-white'(찬송가)면 블랙+흰색가사 타일로 표시 */
  promptLayout?: PromptLayoutType;
  /** 프로그램 제목/PMT 기준으로 찬송가로 판정되면 첫 섹션 상단에 장·제목 헤더를 크게 표시 */
  isHymnProgram?: boolean;
  /** 찬송가 첫 섹션 헤더에 표시할 프로그램명(예: 317장 내 주 예수 주신 은혜) */
  hymnDisplayTitle?: string;
  /** 말씀찾기(본문) 장 전체 프로그램 — 숫자+Enter 입력 시 절 번호 우선 송출에 사용 */
  isScriptureMainProgram?: boolean;
  /** PPT/이미지 슬라이드 프로그램이면 첫 섹션에 저장된 곡/파일 제목을 표시 */
  isSlideImageProgram?: boolean;
  /** PPT/이미지 슬라이드 첫 섹션 제목 박스에 표시할 이름 */
  slideDisplayTitle?: string;
  /** 프로그램의 첫 섹션인지 */
  isFirstOfItem?: boolean;
}

interface Props {
  entries: BroadcastGridEntry[];
  broadcastSectionId: string | null;
  activeSectionId: string | null;
  onSelect: (index: number) => void;
  onBroadcast: (index: number) => void;
  onClearBroadcast: () => void;
  onOpenQuickBible: () => void;
  onOpenFixedPrograms: () => void;
  onClose: () => void;
}

// 출력 해상도(요소 좌표 기준) → 타일 캔버스 픽셀 (SectionCard 와 동일 비율 16:9)
const SOURCE_W = 1920;
const SOURCE_H = 1080;
const RENDER_W = 520;
const RENDER_H = 292;

// 타일 크기 = 열 수(적을수록 큼). 3~10열, 기본 6.
const COLS_KEY = 'unolive-broadcast-grid-cols';
const MARKED_SECTION_KEY = 'unolive-broadcast-grid-marked-section';
const MIN_COLS = 3;
const MAX_COLS = 10;
const DEFAULT_COLS = 6;

function loadColumns(): number {
  if (typeof window === 'undefined') return DEFAULT_COLS;
  const raw = Number(localStorage.getItem(COLS_KEY));
  if (Number.isInteger(raw) && raw >= MIN_COLS && raw <= MAX_COLS) return raw;
  return DEFAULT_COLS;
}

function loadMarkedSectionId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(MARKED_SECTION_KEY);
  } catch {
    return null;
  }
}

function parseScriptureVerseNumber(section: Section): number | null {
  const labelMatch = section.label.trim().match(/^(\d{1,3})(?:\s*절)?$/);
  if (labelMatch) return Number(labelMatch[1]);

  const reference = (section.elements ?? []).find(
    (element): element is TextElement =>
      element.type === 'text' &&
      element.fieldRole === 'reference' &&
      element.visible !== false &&
      Boolean(element.content?.trim()),
  );
  if (reference?.content) {
    const refMatch = reference.content.trim().match(/:(\d{1,3})(?:\D|$)/);
    if (refMatch) return Number(refMatch[1]);
  }

  return null;
}

/** 한 섹션 타일 — 섹션 요소(이미지 포함)를 캔버스로 렌더. 요소가 없으면 텍스트 폴백. */
function GridTile({
  entry,
  isLive,
  isBroadcasted,
  isSelected,
  isMarked,
  columns,
  scrollRootRef,
  onSelect,
  onBroadcast,
  onToggleMarker,
  onQuoteVisibilityChange,
  preflightIssues,
}: {
  entry: BroadcastGridEntry;
  isLive: boolean;
  isBroadcasted: boolean;
  isSelected: boolean;
  isMarked: boolean;
  preflightIssues: BroadcastGridPreflightIssue[];
  columns: number;
  scrollRootRef: RefObject<HTMLDivElement | null>;
  onSelect: (index: number) => void;
  onBroadcast: (index: number) => void;
  onToggleMarker: () => void;
  onQuoteVisibilityChange: (sectionId: string, visible: boolean) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const { section } = entry;
  // [FEATURE: BROADCAST_GRID] 성경문구류면 "장절표기 + 본문(자동 축소)"로, 그 외엔 섹션 요소를 렌더.
  const textTile = useMemo(() => extractTextTileFields(section), [section]);
  const lyricPreview = useMemo(() => resolveLyricPreviewText(section, textTile), [section, textTile]);
  // 설교 타이틀류(말씀타이틀/제목·본문/설교자/대지타이틀)면 파스텔+검정 내용 타일.
  const titleTile = useMemo(() => extractTitleTile(section), [section]);
  const fixedPraiseTile = useMemo(() => isFixedPraiseProgram(entry.itemTitle), [entry.itemTitle]);
  const sermonMeditationTile = useMemo(
    () => isSermonMeditationSection(entry.itemTitle, section),
    [entry.itemTitle, section],
  );
  const hymnTitleInfo = useMemo(
    () => resolveHymnDisplayTitle([section.label, entry.hymnDisplayTitle, entry.itemTitle]),
    [entry.hymnDisplayTitle, entry.itemTitle, section.label],
  );
  const showHymnHeader = Boolean(entry.isHymnProgram && entry.isFirstOfItem && hymnTitleInfo.badgeLabel);
  const hymnVerseLabel = useMemo(() => resolveHymnVerseLabel(section), [section]);
  const showHymnVerseBadge = Boolean(entry.isHymnProgram && hymnTitleInfo.badgeLabel && hymnVerseLabel);
  const hymnVerseBadgeText = showHymnVerseBadge
    ? `${hymnTitleInfo.badgeLabel}장 · ${hymnVerseLabel}`
    : '';
  const slideDisplayTitle = (entry.slideDisplayTitle || entry.itemTitle).trim();
  const showSlideTitle = Boolean(
    entry.isSlideImageProgram &&
    entry.isFirstOfItem &&
    !showHymnHeader &&
    slideDisplayTitle,
  );
  const slideBadgeTitle = useMemo(() => getSlideBadgeTitle(slideDisplayTitle), [slideDisplayTitle]);
  const inlineQuoteReference = entry.itemTitle.includes('말씀찾기(인용)');
  const quoteSectionRef = useQuoteSectionViewport(
    section.id,
    isQuoteReferenceProgram(entry.itemTitle),
    scrollRootRef,
    onQuoteVisibilityChange,
  );
  const numberDigits = String(entry.index + 1).length;
  const quoteNumberTextClass = numberDigits <= 1
    ? 'text-[19px]'
    : numberDigits === 2
      ? 'text-[15px]'
      : numberDigits === 3
        ? 'text-[11px]'
        : 'text-[9px]';
  const primaryPreflightIssue = useMemo(
    () =>
      preflightIssues.find((issue) => issue.severity === 'danger') ??
      preflightIssues[0] ??
      null,
    [preflightIssues],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const draw = () => {
      const tileRoot = canvas.parentElement;
      const fixedPraiseBg = getCssVarColor(tileRoot, '--broadcast-grid-fixed-praise-bg', FIXED_PRAISE_BG_FALLBACK);
      const fixedPraiseText = getCssVarColor(tileRoot, '--broadcast-grid-fixed-praise-text', FIXED_PRAISE_TEXT_FALLBACK);

      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, RENDER_W, RENDER_H);
      if (fixedPraiseTile && lyricPreview.text) {
        // 고정찬양 — 송출 그리드 전용 파스텔 배경 + 검정 가사. 색상은 CSS 모듈 변수에서 관리.
        if (lyricPreview.missingRenderableText) {
          drawMissingTextWarningTile(ctx, RENDER_W, RENDER_H);
        } else {
          drawLyricTile(ctx, lyricPreview.text, RENDER_W, RENDER_H, fixedPraiseBg, fixedPraiseText);
        }
      } else if (sermonMeditationTile && textTile) {
        // 설교대지 안 본문묵상 — 고정찬양과 같은 색상으로 성경 본문 타일을 표시.
        drawScriptureTile(ctx, textTile, RENDER_W, RENDER_H, false, 0, {
          background: fixedPraiseBg,
          reference: fixedPraiseText,
          body: fixedPraiseText,
        });
      } else if (entry.promptLayout === 'black-white') {
        // 찬송가 — 블랙+흰색가사 (가사는 body 슬롯 또는 section.text)
        if (lyricPreview.missingRenderableText) {
          drawMissingTextWarningTile(ctx, RENDER_W, RENDER_H);
        } else {
          drawHymnTile(ctx, lyricPreview.text, RENDER_W, RENDER_H, showHymnHeader ? RENDER_H * 0.16 : 0);
        }
      } else if (titleTile) {
        drawTitleTile(ctx, titleTile.text, RENDER_W, RENDER_H, titleTile.variant === 'b' ? PASTEL_B : PASTEL_A);
      } else if (textTile) {
        // DOM 번호 원이 캔버스 위에 겹치므로 실제 타일 폭을 캔버스 좌표로 환산해 첫 줄을 피한다.
        const badgeSafePx = 44; // 왼쪽 8px + 26.4px 원 + 충분한 시각 여백
        const referenceSafeX = inlineQuoteReference && canvas.clientWidth > 0
          ? Math.min(RENDER_W * 0.62, badgeSafePx * (RENDER_W / canvas.clientWidth))
          : 0;
        drawScriptureTile(ctx, textTile, RENDER_W, RENDER_H, inlineQuoteReference, referenceSafeX);
      } else if (section.elements && section.elements.length > 0) {
        ctx.save();
        ctx.scale(RENDER_W / SOURCE_W, RENDER_H / SOURCE_H);
        renderElements(ctx, section.elements, section.text, SOURCE_W, SOURCE_H);
        ctx.restore();
      } else if (section.text) {
        drawFallbackText(ctx, section.text, RENDER_W, RENDER_H);
      }
    };
    draw();
    // 이미지 요소는 첫 렌더 시 캐시 미스일 수 있으므로 프리로드 후 재렌더
    if (!textTile && !titleTile && section.elements?.some((el) => el.type === 'image' && el.visible !== false)) {
      void preloadImages(section.elements).then(draw);
    }
  }, [
    section.elements,
    section.text,
    textTile,
    lyricPreview,
    titleTile,
    entry.promptLayout,
    fixedPraiseTile,
    sermonMeditationTile,
    showHymnHeader,
    inlineQuoteReference,
    columns,
  ]);

  return (
    <div
      ref={quoteSectionRef}
      role="button"
      tabIndex={0}
      data-broadcast-grid-index={entry.index}
      onClick={() => onSelect(entry.index)}
      onDoubleClick={() => onBroadcast(entry.index)}
      aria-label={`${entry.index + 1}번 ${section.label}, 한 번 클릭 시 선택, 더블클릭 시 송출${isLive ? ', 현재 송출 중' : ''}`}
      aria-pressed={isLive}
      className={`${styles.tile} ${fixedPraiseTile || sermonMeditationTile ? styles.fixedPraiseTile : ''} ${isLive ? styles.liveTile : isSelected ? styles.selectedTile : ''} group relative cursor-pointer overflow-hidden rounded-lg border-2 transition-[border-color,box-shadow,transform] duration-150 ${
        isLive
          ? 'z-10'
        : isSelected
            ? 'border-blue-400/80'
          : isBroadcasted
            ? 'border-white/90 ring-1 ring-inset ring-white/30 shadow-[0_0_10px_rgba(255,255,255,0.2)]'
            : 'border-[#2a2a2a] hover:border-[#666] hover:shadow-[0_0_10px_rgba(255,255,255,0.12)]'
      }`}
      style={{ aspectRatio: '16 / 9' }}
    >
      <canvas
        ref={canvasRef}
        width={RENDER_W}
        height={RENDER_H}
        className="absolute inset-0 block h-full w-full"
      />
      {/* 송출 중 10px 투명 적색 테두리 — 마우스 선택 테두리보다 우선 표시 */}
      {isLive && (
        <span className={styles.liveOutline} />
      )}
      {isSelected && !isLive && (
        <span className={styles.selectedOutline} />
      )}

      {/* 섹션 고유번호 안전영역 — 주변 여백까지 송출 클릭을 막고, 번호는 마커만 켜고 끈다. */}
      <span
        className="absolute left-0 top-0 z-30 p-2"
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleMarker();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') e.stopPropagation();
          }}
          aria-label={`${entry.index + 1}번 섹션 마커 ${isMarked ? '해제' : '표시'}`}
          aria-pressed={isMarked}
          data-grid-marker-index={entry.index}
          title="마커 표시/해제 (송출되지 않음)"
          className={`flex cursor-pointer items-stretch rounded-md drop-shadow-[0_2px_5px_rgba(0,0,0,0.8)] transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 ${
            inlineQuoteReference ? 'h-[26.4px]' : 'h-6'
          }`}
        >
          <span
            className={`flex items-center justify-center border font-mono font-black leading-none tabular-nums ${
              inlineQuoteReference
                ? `h-[26.4px] w-[26.4px] flex-none rounded-full p-0 ${quoteNumberTextClass}`
                : 'min-w-7 px-1.5 text-[10px]'
            } ${
              isMarked
                ? inlineQuoteReference
                  ? 'border-amber-200 bg-amber-50 text-amber-800'
                  : 'rounded-l-md border-amber-200 bg-amber-50 text-amber-800'
                : inlineQuoteReference
                  ? 'border-white/40 bg-black/85 text-white shadow-[0_0_0_1px_rgba(255,255,255,0.18)] backdrop-blur-sm'
                  : 'rounded-md border-white/20 bg-black/75 text-gray-100 backdrop-blur-sm'
            }`}
          >
            {entry.index + 1}
          </span>
          {isMarked && (
            <span
              className={`flex items-center gap-1 border-y border-l border-amber-200/90 bg-gradient-to-r from-amber-400 to-orange-500 pl-1.5 pr-3 text-[8px] font-black tracking-[0.08em] text-black ${
                inlineQuoteReference ? '-ml-1' : '-ml-px'
              }`}
              style={{ clipPath: 'polygon(0 0, 100% 0, 84% 50%, 100% 100%, 0 100%)' }}
            >
              <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3 w-3 fill-black">
                <path d="M3 1.5a.75.75 0 0 1 .75.75v.35h7.7a.75.75 0 0 1 .62 1.17L10.9 5.5l1.17 1.73a.75.75 0 0 1-.62 1.17h-7.7v5.35a.75.75 0 0 1-1.5 0V2.25A.75.75 0 0 1 3 1.5Z" />
              </svg>
              마커
            </span>
          )}
        </button>
      </span>
      {isLive && (
        <span className="absolute right-1.5 top-1 z-20 rounded-md border border-red-200/70 bg-red-600 px-1.5 py-0.5 font-mono text-[9px] font-black tracking-widest text-white shadow-[0_2px_8px_rgba(239,68,68,0.65)]">
          LIVE
        </span>
      )}
      {primaryPreflightIssue && !isLive && (
        <span
          className={`absolute right-1.5 top-1 z-20 max-w-[78%] truncate rounded-md border px-1.5 py-0.5 text-[9px] font-black shadow-[0_2px_8px_rgba(0,0,0,0.55)] ${
            primaryPreflightIssue.severity === 'danger'
              ? 'border-red-200/80 bg-red-600 text-white'
              : 'border-amber-200/80 bg-amber-400 text-black'
          }`}
          title={primaryPreflightIssue.detail}
        >
          {primaryPreflightIssue.title}
        </span>
      )}
      {/* 찬송가 프로그램 첫 섹션 — 노란 박스 안에 "352 십자가 군병들아" 형식으로 표시 */}
      {showHymnHeader && (
        <span className={styles.hymnTitleBadge} style={getHymnTitleBadgeStyle(hymnTitleInfo.fullLabel)}>
          {hymnTitleInfo.fullLabel}
        </span>
      )}
      {showHymnVerseBadge && (
        <span className={styles.hymnVerseBadge}>
          {hymnVerseBadgeText}
        </span>
      )}
      {showSlideTitle && (
        <span className={styles.slideTitleBadge} style={getHymnTitleBadgeStyle(slideBadgeTitle)}>
          {slideBadgeTitle}
        </span>
      )}
      {!showSlideTitle && !showHymnVerseBadge && (
        <span className="absolute bottom-0.5 left-1.5 z-20 max-w-[90%] truncate rounded bg-black/50 px-1 text-[8px] text-gray-400">
          {section.label}
        </span>
      )}
    </div>
  );
}

export default function BroadcastGridOverlay({
  entries,
  broadcastSectionId,
  activeSectionId,
  onSelect,
  onBroadcast,
  onClearBroadcast,
  onOpenQuickBible,
  onOpenFixedPrograms,
  onClose,
}: Props) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [columns, setColumns] = useState<number>(loadColumns);
  const [markedSectionId, setMarkedSectionId] = useState<string | null>(loadMarkedSectionId);
  const [broadcastedSectionIds, setBroadcastedSectionIds] = useState<Set<string>>(
    () => broadcastSectionId ? new Set([broadcastSectionId]) : new Set(),
  );
  const preflight = useMemo(() => runBroadcastGridPreflight(entries), [entries]);

  useBroadcastGridArrowNavigation({
    entries,
    activeSectionId,
    columns,
    scrollRootRef: scrollRef,
    onSelect,
  });

  useBroadcastGridProgramJump({
    entries,
    activeSectionId,
    scrollRootRef: scrollRef,
    onSelect,
  });

  // [FEATURE: GRID_NUMBER_SEND] 그리드가 뜬 동안 폼 포커스 없이도 숫자 키 → 번호 버퍼, Enter → 송출.
  //   최신 버퍼값은 keydown 핸들러(재부착 최소화)에서 ref 로 읽는다.
  const [typedNum, setTypedNum] = useState('');
  const typedRef = useRef('');
  // 홈키 닫기 2단계 확인용 — 첫 누름 시각 (2초 안에 두 번 눌러야 닫힘)
  const lastHomeRef = useRef(0);
  useEffect(() => { typedRef.current = typedNum; }, [typedNum]);
  useEffect(() => {
    try {
      if (markedSectionId) localStorage.setItem(MARKED_SECTION_KEY, markedSectionId);
      else localStorage.removeItem(MARKED_SECTION_KEY);
    } catch { /* 저장 실패는 무시 */ }
  }, [markedSectionId]);

  const scriptureMainIndexByVerse = useMemo(() => {
    const byVerse = new Map<number, number>();
    for (const entry of entries) {
      if (!entry.isScriptureMainProgram && !entry.itemTitle.includes('말씀찾기(본문)')) continue;
      const verseNumber = parseScriptureVerseNumber(entry.section);
      if (!verseNumber || byVerse.has(verseNumber)) continue;
      byVerse.set(verseNumber, entry.index);
    }
    return byVerse;
  }, [entries]);

  const resolveNumberBroadcastIndex = useCallback(
    (value: number): number | null => {
      const scriptureMainIndex = scriptureMainIndexByVerse.get(value);
      if (scriptureMainIndex !== undefined) return scriptureMainIndex;
      return entries.some((entry) => entry.index === value - 1) ? value - 1 : null;
    },
    [entries, scriptureMainIndexByVerse],
  );

  const typedNumber = typedNum !== '' ? parseInt(typedNum, 10) : NaN;
  const typedBroadcastIndex = Number.isFinite(typedNumber) ? resolveNumberBroadcastIndex(typedNumber) : null;
  const typedSendsScriptureMain =
    Number.isFinite(typedNumber) && scriptureMainIndexByVerse.get(typedNumber) === typedBroadcastIndex;
  // 입력한 번호가 실제 존재하는 타일인지 (badge 색·송출 검증 공용)
  const typedValid = typedBroadcastIndex !== null;

  const handleBroadcast = useCallback((index: number) => {
    const entry = entries.find((item) => item.index === index);
    if (entry) {
      setBroadcastedSectionIds((current) => {
        if (current.has(entry.section.id)) return current;
        return new Set(current).add(entry.section.id);
      });
    }
    onBroadcast(index);
  }, [entries, onBroadcast]);

  const handleQuoteVisibilityChange = useCallback(() => {
    // 오른쪽 말씀찾기(인용) 번호송출 레일은 항상 고정 표시하므로 가시성 추적은 더 이상 레일 표시 조건에 쓰지 않는다.
  }, []);

  const quoteReferenceItems = useMemo(() => getQuoteReferenceItems(entries), [entries]);
  const quoteRailWidth = `calc((100vw - 8px - ${(columns - 1) * 4}px) / ${columns + 1})`;

  // 타일 크기(열 수) 변경 저장
  const changeColumns = (next: number) => {
    const clamped = Math.max(MIN_COLS, Math.min(MAX_COLS, next));
    setColumns(clamped);
    try {
      localStorage.setItem(COLS_KEY, String(clamped));
    } catch { /* 저장 실패는 무시 */ }
  };

  // 키 처리(캡처 단계 — 전역 핸들러보다 먼저):
  //   숫자 = 번호 버퍼 · Enter = 그 번호 송출 · Backspace = 한 자 지우기 · Delete = 송출 해제 · Home/ESC = 닫기.
  //   PageUp/PageDown·방향키는 건드리지 않고 통과시켜 기존 이동 송출과 그대로 연계된다.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // 모달 등 입력 필드에 포커스가 있으면 그리드 단축키를 가로채지 않는다 (긴급 말씀찾기 입력 보호)
      const t = e.target as HTMLElement | null;
      if (t && t.closest('input, textarea, [contenteditable="true"]')) return;
      // e.code 를 함께 확인해 한글 IME 상태에서도 물리 B(ㅂ) 키를 놓치지 않는다.
      // 그리드가 실제로 떠 있는 이 컴포넌트가 직접 열어 store effect 타이밍 문제를 없앤다.
      const isQuickBibleKey =
        !e.metaKey && !e.ctrlKey && !e.altKey &&
        (e.code === 'KeyB' || e.key === 'b' || e.key === 'B' || e.key === 'ㅂ');
      if (isQuickBibleKey) {
        e.preventDefault();
        e.stopPropagation();
        onOpenQuickBible();
        return;
      }
      const isFixedProgramKey =
        !e.metaKey && !e.ctrlKey && !e.altKey &&
        (e.code === 'KeyO' || e.key === 'o' || e.key === 'O' || e.key === 'ㅐ');
      if (isFixedProgramKey) {
        e.preventDefault();
        e.stopPropagation();
        onOpenFixedPrograms();
        return;
      }
      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        setTypedNum((t) => (t + e.key).replace(/^0+(?=\d)/, '').slice(0, 4));
        return;
      }
      if (e.key === 'Backspace') {
        e.preventDefault();
        setTypedNum((t) => t.slice(0, -1));
        return;
      }
      if (e.key === 'Delete') {
        e.preventDefault();
        e.stopPropagation();
        setTypedNum('');
        onClearBroadcast();
        return;
      }
      if (e.key === 'Enter') {
        const raw = typedRef.current;
        // 번호가 입력돼 있으면 번호 송출 전용으로 소비한다. 비어 있으면 통과시켜
        // 전역 Enter 단축키가 한 번 클릭으로 선택한 현재 섹션을 송출하게 한다.
        if (raw) {
          e.preventDefault();
          e.stopPropagation();
          setTypedNum('');
          const n = parseInt(raw, 10);
          if (Number.isFinite(n)) {
            const targetIndex = resolveNumberBroadcastIndex(n);
            if (targetIndex !== null) handleBroadcast(targetIndex);
          }
        }
        return;
      }
      if (e.key === 'Escape') {
        // ESC 로는 그리드를 닫지 않는다(운영 중 실수 방지) — 번호 버퍼만 비우고 삼킴.
        //   닫기는 Home 2회(2초 내) 전용. 전역 ESC(송출해제)로도 새지 않게 항상 소비.
        e.preventDefault();
        e.stopPropagation();
        if (typedRef.current) setTypedNum('');
        return;
      }
      if (e.key === 'Home') {
        e.preventDefault();
        e.stopPropagation();
        // 2초 안에 두 번 눌러야 닫힘 (운영 중 실수로 한 번 스쳐도 안 닫히게)
        const now = Date.now();
        if (now - lastHomeRef.current <= 2000) {
          lastHomeRef.current = 0;
          onClose();
        } else {
          lastHomeRef.current = now;
        }
      }
      // 그 외(PageUp/PageDown·↑↓ 등)는 통과 — 기존 마우스/이동 송출과 공존
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [onClose, handleBroadcast, onClearBroadcast, onOpenQuickBible, onOpenFixedPrograms, resolveNumberBroadcastIndex]);

  return createPortal(
    <div className="fixed inset-0 z-[9998] flex flex-col bg-black">
      <div className="flex flex-shrink-0 items-center gap-3 border-b border-[#222] bg-[#0a0a0a] px-4 py-1.5">
        <span className="text-[11px] font-bold text-red-400">송출 그리드</span>
          <span className="text-[10px] text-gray-500">
          1클릭 = 선택 · 화살표 = 그리드 이동 선택 · Tab = 프로그램 점프 선택 · Enter = 선택 송출 · 더블클릭 = 즉시 송출 · 숫자+Enter = 본문 절 우선/없으면 그리드 번호 · 그리드 번호 = 기억 마커 · 말씀찾기 번호 = 즉시 송출 · B = 긴급 말씀찾기 · O = 고정 프로그램 · Home 2번 = 닫기 · {entries.length}개 섹션
        </span>
        <span
          className={`rounded-md border px-2 py-0.5 text-[10px] font-bold ${
            preflight.summary.danger > 0
              ? 'border-red-500/70 bg-red-950/70 text-red-100'
              : preflight.summary.warning > 0
                ? 'border-amber-500/70 bg-amber-950/60 text-amber-100'
                : 'border-emerald-500/50 bg-emerald-950/50 text-emerald-100'
          }`}
          title={`검사 시각 ${new Date(preflight.checkedAt).toLocaleTimeString('ko-KR')}`}
        >
          {preflight.summary.danger > 0
            ? `송출점검: 메인 누락 ${preflight.summary.mainMissing}개`
            : preflight.summary.warning > 0
              ? `송출점검: 주의 ${preflight.summary.warning}개`
              : '송출점검: 정상'}
        </span>

        {/* 타일 크기(열 수) 조절 — 그리드 옆 슬라이더. 적을수록 타일이 커진다. */}
        <label className="ml-auto flex items-center gap-2 text-[10px] text-gray-500" title="타일 크기 조절">
          <span className="whitespace-nowrap">타일 크기</span>
          <button
            onClick={() => changeColumns(columns + 1)}
            className="h-5 w-5 rounded border border-[#333] bg-[#111] text-gray-400 hover:text-white"
            title="작게(열 늘리기)"
          >
            −
          </button>
          <input
            type="range"
            min={MIN_COLS}
            max={MAX_COLS}
            value={MAX_COLS + MIN_COLS - columns} /* 오른쪽=크게 되도록 반전 */
            onChange={(e) => changeColumns(MAX_COLS + MIN_COLS - Number(e.target.value))}
            className="w-28 accent-red-500"
          />
          <button
            onClick={() => changeColumns(columns - 1)}
            className="h-5 w-5 rounded border border-[#333] bg-[#111] text-gray-400 hover:text-white"
            title="크게(열 줄이기)"
          >
            +
          </button>
          <span className="w-8 font-mono text-gray-400">{columns}열</span>
        </label>

        <button onClick={onClose} className="text-sm text-gray-500 hover:text-white" title="닫기 (Home/ESC)">
          ✕
        </button>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* 위아래 수동 스크롤(스크롤바 숨김) — 타일 송출/선택 시 현재 위치 유지 */}
        <div
          ref={scrollRef}
          data-testid="broadcast-grid-scroll"
          className="min-w-0 flex-1 overflow-y-auto p-1 transition-[width] duration-300 ease-out [&::-webkit-scrollbar]:hidden"
          style={{ scrollbarWidth: 'none' }}
        >
          {entries.length === 0 ? (
            <p className="px-3 py-8 text-center text-xs text-gray-600">세트리스트에 섹션이 없습니다.</p>
          ) : (
            <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
              {entries.map((e) => (
                <GridTile
                  key={e.section.id}
                  entry={e}
                  isLive={e.section.id === broadcastSectionId}
                  isBroadcasted={broadcastedSectionIds.has(e.section.id) || e.section.id === broadcastSectionId}
                  isSelected={e.section.id === activeSectionId}
                  isMarked={e.section.id === markedSectionId}
                  preflightIssues={preflight.issueBySectionId.get(e.section.id) ?? []}
                  columns={columns}
                  scrollRootRef={scrollRef}
                  onSelect={onSelect}
                  onBroadcast={handleBroadcast}
                  onToggleMarker={() => setMarkedSectionId((current) => current === e.section.id ? null : e.section.id)}
                  onQuoteVisibilityChange={handleQuoteVisibilityChange}
                />
              ))}
            </div>
          )}
        </div>

        <QuoteReferenceRail
          items={quoteReferenceItems}
          width={quoteRailWidth}
          visible
          broadcastSectionId={broadcastSectionId}
          broadcastedSectionIds={broadcastedSectionIds}
          onBroadcast={handleBroadcast}
        />
      </div>

      {/* [FEATURE: GRID_NUMBER_SEND] 입력 중인 번호 표시 — 폼 포커스 없이도 숫자 치면 여기 뜬다 */}
      {typedNum !== '' && (
        <div className="pointer-events-none fixed bottom-8 left-1/2 z-[9999] flex -translate-x-1/2 items-center gap-3 rounded-xl border bg-black/85 px-6 py-3 shadow-2xl"
          style={{ borderColor: typedValid ? 'rgba(239,68,68,0.6)' : '#3a3a3a' }}>
          <span className="text-[11px] text-gray-400">송출 번호</span>
          <span className={`font-mono text-4xl font-bold tabular-nums ${typedValid ? 'text-white' : 'text-gray-600'}`}>
            {typedNum}
          </span>
          <span className="text-[11px] text-gray-500">
            {typedValid ? (typedSendsScriptureMain ? '본문절 ↵' : 'Enter ↵') : '없는 번호'}
          </span>
        </div>
      )}
    </div>,
    document.body,
  );
}
