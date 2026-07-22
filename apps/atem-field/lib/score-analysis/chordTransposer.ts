/**
 * Minimal chord transposition for worship-conti v1.
 *
 * This handles typed chord/lyric sheets while the full OMR pipeline is still pending.
 * Image pixels are intentionally not transformed here.
 */

export interface TransposedChordLine {
  source: string;
  text: string;
  type: 'blank' | 'section' | 'chords' | 'lyrics';
}

export interface TransposedChordSheet {
  originalKey?: string;
  inferredOriginalKey?: string;
  targetKey?: string;
  canTranspose: boolean;
  semitoneShift: number;
  transposedChordCount: number;
  lines: TransposedChordLine[];
}

const NOTE_TO_SEMITONE: Record<string, number> = {
  C: 0,
  'C#': 1,
  Db: 1,
  D: 2,
  'D#': 3,
  Eb: 3,
  E: 4,
  F: 5,
  'F#': 6,
  Gb: 6,
  G: 7,
  'G#': 8,
  Ab: 8,
  A: 9,
  'A#': 10,
  Bb: 10,
  B: 11,
};

const SHARP_NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT_NOTES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const KEY_NOTE_NAMES: Record<string, string[]> = {
  // In Gb, a G -> Gb transposition should spell C as Cb instead of B.
  Gb: ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'Cb'],
};

function keyRoot(key = ''): string {
  return key.trim().replace(/m$/, '');
}

function semitoneForKey(key = ''): number | null {
  const root = keyRoot(key);
  return root in NOTE_TO_SEMITONE ? NOTE_TO_SEMITONE[root] : null;
}

function preferFlats(targetKey = ''): boolean {
  const root = keyRoot(targetKey);
  return root.includes('b') || ['F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb'].includes(root);
}

function noteNamesForTarget(targetKey = ''): string[] {
  const root = keyRoot(targetKey);
  return KEY_NOTE_NAMES[root] ?? (preferFlats(targetKey) ? FLAT_NOTES : SHARP_NOTES);
}

function transposeRoot(root: string, shift: number, noteNames: string[]): string {
  const start = NOTE_TO_SEMITONE[root];
  if (start === undefined) return root;
  const next = (start + shift + 1200) % 12;
  return noteNames[next];
}

function splitToken(token: string): { leading: string; core: string; trailing: string } {
  const leading = token.match(/^[\s|([{]+/)?.[0] ?? '';
  const withoutLeading = token.slice(leading.length);
  const trailing = withoutLeading.match(/[\s|)\]},.;:]+$/)?.[0] ?? '';
  const core = withoutLeading.slice(0, withoutLeading.length - trailing.length);
  return { leading, core, trailing };
}

function isChordCore(core: string): boolean {
  if (!core) return false;
  const match = core.match(/^([A-G](?:#|b)?)(.*)$/);
  if (!match) return false;

  const suffix = match[2] ?? '';
  return /^(?:m|min|maj|M|dim|aug|sus|add|no|\+|-|°|ø|[0-9]|#|b|\(|\)|\/[A-G](?:#|b)?)*$/.test(suffix);
}

function transposeChordCore(core: string, shift: number, noteNames: string[]): string {
  const match = core.match(/^([A-G](?:#|b)?)(.*)$/);
  if (!match) return core;

  const root = transposeRoot(match[1], shift, noteNames);
  const suffix = (match[2] ?? '').replace(/\/([A-G](?:#|b)?)/g, (_value, bass: string) => (
    `/${transposeRoot(bass, shift, noteNames)}`
  ));
  return `${root}${suffix}`;
}

function transposeChordToken(token: string, shift: number, noteNames: string[]): string | null {
  const { leading, core, trailing } = splitToken(token);
  if (!isChordCore(core)) return null;
  return `${leading}${transposeChordCore(core, shift, noteNames)}${trailing}`;
}

function chordRootFromToken(token: string): string | null {
  const { core } = splitToken(token);
  const match = core.match(/^([A-G](?:#|b)?)/);
  if (!match || !isChordCore(core)) return null;
  return match[1];
}

export function detectLikelyOriginalKey(lyrics: string): string | undefined {
  for (const line of lyrics.split('\n')) {
    const bracketed = line.match(/\[([A-G](?:#|b)?)[^\]\s]*\]/);
    if (bracketed?.[1]) return bracketed[1];

    const tokens = line.split(/\s+/).filter(Boolean);
    if (!tokens.length) continue;

    const roots = tokens
      .map(chordRootFromToken)
      .filter((root): root is string => Boolean(root));

    if (roots.length > 0 && roots.length / tokens.length >= 0.6) return roots[0];
  }

  return undefined;
}

function transposeBracketedChords(line: string, shift: number, noteNames: string[]): {
  text: string;
  count: number;
} {
  let count = 0;
  const text = line.replace(/\[([A-G](?:#|b)?[^\]\s]*)\]/g, (value, core: string) => {
    if (!isChordCore(core)) return value;
    count += 1;
    return `[${transposeChordCore(core, shift, noteNames)}]`;
  });
  return { text, count };
}

function transposeChordLine(line: string, shift: number, noteNames: string[]): {
  text: string;
  count: number;
  isChordLine: boolean;
} {
  const tokens = line.split(/(\s+)/);
  const words = tokens.filter((token) => token.trim());
  if (!words.length) return { text: line, count: 0, isChordLine: false };

  let count = 0;
  const mapped = tokens.map((token) => {
    if (!token.trim()) return token;
    const transposed = transposeChordToken(token, shift, noteNames);
    if (!transposed) return token;
    count += 1;
    return transposed;
  });

  const isChordLine = count > 0 && count / words.length >= 0.6;
  return {
    text: isChordLine ? mapped.join('') : line,
    count: isChordLine ? count : 0,
    isChordLine,
  };
}

function isSectionMarker(line: string): boolean {
  return /^\s*\[[^\]]+\]\s*$/.test(line);
}

export function buildTransposedChordSheet({
  lyrics,
  originalKey,
  targetKey,
}: {
  lyrics: string;
  originalKey?: string;
  targetKey?: string;
}): TransposedChordSheet {
  const inferredOriginalKey = originalKey ? undefined : detectLikelyOriginalKey(lyrics);
  const effectiveOriginalKey = originalKey || inferredOriginalKey;
  const from = semitoneForKey(effectiveOriginalKey);
  const to = semitoneForKey(targetKey);
  const canTranspose = from !== null && to !== null;
  const semitoneShift = canTranspose ? to - from : 0;
  const noteNames = noteNamesForTarget(targetKey);
  let transposedChordCount = 0;

  const lines = lyrics.split('\n').map((source) => {
    if (!source.trim()) {
      return { source, text: '', type: 'blank' as const };
    }

    if (isSectionMarker(source)) {
      return { source, text: source, type: 'section' as const };
    }

    if (!canTranspose) {
      return { source, text: source, type: 'lyrics' as const };
    }

    const bracketed = transposeBracketedChords(source, semitoneShift, noteNames);
    if (bracketed.count > 0) {
      transposedChordCount += bracketed.count;
      return { source, text: bracketed.text, type: 'lyrics' as const };
    }

    const chordLine = transposeChordLine(source, semitoneShift, noteNames);
    if (chordLine.isChordLine) {
      transposedChordCount += chordLine.count;
      return { source, text: chordLine.text, type: 'chords' as const };
    }

    return { source, text: source, type: 'lyrics' as const };
  });

  return {
    originalKey: effectiveOriginalKey,
    inferredOriginalKey,
    targetKey,
    canTranspose,
    semitoneShift,
    transposedChordCount,
    lines,
  };
}
