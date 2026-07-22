/**
 * 찬양대 전용 PMT 레이아웃 렌더러
 *
 * 블랙 배경 + 큰 흰색 가사처럼 템플릿 형태로 미리 들어가는 PMT 디자인은
 * 찬양대/무대팀 전용 기능으로 분리해 관리한다.
 */

import type { PromptLayoutType } from '@/lib/types';

let resolvedFont = '';

function getNotoSansKR(): string {
  if (resolvedFont) return resolvedFont;
  if (typeof document === 'undefined') return 'sans-serif';
  const value = getComputedStyle(document.body).getPropertyValue('--font-noto-sans-kr').trim();
  if (value) {
    resolvedFont = value;
    return value;
  }
  return '"Noto Sans KR", sans-serif';
}

export interface PromptVerseContext {
  /** 프로그램 전체 섹션(절) 텍스트 목록 */
  verses: string[];
  /** 현재 송출 중인 절의 인덱스 */
  currentIndex: number;
  /** [FEATURE: SCRIPTURE_PMT] 말씀본문 전체 구간(예 "마 5:4-25") — 서브 상단 고정 헤더용 */
  passage?: string;
}

export function renderChoirPromptLayout(
  ctx: CanvasRenderingContext2D,
  layout: PromptLayoutType,
  currentText: string,
  nextSectionText: string,
  canvasWidth: number,
  canvasHeight: number,
  verseContext?: PromptVerseContext,
  scriptureScrollY?: number,
): boolean {
  if (layout === 'black-white') {
    renderBlackWhiteChoirLayout(ctx, currentText, nextSectionText, canvasWidth, canvasHeight);
    return true;
  }
  if (layout === 'scripture') {
    // [FEATURE: SCRIPTURE_PMT] 말씀본문 — 프로그램 전체 절을 세로로 이어 붙여, 현재 섹션이
    //   서브 모니터 세로 센터로 오도록 연속 스크롤. scrollY(부드러운 센터 추종 애니메이션)는
    //   호출측(AtemKeyCanvas)이 lerp로 관리한다. 전체 절이 없으면 단일 본문 중앙 폴백.
    if (verseContext && verseContext.verses.length > 0) {
      renderScriptureScroll(ctx, verseContext.verses, verseContext.currentIndex, scriptureScrollY ?? 0, canvasWidth, canvasHeight, verseContext.passage);
    } else {
      renderScriptureSingle(ctx, currentText, canvasWidth, canvasHeight);
    }
    return true;
  }
  if (layout === 'bible') {
    // 전체 절 목록이 오면 목사님용 전체 보기(현재 절 강조 + 다음 절들 미리 보기),
    // 없으면 단일 절 렌더로 폴백 (구버전 페이로드·/prompt 페이지 호환)
    if (verseContext && verseContext.verses.length > 0) {
      renderBibleVerseListLayout(ctx, verseContext, canvasWidth, canvasHeight);
    } else {
      renderBibleLayout(ctx, currentText, nextSectionText, canvasWidth, canvasHeight);
    }
    return true;
  }
  return false;
}

const CURRENT_FONT_SIZE = 136;
const CURRENT_LINE_HEIGHT = 1.35;
const NEXT_FONT_SIZE = Math.round(CURRENT_FONT_SIZE * 0.5);

// ── 말씀본문(scripture) 레이아웃 ─────────────────────────────────────────────
// 무대 목사님용: 검정 배경 + 본문 큰 글자(중앙 세로 정렬, 자동 줄바꿈·자동 축소).
// 섹션이 바뀌면 아래에서 위로 부드럽게 슬라이드하며 등장(fade + 상향 이동).
const SCRIPTURE_FONT_SIZE = 100;       // 폴백(단일 본문) 최대 폰트
const SCRIPTURE_MIN_FONT_SIZE = 52;
const SCRIPTURE_LINE_HEIGHT = 1.45;

// 전체 절 연속 스크롤용 — 여러 절이 세로로 이어지므로 단일보다 작게, 절 사이 간격을 둔다.
const SCRIPTURE_SCROLL_FONT_SIZE = 78;
const SCRIPTURE_SCROLL_LINE_HEIGHT = 1.5;
const SCRIPTURE_VERSE_GAP = 56;
const SCRIPTURE_SIDE_PADDING_RATIO = 0.06;

/** 본문을 검정 배경 위 흰 글자로, 지정한 세로 오프셋·투명도로 그린다(중앙 정렬). 배경은 그리지 않음. */
function drawScriptureBlock(
  ctx: CanvasRenderingContext2D,
  text: string,
  width: number,
  height: number,
  offsetY: number,
  alpha: number,
): void {
  if (!text || alpha <= 0.01) return;
  const fontFamily = getNotoSansKR();
  const maxTextWidth = width - width * 0.06 * 2;
  const areaHeight = height * 0.82;

  let fontSize = SCRIPTURE_FONT_SIZE;
  let lines: string[] = [];
  while (fontSize >= SCRIPTURE_MIN_FONT_SIZE) {
    ctx.font = `bold ${fontSize}px ${fontFamily}, sans-serif`;
    lines = wrapText(ctx, text, maxTextWidth);
    if (lines.length * fontSize * SCRIPTURE_LINE_HEIGHT <= areaHeight) break;
    fontSize -= 4;
  }

  const blockHeight = lines.length * fontSize * SCRIPTURE_LINE_HEIGHT;
  let y = height / 2 - blockHeight / 2 + offsetY;

  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  ctx.font = `bold ${fontSize}px ${fontFamily}, sans-serif`;
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (const line of lines) {
    ctx.fillText(line, width / 2, y);
    y += fontSize * SCRIPTURE_LINE_HEIGHT;
  }
  ctx.restore();
}

/** 전체 절이 없을 때 폴백 — 현재 본문 하나만 검정 배경 중앙에 크게 */
function renderScriptureSingle(
  ctx: CanvasRenderingContext2D,
  text: string,
  width: number,
  height: number,
): void {
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, width, height);
  if (!text) return; // 빈 섹션은 검정 유지 (방송 화면 — 진단 문구 금지)
  drawScriptureBlock(ctx, text, width, height, 0, 1);
}

interface ScriptureItem {
  /** 문서 좌표(스크롤 전) 상단 y */
  yTop: number;
  height: number;
  lines: string[];
  /** 첫 줄 맨 앞의 장절표기 프리픽스(끝 공백 포함, 없으면 '') — 금색으로 강조 렌더 */
  refPrefix: string;
}

/**
 * 전체 절을 세로로 이어 배치(문서 좌표) — 각 절을 wrap 후 높이·y위치를 계산한다.
 * 장절표기(reference)는 본문 앞에 붙여 첫 줄 맨 앞에 오게 한다(왼쪽 정렬).
 * render 와 target 계산이 같은 레이아웃을 쓰도록 공용화 (측정 규칙 일치 보장).
 */
function layoutScripture(
  ctx: CanvasRenderingContext2D,
  verses: string[],
  width: number,
): { items: ScriptureItem[]; fontFamily: string } {
  const fontFamily = getNotoSansKR();
  const maxTextWidth = width - width * SCRIPTURE_SIDE_PADDING_RATIO * 2;
  ctx.font = `bold ${SCRIPTURE_SCROLL_FONT_SIZE}px ${fontFamily}, sans-serif`;
  const items: ScriptureItem[] = [];
  let y = 0;
  for (const v of verses) {
    const { reference, body } = splitBibleText(v);
    const refPrefix = reference ? `${reference}  ` : '';
    const lines = wrapText(ctx, refPrefix + (body || v), maxTextWidth);
    const h = Math.max(1, lines.length) * SCRIPTURE_SCROLL_FONT_SIZE * SCRIPTURE_SCROLL_LINE_HEIGHT;
    items.push({ yTop: y, height: h, lines, refPrefix });
    y += h + SCRIPTURE_VERSE_GAP;
  }
  return { items, fontFamily };
}

/** 현재 섹션이 화면 세로 센터에 오는 목표 scrollY(문서 좌표) — AtemKeyCanvas 의 lerp 목표값. */
export function scriptureTargetScrollY(
  ctx: CanvasRenderingContext2D,
  verses: string[],
  currentIndex: number,
  width: number,
  height: number,
): number {
  const { items } = layoutScripture(ctx, verses, width);
  if (items.length === 0) return 0;
  const idx = Math.max(0, Math.min(currentIndex, items.length - 1));
  const it = items[idx];
  return it.yTop + it.height / 2 - height / 2;
}

/**
 * 전체 절 세로 목록을 scrollY 만큼 이동해 그린다(검정 배경). 현재 절은 흰색, 나머지는 어둡게.
 * scrollY 는 호출측이 부드럽게 lerp 한 값 — 이 함수는 그 순간의 정적 프레임만 그린다.
 */
const SCRIPTURE_HEADER_FONT_SIZE = 54;
const SCRIPTURE_HEADER_HEIGHT_RATIO = 0.1; // 상단 헤더 밴드 높이(화면 비율)

export function renderScriptureScroll(
  ctx: CanvasRenderingContext2D,
  verses: string[],
  currentIndex: number,
  scrollY: number,
  width: number,
  height: number,
  passage?: string,
): void {
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, width, height);
  const { items, fontFamily } = layoutScripture(ctx, verses, width);
  if (items.length === 0) {
    drawScriptureHeader(ctx, passage, width, height, fontFamily);
    return;
  }
  const idx = Math.max(0, Math.min(currentIndex, items.length - 1));
  const padding = width * SCRIPTURE_SIDE_PADDING_RATIO;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  const lineStep = SCRIPTURE_SCROLL_FONT_SIZE * SCRIPTURE_SCROLL_LINE_HEIGHT;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const screenTop = it.yTop - scrollY;
    if (screenTop + it.height < -40 || screenTop > height + 40) continue; // 화면 밖 스킵
    ctx.font = `bold ${SCRIPTURE_SCROLL_FONT_SIZE}px ${fontFamily}, sans-serif`;
    const isCurrent = i === idx;
    const bodyColor = isCurrent ? '#ffffff' : '#5c5c5c';
    const refColor = isCurrent ? BIBLE_REFERENCE_COLOR : '#8a7635';
    it.lines.forEach((line, li) => {
      const ly = screenTop + li * lineStep;
      // 첫 줄 맨 앞의 장절표기만 금색, 나머지 본문은 흰색(왼쪽 정렬)
      if (li === 0 && it.refPrefix && line.startsWith(it.refPrefix)) {
        ctx.fillStyle = refColor;
        ctx.fillText(it.refPrefix, padding, ly);
        const refW = ctx.measureText(it.refPrefix).width;
        ctx.fillStyle = bodyColor;
        ctx.fillText(line.slice(it.refPrefix.length), padding + refW, ly);
      } else {
        ctx.fillStyle = bodyColor;
        ctx.fillText(line, padding, ly);
      }
    });
  }
  // 상단 고정 헤더(본문 구간) — 스크롤 절 위에 덮어 그려 항상 보이게 한다.
  drawScriptureHeader(ctx, passage, width, height, fontFamily);
}

/**
 * [FEATURE: SCRIPTURE_PMT] 서브 상단 고정 헤더 — 말씀본문 전체 구간(예 "마 5:4-25")을 금색으로.
 * 검정 밴드로 위쪽 스크롤 절을 가린 뒤 그 위에 그린다(구간 없으면 아무것도 안 그림).
 */
function drawScriptureHeader(
  ctx: CanvasRenderingContext2D,
  passage: string | undefined,
  width: number,
  height: number,
  fontFamily: string,
): void {
  if (!passage) return;
  const bandH = height * SCRIPTURE_HEADER_HEIGHT_RATIO;
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, width, bandH);
  ctx.save();
  ctx.font = `bold ${SCRIPTURE_HEADER_FONT_SIZE}px ${fontFamily}, sans-serif`;
  ctx.fillStyle = BIBLE_REFERENCE_COLOR;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(passage, width / 2, bandH / 2);
  ctx.restore();
}

// ── 성경본문(bible) 레이아웃 ─────────────────────────────────────────────────
// 설교용: 검정 배경 + 장절 표기(상단, 골드) + 본문 큰 글자(중앙, 자동 줄바꿈·자동 축소)
// 데이터는 기존 payload 그대로 — sectionText 안의 "요한복음 3:16" 형태 줄을 장절로 분리한다.

const BIBLE_REFERENCE_PATTERN = /^[가-힣A-Za-z0-9\s·]+\d+\s*:\s*\d+(\s*[-~]\s*\d+)?\s*$/;
const BIBLE_BODY_FONT_SIZE = 88;
const BIBLE_BODY_MIN_FONT_SIZE = 44;
const BIBLE_LINE_HEIGHT = 1.5;
const BIBLE_REFERENCE_FONT_SIZE = 52;
const BIBLE_REFERENCE_COLOR = '#d9b64e';

/** sectionText에서 장절 줄과 본문 줄을 분리 (장절 패턴 줄이 없으면 reference는 빈 문자열) */
export function splitBibleText(text: string): { reference: string; body: string } {
  const lines = text.split('\n').map((l) => l.trim()).filter((l) => l !== '');
  const refIndex = lines.findIndex((l) => BIBLE_REFERENCE_PATTERN.test(l));
  if (refIndex < 0) return { reference: '', body: lines.join('\n') };
  const reference = lines[refIndex];
  const body = lines.filter((_, i) => i !== refIndex).join('\n');
  return { reference, body };
}

/** 주어진 폭에 맞춰 단어 우선(불가하면 글자 단위) 줄바꿈 */
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const wrapped: string[] = [];
  for (const paragraph of text.split('\n')) {
    if (paragraph.trim() === '') continue;
    let line = '';
    for (const word of paragraph.split(' ')) {
      const candidate = line ? `${line} ${word}` : word;
      if (ctx.measureText(candidate).width <= maxWidth) {
        line = candidate;
        continue;
      }
      if (line) wrapped.push(line);
      // 단어 하나가 폭을 넘으면 글자 단위로 쪼갠다 (한글 장문 대응)
      if (ctx.measureText(word).width <= maxWidth) {
        line = word;
      } else {
        let chunk = '';
        for (const ch of word) {
          if (ctx.measureText(chunk + ch).width > maxWidth && chunk) {
            wrapped.push(chunk);
            chunk = ch;
          } else {
            chunk += ch;
          }
        }
        line = chunk;
      }
    }
    if (line) wrapped.push(line);
  }
  return wrapped;
}

/** 절 텍스트의 장절 줄에서 절 번호 추출 ("창세기 1:12" → "12", "1:1-2" → "1") */
function extractVerseNumber(reference: string): string {
  const m = reference.match(/:\s*(\d+)/);
  return m ? m[1] : '';
}

/**
 * 목사님용 전체 보기 — 프로그램의 모든 절을 목록으로.
 * 이전 1절(어둡게) + 현재 절(흰색·크게) + 다음 절들(회색)을 화면이 허용하는 만큼 표시.
 * 회중(main)은 이 레이아웃과 무관하게 기본 섹션 렌더가 그대로 나간다.
 */
function renderBibleVerseListLayout(
  ctx: CanvasRenderingContext2D,
  { verses, currentIndex }: PromptVerseContext,
  width: number,
  height: number,
): void {
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, width, height);

  const fontFamily = getNotoSansKR();
  const padding = width * 0.05;
  const maxTextWidth = width - padding * 2;
  const parsed = verses.map((v) => {
    const { reference, body } = splitBibleText(v);
    return { reference, body: body || v, num: extractVerseNumber(reference) };
  });
  const current = parsed[Math.min(currentIndex, parsed.length - 1)];

  // ── 헤더(고정): 전체 본문 책장절(골드) + 진행 표시 ──
  //   현재 절이 아니라 프로그램 전체 본문 범위를 최상단에 고정 표기한다(예: 마 5:1-48).
  const firstRef = parsed.find((p) => p.reference)?.reference ?? current.reference ?? '';
  const bookChapter = firstRef.replace(/\s*:\s*\d.*$/, '').trim(); // "마 5:1" → "마 5"
  const verseNums = parsed.map((p) => Number(p.num)).filter((n) => Number.isFinite(n) && n > 0);
  const headerRef =
    bookChapter && verseNums.length > 0
      ? `${bookChapter}:${Math.min(...verseNums)}-${Math.max(...verseNums)}`
      : firstRef;

  const headerY = height * 0.045;
  ctx.textBaseline = 'top';
  if (headerRef) {
    ctx.font = `bold 46px ${fontFamily}, sans-serif`;
    ctx.fillStyle = BIBLE_REFERENCE_COLOR;
    ctx.textAlign = 'left';
    ctx.fillText(headerRef, padding, headerY);
  }
  ctx.font = `normal 34px ${fontFamily}, sans-serif`;
  ctx.fillStyle = '#666666';
  ctx.textAlign = 'right';
  ctx.fillText(`${currentIndex + 1} / ${parsed.length}절`, width - padding, headerY + 8);

  const dividerY = headerY + 46 + 24;
  ctx.strokeStyle = '#3a3428';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(padding, dividerY);
  ctx.lineTo(width - padding, dividerY);
  ctx.stroke();

  // ── 절 그리기 헬퍼 ──
  const drawVerse = (
    entry: { body: string; num: string },
    y: number,
    fontSize: number,
    color: string,
    bold: boolean,
    maxLines: number,
  ): number => {
    ctx.font = `${bold ? 'bold' : 'normal'} ${fontSize}px ${fontFamily}, sans-serif`;
    ctx.textAlign = 'left';
    const numPrefix = entry.num ? `${entry.num} ` : '';
    let lines = wrapText(ctx, numPrefix + entry.body, maxTextWidth);
    let truncated = false;
    if (lines.length > maxLines) {
      lines = lines.slice(0, maxLines);
      truncated = true;
    }
    const lineHeight = fontSize * 1.42;
    lines.forEach((line, i) => {
      const lineText = truncated && i === lines.length - 1 ? `${line}…` : line;
      if (entry.num && i === 0) {
        // 절 번호는 골드 계열로 분리 표시
        ctx.fillStyle = bold ? BIBLE_REFERENCE_COLOR : '#8a7635';
        ctx.fillText(numPrefix, padding, y + i * lineHeight);
        const numWidth = ctx.measureText(numPrefix).width;
        ctx.fillStyle = color;
        ctx.fillText(lineText.slice(numPrefix.length), padding + numWidth, y + i * lineHeight);
      } else {
        ctx.fillStyle = color;
        ctx.fillText(lineText, padding, y + i * lineHeight);
      }
    });
    return y + lines.length * lineHeight;
  };

  const bottomLimit = height - height * 0.06;
  const topLimit = dividerY + 12;

  // [FEATURE: PMT_CENTER] 송출되는 절(현재 절)을 화면 세로 중앙에 고정한다.
  //   이전 절들은 위로, 다음 절들은 아래로 배치 → 절을 넘길 때마다 텍스트가 위로 슬라이드하며
  //   항상 현재 절이 센터에 온다. divider~하단 영역으로 클리핑해 헤더를 침범하지 않는다.
  const CUR_FS = 66, LH = 1.42, CUR_MAXLINES = 6; // 현재 절 — 기존 58에서 13% 확대
  const measureLines = (
    entry: { body: string; num: string },
    fontSize: number,
    bold: boolean,
    maxLines: number,
  ): number => {
    ctx.font = `${bold ? 'bold' : 'normal'} ${fontSize}px ${fontFamily}, sans-serif`;
    const numPrefix = entry.num ? `${entry.num} ` : '';
    return Math.min(wrapText(ctx, numPrefix + entry.body, maxTextWidth).length, maxLines);
  };

  const currentBlockHeight = measureLines(current, CUR_FS, true, CUR_MAXLINES) * CUR_FS * LH;
  const currentTop = Math.max(topLimit, height / 2 - currentBlockHeight / 2);

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, topLimit, width, bottomLimit - topLimit);
  ctx.clip();

  // 이전 절들 — 현재 절 위로 역순 배치, 어둡게 (화면 위로 완전히 벗어나면 중단)
  let prevBottom = currentTop - 18;
  for (let i = currentIndex - 1; i >= 0; i--) {
    const fs = 47; // 이전 절 — 다음 절과 동일한 47로 통일
    const maxLines = i === currentIndex - 1 ? 2 : 1;
    const h = measureLines(parsed[i], fs, false, maxLines) * fs * LH;
    const y = prevBottom - h;
    if (y + h < topLimit) break;
    drawVerse(parsed[i], y, fs, '#555555', false, maxLines);
    prevBottom = y - 14;
  }

  // 현재 절 — 흰색·크게, 센터
  drawVerse(current, currentTop, CUR_FS, '#ffffff', true, CUR_MAXLINES);

  // 다음 절들 — 현재 절 아래, 회색 (공간 허용만큼)
  let y = currentTop + currentBlockHeight + 30;
  let shown = 0;
  const NEXT_FS = 47; // 다음 절 — 기존 42에서 13% 확대
  for (let i = currentIndex + 1; i < parsed.length; i++) {
    const needed = measureLines(parsed[i], NEXT_FS, false, 3) * NEXT_FS * LH + 16;
    if (y + needed > bottomLimit) break;
    y = drawVerse(parsed[i], y, NEXT_FS, '#9a9a9a', false, 3) + 16;
    shown++;
  }
  ctx.restore();

  // 미표시 잔여 절 안내 (클리핑 영역 밖, 하단 고정)
  const remaining = parsed.length - 1 - currentIndex - shown;
  if (remaining > 0) {
    ctx.font = `normal 30px ${fontFamily}, sans-serif`;
    ctx.fillStyle = '#555555';
    ctx.textAlign = 'right';
    ctx.fillText(`▼ 이후 ${remaining}절`, width - padding, height - height * 0.05);
  }
}

function renderBibleLayout(
  ctx: CanvasRenderingContext2D,
  currentText: string,
  nextSectionText: string,
  width: number,
  height: number,
): void {
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, width, height);

  if (!currentText) return; // 빈 섹션은 검정 유지 (방송 화면 — 진단 문구 금지)

  const { reference, body } = splitBibleText(currentText);
  const fontFamily = getNotoSansKR();
  const padding = width * 0.06;
  const maxTextWidth = width - padding * 2;

  // ── 장절 표기 (상단) ──
  let bodyTop = height * 0.12;
  if (reference) {
    ctx.font = `bold ${BIBLE_REFERENCE_FONT_SIZE}px ${fontFamily}, sans-serif`;
    ctx.fillStyle = BIBLE_REFERENCE_COLOR;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(reference, width / 2, height * 0.07);

    const dividerY = height * 0.07 + BIBLE_REFERENCE_FONT_SIZE + 28;
    ctx.strokeStyle = '#3a3428';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(width * 0.3, dividerY);
    ctx.lineTo(width * 0.7, dividerY);
    ctx.stroke();
    bodyTop = dividerY + 36;
  }

  // ── 다음 섹션 미리보기 공간 (하단) ──
  const nextFirstLine = nextSectionText
    ? nextSectionText.split('\n').map((l) => l.trim()).find((l) => l !== '' && !BIBLE_REFERENCE_PATTERN.test(l)) ?? ''
    : '';
  const reservedBottom = nextFirstLine ? height * 0.14 : height * 0.06;
  const bodyAreaHeight = height - bodyTop - reservedBottom;

  // ── 본문 (자동 줄바꿈 + 넘치면 폰트 축소) ──
  let fontSize = BIBLE_BODY_FONT_SIZE;
  let lines: string[] = [];
  while (fontSize >= BIBLE_BODY_MIN_FONT_SIZE) {
    ctx.font = `bold ${fontSize}px ${fontFamily}, sans-serif`;
    lines = wrapText(ctx, body, maxTextWidth);
    if (lines.length * fontSize * BIBLE_LINE_HEIGHT <= bodyAreaHeight) break;
    fontSize -= 4;
  }

  const blockHeight = lines.length * fontSize * BIBLE_LINE_HEIGHT;
  let y = bodyTop + Math.max(0, (bodyAreaHeight - blockHeight) / 2);
  ctx.font = `bold ${fontSize}px ${fontFamily}, sans-serif`;
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (const line of lines) {
    ctx.fillText(line, width / 2, y);
    y += fontSize * BIBLE_LINE_HEIGHT;
  }

  // ── 다음 섹션 첫 줄 (하단, 회색) ──
  if (nextFirstLine) {
    const nextY = height - reservedBottom + 18;
    ctx.strokeStyle = '#333333';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(width * 0.25, nextY);
    ctx.lineTo(width * 0.75, nextY);
    ctx.stroke();

    let nextFontSize = 44;
    ctx.font = `normal ${nextFontSize}px ${fontFamily}, sans-serif`;
    const w = ctx.measureText(nextFirstLine).width;
    if (w > maxTextWidth) {
      nextFontSize = Math.floor(nextFontSize * (maxTextWidth / w));
      ctx.font = `normal ${nextFontSize}px ${fontFamily}, sans-serif`;
    }
    ctx.fillStyle = '#888888';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(nextFirstLine, width / 2, nextY + 22);
  }
}

function renderBlackWhiteChoirLayout(
  ctx: CanvasRenderingContext2D,
  currentText: string,
  nextSectionText: string,
  width: number,
  height: number,
): void {
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, width, height);

  if (!currentText) {
    // 빈 섹션 송출·간주 구간이면 그냥 검정 화면 유지 — 이 캔버스는 /atem-sub를 통해
    // ATEM 입력6 → 본당 무대 모니터로 그대로 나가므로 진단 문구를 그리면 방송 노출됨.
    // 진단이 필요하면 출력창 ?debug=1 오버레이(socket/room/mode)를 사용.
    return;
  }

  const currentLines = currentText.split('\n').filter((line) => line.trim() !== '');
  const fontFamily = getNotoSansKR();
  const padding = width * 0.05;
  const maxTextWidth = width - padding * 2;
  const lineHeightRatio = CURRENT_LINE_HEIGHT * 1.03;

  const lineFontSizes = currentLines.map((line) => {
    ctx.font = `bold ${CURRENT_FONT_SIZE}px ${fontFamily}, sans-serif`;
    const measured = ctx.measureText(line).width;
    if (measured > maxTextWidth) {
      return Math.floor(CURRENT_FONT_SIZE * (maxTextWidth / measured));
    }
    return CURRENT_FONT_SIZE;
  });

  const lineHeights = lineFontSizes.map((fontSize) => fontSize * lineHeightRatio);
  const currentBlockHeight = lineHeights.reduce((sum, lineHeight) => sum + lineHeight, 0);
  const currentBlockY = (height * 0.42) - (currentBlockHeight / 2);

  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  let yOffset = currentBlockY;
  for (let i = 0; i < currentLines.length; i++) {
    const fontSize = lineFontSizes[i];
    ctx.font = `bold ${fontSize}px ${fontFamily}, sans-serif`;
    ctx.letterSpacing = `${fontSize * 0.03}px`;
    ctx.fillText(currentLines[i], width / 2, yOffset);
    ctx.letterSpacing = '0px';
    yOffset += lineHeights[i];
  }

  const dividerY = yOffset + 30;
  ctx.strokeStyle = '#444444';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(width * 0.25, dividerY);
  ctx.lineTo(width * 0.75, dividerY);
  ctx.stroke();

  if (!nextSectionText) return;

  const nextFirstLine = nextSectionText.split('\n').find((line) => line.trim() !== '');
  if (!nextFirstLine) return;

  let nextFontSize = NEXT_FONT_SIZE;
  ctx.font = `normal ${nextFontSize}px ${fontFamily}, sans-serif`;
  const nextWidth = ctx.measureText(nextFirstLine).width;
  if (nextWidth > maxTextWidth) {
    nextFontSize = Math.floor(nextFontSize * (maxTextWidth / nextWidth));
    ctx.font = `normal ${nextFontSize}px ${fontFamily}, sans-serif`;
  }

  ctx.fillStyle = '#888888';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(nextFirstLine, width / 2, dividerY + 30);
}
