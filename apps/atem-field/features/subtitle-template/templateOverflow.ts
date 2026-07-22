// 템플릿의 본문 박스 기준으로 긴 성경 본문을 여러 섹션으로 나누는 클라이언트 헬퍼.
// 렌더러와 같은 줄바꿈·높이 계산을 사용해 "글자 수" 추정치에 의존하지 않는다.

import type { TextElement } from '@/lib/canvasTypes';
import { wrapText } from '@/lib/canvasRenderer';
import { applyTemplate } from './applyTemplate';
import type { SubtitleTemplate } from './model';
import type { Section } from '@/lib/types';

const CANVAS_WIDTH = 1920;
const CANVAS_HEIGHT = 1080;
let measureContext: CanvasRenderingContext2D | null = null;

export type TemplateBodySplitStrategy = 'context' | 'balanced';

/** applyTemplate과 같은 규칙으로 본문 박스를 찾는다(역할 태그가 없는 기존 템플릿도 지원). */
export function getTemplateBodyElement(template: SubtitleTemplate): TextElement | null {
  const texts = template.variants[0]?.elements.filter(
    (candidate): candidate is TextElement => candidate.type === 'text',
  ) ?? [];
  return texts.find((element) => element.fieldRole === 'body')
    ?? texts.find((element) => element.linked && !element.content)
    ?? texts.find((element) => element.linked)
    ?? [...texts].sort((a, b) => b.width * b.height - a.width * a.height)[0]
    ?? null;
}

function getMeasureContext(): CanvasRenderingContext2D | null {
  if (typeof document === 'undefined') return null;
  if (!measureContext) measureContext = document.createElement('canvas').getContext('2d');
  return measureContext;
}

interface BodyMeasurement {
  fits: boolean;
  totalHeight: number;
  lineCount: number;
  widthFits: boolean;
}

function measureTemplateBody(template: SubtitleTemplate, body: string): BodyMeasurement | null {
  if (!body) return { fits: true, totalHeight: 0, lineCount: 0, widthFits: true };
  const bodyElement = getTemplateBodyElement(template);
  if (!bodyElement || bodyElement.autoFit) return null;

  const ctx = getMeasureContext();
  if (!ctx) return null;

  const width = (bodyElement.width / 100) * CANVAS_WIDTH;
  const height = (bodyElement.height / 100) * CANVAS_HEIGHT;
  const horizontalPadding = Math.ceil(bodyElement.fontSize * 0.02);
  const wrapWidth = Math.max(1, width - horizontalPadding * 2);
  ctx.font = `${bodyElement.fontStyle} ${bodyElement.fontWeight} ${bodyElement.fontSize}px "${bodyElement.fontFamily}", sans-serif`;
  ctx.letterSpacing = `${bodyElement.letterSpacing}px`;

  const autoWidth = bodyElement.autoWidth ?? true;
  const lines = autoWidth ? body.split('\n') : wrapText(ctx, body, wrapWidth);
  const widestLine = Math.max(0, ...lines.map((line) => ctx.measureText(line).width));
  const widthFits = autoWidth ? widestLine <= wrapWidth : true;
  const totalHeight = lines.length * bodyElement.fontSize * bodyElement.lineHeight;
  return {
    fits: widthFits && totalHeight <= height,
    totalHeight,
    lineCount: lines.length,
    widthFits,
  };
}

/** 템플릿의 실제 본문 박스 안에 텍스트가 들어가는지 렌더러와 같은 규칙으로 측정한다. */
export function templateBodyFits(template: SubtitleTemplate, body: string): boolean {
  const measurement = measureTemplateBody(template, body);
  return measurement?.fits ?? true;
}

interface SplitCandidate {
  position: number;
  strength: number;
}

function splitCandidates(text: string): SplitCandidate[] {
  const candidates: SplitCandidate[] = [];
  const add = (pattern: RegExp, strength: number) => {
    for (const match of text.matchAll(pattern)) {
      const position = match.index! + match[0].length;
      if (position > 0 && position < text.length) candidates.push({ position, strength });
    }
  };

  add(/[.?!][)\]"”’]*\s+/g, 4);
  add(/[,;·][)\]"”’]*\s+/g, 3);
  add(/(니라|리라|이라|하라|노라|도다|로다|더라)\s+/g, 2);
  add(/[가-힣]+(고|며|니|되|요|즉|사|매)\s+/g, 1);
  add(/\s+/g, 0);
  return candidates;
}

function splitAtWordBoundary(text: string): [string, string] | null {
  const middle = Math.floor(text.length / 2);
  for (let distance = 0; distance <= middle; distance += 1) {
    const left = middle - distance;
    const right = middle + distance;
    if (text[left] === ' ') return [text.slice(0, left).trim(), text.slice(left).trim()];
    if (right < text.length && text[right] === ' ') {
      return [text.slice(0, right).trim(), text.slice(right).trim()];
    }
  }
  return null;
}

function splitByPositions(text: string, positions: number[]): string[] | null {
  const parts: string[] = [];
  let start = 0;
  for (const position of positions) {
    const part = text.slice(start, position).trim();
    if (!part) return null;
    parts.push(part);
    start = position;
  }
  const last = text.slice(start).trim();
  if (!last) return null;
  parts.push(last);
  return parts;
}

function getSplitPositions(text: string): number[] {
  const positions = new Set<number>();
  for (const match of text.matchAll(/\s+/g)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    if (start > 0 && start < text.length) positions.add(start);
    if (end > 0 && end < text.length) positions.add(end);
  }

  if (positions.size === 0) {
    for (let i = 1; i < text.length; i += 1) positions.add(i);
  }

  return [...positions].sort((a, b) => a - b);
}

function closestPositions(positions: number[], target: number, limit: number): number[] {
  return [...positions]
    .sort((a, b) => Math.abs(a - target) - Math.abs(b - target))
    .slice(0, limit)
    .sort((a, b) => a - b);
}

function compactTextWeight(text: string): number {
  return Array.from(text.trim()).reduce((sum, char) => {
    if (/\s/.test(char)) return sum + 0.25;
    if (/[0-9A-Za-z]/.test(char)) return sum + 0.56;
    return sum + 1;
  }, 0);
}

function scoreBalancedParts(template: SubtitleTemplate, parts: string[]): number | null {
  const measurements = parts.map((part) => measureTemplateBody(template, part));
  if (measurements.some((measurement) => !measurement || !measurement.fits)) return null;

  const heights = measurements.map((measurement) => measurement!.totalHeight);
  const lineCounts = measurements.map((measurement) => measurement!.lineCount);
  const weights = parts.map(compactTextWeight);
  const heightSpread = Math.max(...heights) - Math.min(...heights);
  const lineSpread = Math.max(...lineCounts) - Math.min(...lineCounts);
  const weightSpread = Math.max(...weights) - Math.min(...weights);

  return heightSpread * 1000 + lineSpread * 100 + weightSpread;
}

function splitTemplateBodyBalanced(
  template: SubtitleTemplate,
  body: string,
  maxParts = 3,
): string[] | null {
  const positions = getSplitPositions(body);
  if (positions.length === 0) return null;

  const evaluate = (candidates: number[][]): string[] | null => {
    let bestParts: string[] | null = null;
    let bestScore = Number.POSITIVE_INFINITY;

    for (const candidate of candidates) {
      const parts = splitByPositions(body, candidate);
      if (!parts) continue;
      const score = scoreBalancedParts(template, parts);
      if (score == null || score >= bestScore) continue;
      bestParts = parts;
      bestScore = score;
    }

    return bestParts;
  };

  if (maxParts >= 2) {
    const twoPart = evaluate(positions.map((position) => [position]));
    if (twoPart) return twoPart;
  }

  if (maxParts >= 3) {
    const firstTargets = closestPositions(positions, body.length / 3, 28);
    const secondTargets = closestPositions(positions, (body.length * 2) / 3, 28);
    const candidates: number[][] = [];
    for (const first of firstTargets) {
      for (const second of secondTargets) {
        if (second > first) candidates.push([first, second]);
      }
    }
    const threePart = evaluate(candidates);
    if (threePart) return threePart;
  }

  return null;
}

function splitTemplateBodyByContext(
  template: SubtitleTemplate,
  body: string,
): string[] | null {
  const splitRecursively = (text: string): string[] | null => {
    if (templateBodyFits(template, text)) return [text];

    const middle = text.length / 2;
    const candidates = splitCandidates(text).sort(
      (a, b) => b.strength - a.strength || Math.abs(a.position - middle) - Math.abs(b.position - middle),
    );
    const fallback = splitAtWordBoundary(text);
    if (fallback) candidates.push({ position: fallback[0].length, strength: -1 });

    for (const candidate of candidates) {
      const first = text.slice(0, candidate.position).trim();
      const second = text.slice(candidate.position).trim();
      if (!first || !second || first === text || second === text) continue;
      const firstParts = splitRecursively(first);
      const secondParts = splitRecursively(second);
      if (firstParts && secondParts) return [...firstParts, ...secondParts];
    }
    return null;
  };

  const parts = splitRecursively(body);
  return parts && parts.length > 1 ? parts : null;
}

/** 넘치는 본문을 여러 섹션으로 분할한다. 분할할 필요가 없으면 null을 반환한다. */
export function splitTemplateBody(
  template: SubtitleTemplate,
  body: string,
  options: { strategy?: TemplateBodySplitStrategy } = {},
): string[] | null {
  if (!body || templateBodyFits(template, body)) return null;

  if (options.strategy === 'balanced') {
    const balanced = splitTemplateBodyBalanced(template, body, 3);
    if (balanced) return balanced;
  }

  return splitTemplateBodyByContext(template, body);
}

export interface ApplyBibleTemplateOptions {
  idPrefix: string;
  label?: string;
  colorMark?: string;
  maxCharsPerSlide?: number;
  variantId?: string;
  splitStrategy?: TemplateBodySplitStrategy;
}

/**
 * 성경 삽입의 공통 적용 경로.
 * 수동 글자 수 분할을 우선하고, 설정이 없으면 선택 템플릿의 본문 박스를 측정한다.
 */
export function applyBibleTemplate(
  template: SubtitleTemplate,
  fields: Record<string, string>,
  opts: ApplyBibleTemplateOptions,
): Section[] {
  const baseOptions = {
    idPrefix: opts.idPrefix,
    label: opts.label,
    colorMark: opts.colorMark ?? '#ffffff',
    variantId: opts.variantId,
  };

  if ((opts.maxCharsPerSlide ?? 0) > 0) {
    return applyTemplate(template, { fields }, {
      ...baseOptions,
      maxCharsPerSlide: opts.maxCharsPerSlide,
    });
  }

  const bodyParts = splitTemplateBody(template, fields.body ?? '', { strategy: opts.splitStrategy });
  if (!bodyParts) return applyTemplate(template, { fields }, baseOptions);

  return bodyParts.flatMap((part, index) =>
    applyTemplate(
      template,
      { fields: { ...fields, body: part } },
      {
        ...baseOptions,
        idPrefix: `${opts.idPrefix}-s${index + 1}`,
        label: `${opts.label ?? ''} (${index + 1}/${bodyParts.length})`,
      },
    ),
  );
}
