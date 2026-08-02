// 설교대지 협조문 원문을 제목·본문·대지타이틀·인용구절로 분리한다.
// 성경 데이터가 필요 없는 순수 문자열 처리라 Vercel 배포판에서도 그대로 동작한다.

import type { ParsedPoint, ParsedSermonOutline } from './types';
import { detectServiceType, looksLikeServiceHeader } from './serviceTypeHint';

/** '성경: 요14:1-3' · '본문: ...' */
const SCRIPTURE_LABEL = /^(?:성경|본문|말씀)\s*[:：]\s*(.*)$/;
/** '제목: 마음에 근심하지 말라!' */
const TITLE_LABEL = /^제목\s*[:：]\s*(.*)$/;
/** '찬양: 310장, 493장, ...' */
const PRAISE_LABEL = /^(?:찬양|찬송)\s*[:：]\s*(.*)$/;

/** '1. 마음에 근심하지 말라 하심(1)' · '2) ...' */
const POINT_LINE = /^(\d+)\s*[.)]\s*(.+)$/;
/** 대지 제목 끝의 절범위 괄호 — '(1)', '(2-3)', '(2~3)' */
const VERSE_RANGE_SUFFIX = /[(（]\s*([\d\s\-~,]+)\s*[)）]\s*$/;

/**
 * 성경 구절 표기 줄 판정.
 * UnoLive `lib/generators/worshipServiceGenerator.ts` 의 isScriptureRefLine 과 같은 규칙이다.
 * '요14:1-3', '빌4:6-7', '벧전 2:5-9', '롬8:28,31-39' 를 받는다.
 */
const SCRIPTURE_REF_LINE = /^[가-힣A-Za-z0-9]+(\s+\d+)?\s*\d*\s*:\s*\d+(\s*[-~,]\s*\d+)*$/;

/** '310장', '찬송가 310장' */
const HYMN_TOKEN = /^(?:찬송가?\s*)?(\d+)\s*장$/;

export function isScriptureRefLine(line: string): boolean {
  return SCRIPTURE_REF_LINE.test(line.trim());
}

function splitLines(raw: string): string[] {
  return raw
    .replace(/​/g, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/** '310장, 493장, 382장, 주님 내 길 예비하시니' → 장 번호와 곡명으로 나눈다 */
function splitPraiseLine(value: string): { hymnNumbers: string[]; praiseSongs: string[] } {
  const hymnNumbers: string[] = [];
  const praiseSongs: string[] = [];

  for (const token of value.split(/[,，·]/)) {
    const item = token.trim();
    if (!item) continue;
    const hymn = HYMN_TOKEN.exec(item);
    if (hymn) hymnNumbers.push(hymn[1]);
    else praiseSongs.push(item);
  }

  return { hymnNumbers, praiseSongs };
}

/** '마음에 근심하지 말라 하심(1)' → { title, verseRange } */
function splitVerseRange(text: string): { title: string; verseRange: string } {
  const matched = VERSE_RANGE_SUFFIX.exec(text);
  if (!matched) return { title: text.trim(), verseRange: '' };
  return {
    title: text.slice(0, matched.index).trim(),
    verseRange: matched[1].replace(/\s+/g, ''),
  };
}

/**
 * 협조문 원문을 구조화한다.
 *
 * 판정 순서가 중요하다 — 라벨 → 대지 → 인용 → 나머지.
 *   · '제목: 마음에 근심하지 말라!' 가 대지로 잡히면 안 되므로 라벨이 먼저다.
 *   · '1. 마음에 근심하지 말라 하심(1)' 이 인용으로 잡히면 안 되므로 대지가 먼저다.
 *
 * 중복 인용구절은 지우지 않는다. 설교자가 실제로 재인용하는 경우가 있고,
 * 자동으로 지우면 되돌릴 수 없다. 검수 화면에서 사용자가 판단한다.
 */
export function parseSermonOutline(raw: string): ParsedSermonOutline {
  const result: ParsedSermonOutline = {
    serviceTypeHint: '',
    sermonTitle: '',
    scriptureRef: '',
    points: [],
    praiseLine: '',
    hymnNumbers: [],
    praiseSongs: [],
    unresolved: [],
  };

  let currentPoint: ParsedPoint | null = null;

  for (const line of splitLines(raw)) {
    // 1. 라벨 줄
    const scripture = SCRIPTURE_LABEL.exec(line);
    if (scripture) {
      if (!result.scriptureRef) result.scriptureRef = scripture[1].trim();
      continue;
    }

    const title = TITLE_LABEL.exec(line);
    if (title) {
      if (!result.sermonTitle) result.sermonTitle = title[1].trim();
      continue;
    }

    const praise = PRAISE_LABEL.exec(line);
    if (praise) {
      const value = praise[1].trim();
      result.praiseLine = result.praiseLine ? `${result.praiseLine}, ${value}` : value;
      const split = splitPraiseLine(value);
      result.hymnNumbers.push(...split.hymnNumbers);
      result.praiseSongs.push(...split.praiseSongs);
      continue;
    }

    // 2. 대지 줄
    const point = POINT_LINE.exec(line);
    if (point) {
      const { title: pointTitle, verseRange } = splitVerseRange(point[2]);
      currentPoint = { number: point[1], title: pointTitle, verseRange, quotes: [] };
      result.points.push(currentPoint);
      continue;
    }

    // 3. 인용 줄
    if (isScriptureRefLine(line)) {
      if (currentPoint) currentPoint.quotes.push(line);
      else result.unresolved.push(line);
      continue;
    }

    // 4. 나머지 — 첫머리 안내문에서 예배 종류만 건져낸다
    if (!result.serviceTypeHint && looksLikeServiceHeader(line)) {
      const detected = detectServiceType(line);
      if (detected) {
        result.serviceTypeHint = detected;
        continue;
      }
    }

    result.unresolved.push(line);
  }

  return result;
}

/**
 * 같은 대지 안에서 두 번 이상 나온 인용구절.
 * 검수 화면에서 배지를 다는 용도다 — 자동 삭제하지 않는다.
 */
export function findDuplicateQuotes(point: ParsedPoint): Set<string> {
  const seen = new Set<string>();
  const duplicated = new Set<string>();
  for (const quote of point.quotes) {
    if (seen.has(quote)) duplicated.add(quote);
    else seen.add(quote);
  }
  return duplicated;
}
