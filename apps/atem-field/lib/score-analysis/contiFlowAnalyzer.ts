/**
 * lib/score-analysis/contiFlowAnalyzer.ts
 *
 * 찬양 가사 블록을 예배 콘티 흐름 코드로 정규화한다.
 * 예: 1절 / 후렴 / 2절 / 후렴 / 브릿지 / 후렴 -> v1-c-v2-c-b-c
 */

export type ContiFlowCode = `v${number}` | 'c' | 'b' | 'i' | 'e' | 'o';

export interface ContiFlowSegment {
  id: string;
  code: ContiFlowCode;
  label: string;
  text: string;
  confidence: number;
}

export interface ContiFlowAnalysis {
  pattern: string;
  segments: ContiFlowSegment[];
  confidence: number;
}

const CODE_LABELS: Record<string, string> = {
  c: '후렴',
  b: '브릿지',
  i: '도입',
  e: '엔딩',
  o: '기타',
};

function splitBlocks(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean);
}

function normalizeToken(token: string, index: number): { code: ContiFlowCode; confidence: number } {
  const lower = token.trim().toLowerCase();
  const compact = lower.replace(/[\s_\[\]().:：-]/g, '');

  const verseMatch = compact.match(/^(?:v|verse|절)?([1-9]\d*)$/);
  if (verseMatch) {
    return { code: `v${verseMatch[1]}` as ContiFlowCode, confidence: 0.92 };
  }

  if (/^(?:v|verse)[1-9]\d*$/.test(compact)) {
    const number = compact.replace(/^(?:v|verse)/, '');
    return { code: `v${number}` as ContiFlowCode, confidence: 0.92 };
  }

  if (/후렴|chorus|^c$/.test(compact)) return { code: 'c', confidence: 0.9 };
  if (/브릿지|브리지|bridge|^b$/.test(compact)) return { code: 'b', confidence: 0.88 };
  if (/도입|인트로|intro|^i$/.test(compact)) return { code: 'i', confidence: 0.84 };
  if (/엔딩|ending|마무리|^e$/.test(compact)) return { code: 'e', confidence: 0.84 };

  if (index === 0) return { code: 'v1', confidence: 0.45 };
  if (index === 1) return { code: 'c', confidence: 0.4 };
  if (index % 2 === 0) return { code: `v${Math.floor(index / 2) + 1}` as ContiFlowCode, confidence: 0.35 };
  return { code: 'c', confidence: 0.35 };
}

function labelForCode(code: ContiFlowCode): string {
  if (code.startsWith('v')) return `${code.slice(1)}절`;
  return CODE_LABELS[code] ?? '기타';
}

function firstLine(block: string): string {
  return block.split('\n')[0]?.trim() ?? '';
}

function stripMarker(line: string): string {
  return line
    .replace(/^\s*\[[^\]]+\]\s*/, '')
    .replace(/^\s*(?:verse\s*)?[1-9]\d*\s*절?\s*[:：.-]?\s*/i, '')
    .replace(/^\s*(?:v[1-9]\d*|chorus|bridge|intro|ending|후렴|브릿지|브리지|도입|인트로|엔딩)\s*[:：.-]?\s*/i, '')
    .trim();
}

function markerFromBlock(block: string): string {
  const line = firstLine(block);
  const bracket = line.match(/^\s*\[([^\]]+)\]/);
  if (bracket?.[1]) return bracket[1];

  const prefix = line.match(/^\s*((?:verse\s*)?[1-9]\d*\s*절?|v[1-9]\d*|chorus|bridge|intro|ending|후렴|브릿지|브리지|도입|인트로|엔딩)\b/i);
  if (prefix?.[1]) return prefix[1];

  return '';
}

function textWithoutMarker(block: string): string {
  const lines = block.split('\n');
  if (!lines.length) return block;

  const cleanedFirst = stripMarker(lines[0]);
  if (cleanedFirst === lines[0].trim()) return block;
  return [cleanedFirst, ...lines.slice(1)].filter(Boolean).join('\n').trim();
}

export function parseContiFlowPattern(pattern: string, blocks: string[] = []): ContiFlowSegment[] {
  return pattern
    .split(/[-,>\s]+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .map((token, index) => {
      const { code, confidence } = normalizeToken(token, index);
      return {
        id: `flow-${index + 1}-${code}`,
        code,
        label: labelForCode(code),
        text: blocks[index] ?? '',
        confidence,
      };
    });
}

export function analyzeContiFlow(lyrics: string, preferredPattern = ''): ContiFlowAnalysis {
  const blocks = splitBlocks(lyrics);

  if (preferredPattern.trim()) {
    const segments = parseContiFlowPattern(preferredPattern, blocks);
    return {
      pattern: segments.map((segment) => segment.code).join('-'),
      segments,
      confidence: segments.length ? 0.85 : 0,
    };
  }

  const segments = blocks.map((block, index) => {
    const marker = markerFromBlock(block);
    const { code, confidence } = normalizeToken(marker, index);
    return {
      id: `flow-${index + 1}-${code}`,
      code,
      label: labelForCode(code),
      text: textWithoutMarker(block),
      confidence,
    };
  });

  const average = segments.length
    ? segments.reduce((sum, segment) => sum + segment.confidence, 0) / segments.length
    : 0;

  return {
    pattern: segments.map((segment) => segment.code).join('-'),
    segments,
    confidence: average,
  };
}
