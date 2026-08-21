// [FEATURE: TEXT_RUNS] 한 텍스트 박스 안에서 구간별 스타일을 다루는 헬퍼

/**
 * 기획: docs/features/text-runs/PLAN.md
 *
 * `TextElement.content` 는 순수 문자열로 두고, 스타일만 문자 인덱스 구간
 * (`TextElement.runs`)으로 따로 관리한다. 이 파일은 그 구간을 다루는 순수 함수만
 * 모은다 — 캔버스 렌더러·에디터 미리보기·스타일 패널이 공용으로 쓴다.
 *
 * 편집 정책(2026-07-28 확정): **수정한 줄의 구간만 버린다.**
 * 손대지 않은 줄의 스타일은 그대로 유지된다.
 */

import type { TextRun, TextRunStyle } from './canvasTypes';

/** 한 줄을 그릴 때 쓰는 조각 — 같은 스타일이 이어지는 최소 단위 */
export interface TextSegment {
  text: string;
  style: TextRunStyle;
}

/** 구간이 유효한지 (뒤집힘·음수·빈 구간 제거) */
function isValidRun(run: TextRun): boolean {
  return (
    Number.isFinite(run.start) &&
    Number.isFinite(run.end) &&
    run.start >= 0 &&
    run.end > run.start
  );
}

/** 정렬 + 무효 구간 제거. 겹치는 구간은 뒤에 오는 것이 이긴다. */
export function normalizeRuns(runs: readonly TextRun[] | undefined): TextRun[] {
  if (!runs || runs.length === 0) return [];
  return runs.filter(isValidRun).slice().sort((a, b) => a.start - b.start || a.end - b.end);
}

/**
 * 렌더된 줄 목록을 원본 문자열의 시작 인덱스에 매핑한다.
 *
 * 줄바꿈이 `split('\n')` 인 경우도, `wrapText` 로 접힌 경우도 모두 다룬다.
 * wrapText 가 접는 지점의 공백을 버릴 수 있으므로 정확한 산술 대신 순차 탐색을
 * 쓴다. 못 찾으면 -1 을 넣어 그 줄은 구간 스타일 없이(기본 스타일로) 그린다 —
 * 잘못된 위치에 스타일을 입히는 것보다 안전하다.
 */
export function getLineStartOffsets(source: string, lines: readonly string[]): number[] {
  const offsets: number[] = [];
  let cursor = 0;
  for (const line of lines) {
    if (line.length === 0) {
      offsets.push(cursor);
      // 빈 줄은 개행 하나를 소비한 것으로 본다.
      if (source[cursor] === '\n') cursor += 1;
      continue;
    }
    const found = source.indexOf(line, cursor);
    offsets.push(found);
    cursor = found >= 0 ? found + line.length : cursor;
  }
  return offsets;
}

/**
 * 한 줄을 스타일이 같은 조각들로 나눈다.
 *
 * `lineStart` 가 음수면(오프셋 탐색 실패) 구간을 적용하지 않고 통째로 반환한다.
 */
export function splitLineIntoSegments(
  lineText: string,
  lineStart: number,
  runs: readonly TextRun[] | undefined,
): TextSegment[] {
  const normalized = normalizeRuns(runs);
  if (lineText.length === 0) return [];
  if (lineStart < 0 || normalized.length === 0) {
    return [{ text: lineText, style: {} }];
  }

  const lineEnd = lineStart + lineText.length;
  // 이 줄과 겹치는 구간만
  const overlapping = normalized.filter((r) => r.end > lineStart && r.start < lineEnd);
  if (overlapping.length === 0) return [{ text: lineText, style: {} }];

  // 줄 안의 경계점(로컬 인덱스) 수집
  const boundaries = new Set<number>([0, lineText.length]);
  for (const run of overlapping) {
    boundaries.add(Math.max(0, run.start - lineStart));
    boundaries.add(Math.min(lineText.length, run.end - lineStart));
  }
  const points = [...boundaries].sort((a, b) => a - b);

  const segments: TextSegment[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const from = points[i];
    const to = points[i + 1];
    if (to <= from) continue;
    // 이 조각을 덮는 구간들을 순서대로 병합 (뒤에 오는 구간이 이김)
    let style: TextRunStyle = {};
    for (const run of overlapping) {
      const localStart = run.start - lineStart;
      const localEnd = run.end - lineStart;
      if (localStart <= from && localEnd >= to) {
        style = { ...style, ...run.style };
      }
    }
    segments.push({ text: lineText.slice(from, to), style });
  }
  return segments;
}

/** 구간 스타일이 하나라도 실제로 적용되는지 — 빠른 분기용 */
export function hasTextRuns(runs: readonly TextRun[] | undefined): boolean {
  return normalizeRuns(runs).length > 0;
}

/**
 * [편집 정책] 수정한 줄의 구간만 버리고 나머지는 인덱스를 보정해 유지한다.
 *
 * 앞뒤로 그대로인 줄을 찾아 "바뀐 구간"을 좁힌 뒤,
 *   - 바뀐 구간보다 앞의 구간 → 그대로
 *   - 바뀐 구간과 겹치는 구간 → 버림
 *   - 바뀐 구간보다 뒤의 구간 → 길이 차이만큼 이동
 */
export function remapRunsAfterEdit(
  prevText: string,
  nextText: string,
  runs: readonly TextRun[] | undefined,
): TextRun[] {
  const normalized = normalizeRuns(runs);
  if (normalized.length === 0) return [];
  if (prevText === nextText) return normalized;

  const prevLines = prevText.split('\n');
  const nextLines = nextText.split('\n');

  // 앞에서부터 동일한 줄 수
  let head = 0;
  while (head < prevLines.length && head < nextLines.length && prevLines[head] === nextLines[head]) {
    head++;
  }
  // 뒤에서부터 동일한 줄 수 (head 와 겹치지 않게)
  let tail = 0;
  while (
    tail < prevLines.length - head &&
    tail < nextLines.length - head &&
    prevLines[prevLines.length - 1 - tail] === nextLines[nextLines.length - 1 - tail]
  ) {
    tail++;
  }

  const lineStart = (lines: string[], index: number) => {
    let offset = 0;
    for (let i = 0; i < index; i++) offset += lines[i].length + 1; // +1 = '\n'
    return offset;
  };

  const prevChangedStart = lineStart(prevLines, head);
  const prevChangedEnd = lineStart(prevLines, prevLines.length - tail) - (tail > 0 ? 1 : 0);
  const nextChangedEnd = lineStart(nextLines, nextLines.length - tail) - (tail > 0 ? 1 : 0);
  const delta = nextChangedEnd - prevChangedEnd;

  const result: TextRun[] = [];
  for (const run of normalized) {
    if (run.end <= prevChangedStart) {
      result.push(run); // 바뀐 구간 앞 — 그대로
    } else if (run.start >= prevChangedEnd) {
      result.push({ ...run, start: run.start + delta, end: run.end + delta }); // 뒤 — 이동
    }
    // 겹치는 구간은 버린다 (편집한 줄의 스타일 초기화)
  }
  // 이동 후 범위를 벗어난 구간 정리
  return result.filter((r) => r.start >= 0 && r.end <= nextText.length && r.end > r.start);
}

/**
 * [start, end) 구간에 스타일을 덧입힌다. 겹치는 기존 구간은 잘라서 보존한다.
 *
 * 같은 글자에 색을 줬다가 굵기를 주면 둘 다 남아야 하므로, 겹치는 부분은
 * 기존 스타일 위에 새 스타일을 병합한다.
 */
export function applyRunStyle(
  runs: readonly TextRun[] | undefined,
  start: number,
  end: number,
  style: TextRunStyle,
): TextRun[] {
  if (end <= start) return normalizeRuns(runs);
  const result: TextRun[] = [];

  for (const run of normalizeRuns(runs)) {
    if (run.end <= start || run.start >= end) {
      result.push(run); // 안 겹침
      continue;
    }
    // 겹치는 앞뒤 잔여분은 원래 스타일로 남긴다
    if (run.start < start) result.push({ start: run.start, end: start, style: run.style });
    if (run.end > end) result.push({ start: end, end: run.end, style: run.style });
    // 겹친 부분은 기존 위에 새 스타일 병합
    result.push({
      start: Math.max(run.start, start),
      end: Math.min(run.end, end),
      style: { ...run.style, ...style },
    });
  }
  // 기존 구간이 덮지 않은 나머지 부분에도 새 스타일을 깔아준다
  const covered = normalizeRuns(result).filter((r) => r.end > start && r.start < end);
  let cursor = start;
  for (const r of covered) {
    if (r.start > cursor) result.push({ start: cursor, end: r.start, style });
    cursor = Math.max(cursor, r.end);
  }
  if (cursor < end) result.push({ start: cursor, end, style });

  return normalizeRuns(result);
}

/** [start, end) 구간의 구간 스타일을 지운다 (기본 스타일로 되돌림) */
export function clearRunsInRange(
  runs: readonly TextRun[] | undefined,
  start: number,
  end: number,
): TextRun[] {
  const result: TextRun[] = [];
  for (const run of normalizeRuns(runs)) {
    if (run.end <= start || run.start >= end) {
      result.push(run);
      continue;
    }
    if (run.start < start) result.push({ start: run.start, end: start, style: run.style });
    if (run.end > end) result.push({ start: end, end: run.end, style: run.style });
  }
  return normalizeRuns(result);
}

/**
 * ATEM KEY 신호용 — 구간 색상을 전부 흰색으로.
 *
 * 키 마스크는 색상이 아니라 밝기·알파만 의미가 있다. 구간 색을 남겨두면
 * 그 글자만 마스크에서 회색으로 잡혀 ATEM 합성이 틀어진다.
 */
export function whitenTextRuns(runs: readonly TextRun[] | undefined): TextRun[] | undefined {
  const normalized = normalizeRuns(runs);
  if (normalized.length === 0) return runs ? [] : undefined;
  return normalized.map((run) => ({
    ...run,
    style: {
      ...run.style,
      ...(run.style.color !== undefined ? { color: '#ffffff' } : {}),
      ...(run.style.strokeColor !== undefined ? { strokeColor: '#ffffff' } : {}),
    },
  }));
}

/**
 * 프레임 캐시 키에 넣을 서명.
 *
 * 이게 빠지면 구간 스타일만 바꿨을 때 캐시된 옛 프레임이 그대로 송출된다.
 */
export function runsSignature(runs: readonly TextRun[] | undefined): string {
  const normalized = normalizeRuns(runs);
  if (normalized.length === 0) return '';
  return normalized
    .map((r) => {
      const s = r.style;
      return [
        r.start,
        r.end,
        s.color ?? '',
        s.fontWeight ?? '',
        s.fontStyle ?? '',
        s.fontFamily ?? '',
        s.fontSizeScale ?? '',
        s.strokeColor ?? '',
        s.strokeWidth ?? '',
      ].join(':');
    })
    .join('|');
}
