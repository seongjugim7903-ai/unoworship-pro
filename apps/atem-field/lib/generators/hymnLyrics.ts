// 찬송가 원문(가사)을 절/후렴 구조로 파싱해 화면용 2줄 청크로 만드는 공용 로직.
// 워십 자동생성기(worshipServiceGenerator)와 콤포즈 상단 "찬송/찬양 삽입"(HymnImporter)이 공유한다.

export interface HymnBlock {
  type: 'verse' | 'refrain';
  /** 절 번호 — verse 블록에만 존재 */
  num?: number;
  lines: string[];
}

const VERSE_MARK_RE = /^\(?(\d+)\)\s*/;
const REFRAIN_MARK_RE = /^\(?후렴\)?[ \t]*[:：]?[ \t]*/;
const TRAILING_AMEN_RE = /^(.*?)\s*(아멘[.!]?)\s*$/;

/** 원문 가사를 줄 단위로 훑어 절(N)·후렴 표기를 경계로 블록화한다. 표기 자체는 본문에서 제거된다. */
export function parseHymnBlocks(rawLyrics: string): HymnBlock[] {
  const blocks: HymnBlock[] = [];
  let current: HymnBlock | null = null;

  for (const rawLine of rawLyrics.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;

    const verseMatch = VERSE_MARK_RE.exec(line);
    if (verseMatch) {
      current = { type: 'verse', num: Number(verseMatch[1]), lines: [line.slice(verseMatch[0].length).trim()] };
      blocks.push(current);
      continue;
    }
    if (REFRAIN_MARK_RE.test(line)) {
      current = { type: 'refrain', lines: [line.replace(REFRAIN_MARK_RE, '').trim()] };
      blocks.push(current);
      continue;
    }
    if (current) {
      current.lines.push(line);
    } else {
      // 마커 없이 시작하는 가사(절 표기 없는 찬양 등) — 1절로 취급
      current = { type: 'verse', num: 1, lines: [line] };
      blocks.push(current);
    }
  }
  return blocks;
}

/** 모든 화면은 두 줄 — 블록이 2줄을 넘으면 2줄 단위로 나눈다 */
export function chunkTwoLines(block: string): string[] {
  const lines = block.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
  const chunks: string[] = [];
  for (let i = 0; i < lines.length; i += 2) {
    chunks.push(lines.slice(i, i + 2).join('\n'));
  }
  return chunks;
}

export interface HymnSectionChunk {
  body: string;
  /** "1절" | "후렴" 등 — 절/후렴표기(verseLabel) 슬롯용 */
  verseLabel: string;
  /** 마지막 절의 마지막 청크에서만 값이 채워진다 — 작게·이탤릭 전용 슬롯(amen)용 */
  amen?: string;
}

/**
 * 절/후렴 구조를 반영해 2줄 화면 청크 목록을 만든다.
 *  - 절 시작 "(N)" 표기는 제거하고 절/후렴표기 슬롯에 "N절"/"후렴"으로 넣는다.
 *  - 후렴이 있으면 원곡의 절-후렴-절-후렴 구조를 살려 절마다 뒤에 반복 배치한다
 *    (인쇄본은 후렴을 1회만 적어도, 실제로는 절마다 반복해서 부르므로).
 *  - "아멘"은 마지막 절에서만 분리해 별도 필드로 돌려준다(본문에서는 빠진다) —
 *    작게·이탤릭 등 본문과 다른 스타일을 적용할 수 있는 전용 텍스트 슬롯을 염두에 둔 설계.
 */
export function buildHymnSectionChunks(rawLyrics: string): HymnSectionChunk[] {
  const blocks = parseHymnBlocks(rawLyrics);
  const verses = blocks.filter((b) => b.type === 'verse');
  const refrain = blocks.find((b) => b.type === 'refrain');
  const ordered = refrain ? verses.flatMap((v) => [v, refrain]) : blocks;

  const lastVerse = verses[verses.length - 1];
  let amenText: string | undefined;
  if (lastVerse && lastVerse.lines.length > 0) {
    const lastIdx = lastVerse.lines.length - 1;
    const m = TRAILING_AMEN_RE.exec(lastVerse.lines[lastIdx]);
    if (m) {
      amenText = m[2];
      const stripped = m[1].trim();
      lastVerse.lines = stripped
        ? [...lastVerse.lines.slice(0, lastIdx), stripped]
        : lastVerse.lines.slice(0, lastIdx);
    } else {
      amenText = '아멘';
    }
  }

  const chunks: HymnSectionChunk[] = [];
  for (const block of ordered) {
    const label = block.type === 'verse' ? `${block.num}절` : '후렴';
    const twoLine = chunkTwoLines(block.lines.join('\n'));
    twoLine.forEach((body, i) => {
      const isLastChunkOfLastVerse = block === lastVerse && i === twoLine.length - 1;
      chunks.push({ body, verseLabel: label, amen: isLastChunkOfLastVerse ? amenText : undefined });
    });
  }
  return chunks;
}
