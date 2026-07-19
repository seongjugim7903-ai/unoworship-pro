export interface FittedTextBlock {
  fontSize: number;
  lines: string[];
}

interface FitTextOptions {
  fontFamily: string;
  fontWeight: number;
  maxFontSize: number;
  minFontSize: number;
  maxLines: number;
  maxWidth: number;
}

function normalizeLines(text: string) {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function splitBalanced(text: string, maxLines: number) {
  const trimmed = text.trim();
  if (!trimmed || maxLines <= 1) return [trimmed];

  const units = trimmed.includes(' ') ? trimmed.split(/\s+/) : Array.from(trimmed);
  if (units.length <= 1) return [trimmed];

  const lines: string[] = [];
  let cursor = 0;
  for (let index = 0; index < maxLines; index += 1) {
    const remainingLines = maxLines - index;
    const remainingUnits = units.length - cursor;
    const take = Math.ceil(remainingUnits / remainingLines);
    const chunk = units.slice(cursor, cursor + take);
    lines.push(trimmed.includes(' ') ? chunk.join(' ') : chunk.join(''));
    cursor += take;
  }
  return lines.filter(Boolean);
}

function toDisplayLines(text: string, maxLines: number) {
  const sourceLines = normalizeLines(text);
  if (sourceLines.length === 0) return [''];
  if (sourceLines.length === 1) return splitBalanced(sourceLines[0], maxLines);
  return sourceLines.slice(0, maxLines);
}

function setFont(ctx: CanvasRenderingContext2D, weight: number, size: number, family: string) {
  ctx.font = `${weight} ${size}px ${family}`;
}

export function fitTextBlock(ctx: CanvasRenderingContext2D, text: string, options: FitTextOptions): FittedTextBlock {
  const lines = toDisplayLines(text, options.maxLines);
  let fontSize = options.maxFontSize;

  while (fontSize > options.minFontSize) {
    setFont(ctx, options.fontWeight, fontSize, options.fontFamily);
    const widest = Math.max(...lines.map((line) => ctx.measureText(line).width));
    if (widest <= options.maxWidth) break;
    fontSize -= 2;
  }

  return { fontSize, lines };
}

export function firstMeaningfulLine(text: string) {
  return normalizeLines(text)[0] ?? '';
}
