// 찬양 조(key) 표기를 읽고, 이어지는 두 곡의 조 관계를 말해 준다.
//
// 왜 필요한가 — 인도자가 셋 순서를 잡을 때 조가 어떻게 이어지는지를 본다.
// 값은 이미 저장하고 있으니 늘어놓기만 해도 연결이 어색한 지점이 눈에 띈다.
//
// 억지로 판단하지 않는다
//   조 입력은 자유 텍스트다. 못 알아듣는 표기는 null 을 돌려주고 화면에서 아무 것도 그리지 않는다.
//   틀린 관계를 그럴듯하게 보여주는 것보다 아무 말 안 하는 편이 낫다.
//   관계도 다섯 가지만 본다. 그 이상은 음악적 판단이라 인도자 몫이다.

/** 파싱된 조 — 으뜸음(0=C … 11=B)과 장/단 */
export interface ParsedKey {
  pitch: number;
  minor: boolean;
  /** 다시 그릴 때 쓰는 표준 표기 (예: 'Bb', 'F#m') */
  label: string;
}

const LETTER_PITCH: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const PITCH_LABEL = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const SHARP_LABEL = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/**
 * 'G' · 'Am' · 'Bb' · 'F#m' · '  g  ' 을 읽는다. 못 읽으면 null.
 *
 * 소문자만으로 단조를 판단하지 않는다('a' = A단조 규칙은 예배 악보에서 거의 안 쓰고,
 * 그냥 소문자로 적은 것과 구별할 방법이 없다).
 */
export function parseSongKey(raw: string): ParsedKey | null {
  const cleaned = String(raw ?? '')
    .trim()
    /* '키: G' · 'Key G' · '조 G' 같은 라벨을 떼어낸다 */
    .replace(/^(키|조|key)\s*[:：]?\s*/i, '')
    .trim();
  if (!cleaned) return null;

  const match = /^([A-Ga-g])\s*([#b♯♭]?)\s*(.*)$/.exec(cleaned);
  if (!match) return null;

  const [, letter, accidentalRaw, rest] = match;
  const accidental = accidentalRaw === '♯' ? '#' : accidentalRaw === '♭' ? 'b' : accidentalRaw;
  const base = LETTER_PITCH[letter.toUpperCase()];
  const pitch = (base + (accidental === '#' ? 1 : accidental === 'b' ? -1 : 0) + 12) % 12;

  const tail = rest.trim().toLowerCase();
  const isMinor = /^(m|min|minor|-)$/.test(tail) || tail === '단조';
  const isMajor = tail === '' || /^(maj|major)$/.test(tail) || tail === '장조';
  /* 'Gsus4' 처럼 조가 아닌 것이 붙어 오면 읽지 않는다 */
  if (!isMinor && !isMajor) return null;

  /* 표기는 입력한 올림/내림을 따른다 — Bb 를 A# 로 바꿔 보여주면 낯설다 */
  const names = accidental === '#' ? SHARP_LABEL : PITCH_LABEL;
  return { pitch, minor: isMinor, label: `${names[pitch]}${isMinor ? 'm' : ''}` };
}

export type KeyRelation =
  | 'same'          // 같은 조
  | 'parallel'      // 같은 으뜸음 장단조 (C ↔ Cm)
  | 'relative'      // 나란한조 (C ↔ Am)
  | 'fifth'         // 5도 위
  | 'fourth'        // 4도 위
  | 'semitone-up' | 'semitone-down'
  | 'tone-up' | 'tone-down'
  | 'far';          // 그 외 — 판단하지 않는다

const RELATION_LABEL: Record<KeyRelation, string> = {
  same: '같은 조',
  parallel: '같은 으뜸음',
  relative: '나란한조',
  fifth: '5도 위',
  fourth: '4도 위',
  'semitone-up': '반음 위',
  'semitone-down': '반음 아래',
  'tone-up': '온음 위',
  'tone-down': '온음 아래',
  far: '',
};

export function relationLabel(relation: KeyRelation): string {
  return RELATION_LABEL[relation];
}

/** 앞 곡에서 뒤 곡으로 넘어갈 때의 관계 */
export function keyRelation(from: ParsedKey, to: ParsedKey): KeyRelation {
  const step = (to.pitch - from.pitch + 12) % 12;
  const sameQuality = from.minor === to.minor;

  if (step === 0) return sameQuality ? 'same' : 'parallel';
  /* 나란한조 — 장조에서 9도(단3도 아래), 단조에서 3도 */
  if (!sameQuality && ((!from.minor && step === 9) || (from.minor && step === 3))) return 'relative';
  if (sameQuality && step === 7) return 'fifth';
  if (sameQuality && step === 5) return 'fourth';
  if (step === 1) return 'semitone-up';
  if (step === 11) return 'semitone-down';
  if (step === 2) return 'tone-up';
  if (step === 10) return 'tone-down';
  return 'far';
}

export interface KeyFlowStep {
  label: string;
  /** 앞 곡과의 관계. 첫 곡은 없다 */
  relation: KeyRelation | null;
}

/**
 * 셋 전체의 조 흐름.
 *
 * 읽을 수 없는 조는 통째로 빠진다 — 자리를 비워 두면 관계가 엉뚱해진다.
 * 두 곡 미만이면 보여줄 흐름이 없으므로 빈 배열이다.
 */
export function buildKeyFlow(rawKeys: string[]): KeyFlowStep[] {
  const parsed = rawKeys.map(parseSongKey).filter((key): key is ParsedKey => key !== null);
  if (parsed.length < 2) return [];

  return parsed.map((key, index) => ({
    label: key.label,
    relation: index === 0 ? null : keyRelation(parsed[index - 1], key),
  }));
}
