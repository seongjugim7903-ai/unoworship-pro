// 주보에서 뽑은 예배 순서표("항목: 내용" 줄 모음)에서 설교대지에 쓸 값을 골라낸다.
//
//   성경봉독 → 본문(요절)      말씀선포 → 설교제목
//   찬송     → 찬송가 장 번호   특송/찬양 → 찬양(PPT) 곡명
//
// 협조문에 없는 정보(찬송가·설교자)가 주보에는 있어서, 둘을 합치면 손으로 채울 것이 거의 없다.
//
// 설교자는 조심해서 다룬다. 축도는 담임목사가 맡는 경우가 많아 그날 설교자와 다를 수 있다.
// 그래서 어디서 얻었는지(preacherSource)를 함께 돌려주고, 화면에서 확인을 요청한다.

import { parseHymnNumber } from './subProgram';

/** 설교자를 어디서 얻었는지 — 확신 순서대로 */
export type PreacherSource =
  /** '설교자: 한만상 목사' 처럼 항목이 따로 있음 — 가장 믿을 만하다 */
  | 'explicit'
  /** '말씀선포: 제목 / 한만상 목사' 처럼 설교 줄에 이름이 붙어 있음 */
  | 'sermonLine'
  /** 축도 항목에서 끌어온 추정값 — 담임목사일 수 있어 확인이 필요하다 */
  | 'benediction'
  /** 못 찾음 */
  | '';

export interface ServiceOrderFields {
  /** 성경봉독 — 설교 본문 요절 */
  scriptureRef: string;
  /** 말씀선포 — 설교 제목. 뒤에 붙은 설교자 이름은 떼어낸다 */
  sermonTitle: string;
  /** 설교자 이름 */
  preacher: string;
  /** 그 이름을 어디서 얻었는지 */
  preacherSource: PreacherSource;
  /** 찬송 항목의 장 번호. 나온 순서대로, 중복 제거 */
  hymnNumbers: number[];
  /** 특송·찬양 항목의 곡명 */
  praiseSongs: string[];
  /** 항목 이름을 못 알아본 줄 — 화면에서 그대로 보여 준다 */
  unmatched: string[];
}

/** '한만상 목사', '김동경 강도사' 처럼 이름 + 직함 */
const NAME_WITH_TITLE = /([가-힣]{2,5})\s*(담임목사|부목사|원로목사|목사|강도사|전도사|선교사|장로|권사|집사)/;

/** '묵      도 ................ 다같이' 처럼 늘어난 공백·점선을 정리한다 */
function tidy(value: string): string {
  return value
    .replace(/[.·…]{2,}/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * '항목 ...... 내용' 또는 '항목: 내용' 으로 나눈다. 나눌 수 없으면 null.
 *
 * 점선을 콜론보다 먼저 본다. 주보 순서표의 원래 구분자가 점선이고,
 * 내용 쪽에 콜론이 들어가는 경우(성경 장절 '요 14:1-3')가 흔하기 때문이다.
 * 콜론으로 나눌 때도 첫 콜론에서 끊는다(비탐욕) — 같은 이유다.
 */
function splitEntry(rawLine: string): { label: string; value: string } | null {
  const build = (rawLabel: string, rawValue: string) => {
    const label = tidy(rawLabel).replace(/\s+/g, '');
    const value = tidy(rawValue).replace(/^[:：]\s*/, '');
    return label && value ? { label, value } : null;
  };

  const dotted = /^(.+?)[.·…]{2,}(.+)$/.exec(rawLine);
  if (dotted) {
    const built = build(dotted[1], dotted[2]);
    if (built) return built;
  }

  const colon = /^([^:：]+?)[:：]\s*(.+)$/.exec(rawLine);
  return colon ? build(colon[1], colon[2]) : null;
}

/** 곡명 뒤에 붙은 담당자 표기를 떼어낸다 — '주 품에 / 찬양대' → '주 품에' */
function stripPerformer(value: string): string {
  return tidy(value.split(/[/|]/)[0]);
}

/** 값 전체가 사람 이름 + 직함인지 — '한만상 목사' */
function isPersonOnly(value: string): boolean {
  const matched = NAME_WITH_TITLE.exec(value);
  return Boolean(matched && tidy(matched[0]) === tidy(value));
}

/** 값에서 사람 이름 + 직함을 뽑는다 */
function findPerson(value: string): string {
  const matched = NAME_WITH_TITLE.exec(value);
  return matched ? `${matched[1]} ${matched[2]}` : '';
}

/**
 * '마음에 근심하지 말라! / 한만상 목사' → { title, preacher }
 * 구분자(/ | - ( )로 나뉘거나 끝에 이름이 붙은 경우를 모두 받는다.
 */
function splitTitleAndPreacher(value: string): { title: string; preacher: string } {
  /* 값 전체가 사람 이름이면 제목이 아니라 설교자다. */
  if (isPersonOnly(value)) return { title: '', preacher: findPerson(value) };

  const person = findPerson(value);
  if (!person) return { title: tidy(value), preacher: '' };

  const matched = NAME_WITH_TITLE.exec(value)!;
  const before = value.slice(0, matched.index);
  const after = value.slice(matched.index + matched[0].length);
  /* 이름 앞뒤의 구분자·괄호를 털어낸다 */
  const title = tidy(`${before} ${after}`.replace(/[/|(){}[\]<>·,\-–—]/g, ' '));
  return { title, preacher: person };
}

export function parseServiceOrder(raw: string): ServiceOrderFields {
  const fields: ServiceOrderFields = {
    scriptureRef: '',
    sermonTitle: '',
    preacher: '',
    preacherSource: '',
    hymnNumbers: [],
    praiseSongs: [],
    unmatched: [],
  };

  /* 설교자 후보를 출처별로 모은다. 줄 순서가 아니라 출처의 확신도로 고른다 —
     축도가 설교자 항목보다 위에 있어도 축도가 이기면 안 된다. */
  let explicitPreacher = '';
  let sermonLinePreacher = '';
  let benedictionPreacher = '';

  for (const line of raw.split('\n')) {
    /* 점선을 살려서 넘겨야 하므로 여기서는 앞뒤 공백만 턴다. */
    const rawLine = line.trim();
    if (!rawLine) continue;

    const entry = splitEntry(rawLine);
    if (!entry) {
      fields.unmatched.push(tidy(rawLine));
      continue;
    }

    const { label, value } = entry;

    // 시간·인도·사회 같은 안내 항목은 설교대지에 쓰지 않는다.
    if (/^(시간|일시|인도|사회|반주|헌금위원|안내위원)/.test(label)) continue;

    // 설교자 — 라벨이 '설교자'로 끝나는 항목이 가장 믿을 만하다.
    if (/(설교자|말씀전하는이|설교담당)/.test(label)) {
      if (!explicitPreacher) explicitPreacher = findPerson(value) || tidy(value);
      continue;
    }

    // 축도는 담임목사가 맡는 경우가 많아 설교자와 다를 수 있다 — 최후 수단으로만 쓴다.
    if (/축도/.test(label)) {
      if (!benedictionPreacher) benedictionPreacher = findPerson(value);
      continue;
    }

    if (/(성경봉독|봉독|성경말씀|본문)/.test(label)) {
      if (!fields.scriptureRef) fields.scriptureRef = value;
      continue;
    }

    // 말씀선포·설교 — 제목과 설교자가 한 줄에 같이 오는 경우가 흔하다.
    if (/(말씀선포|설교제목|말씀|설교)/.test(label)) {
      const split = splitTitleAndPreacher(value);
      if (!fields.sermonTitle && split.title) fields.sermonTitle = split.title;
      if (!sermonLinePreacher && split.preacher) sermonLinePreacher = split.preacher;
      continue;
    }

    if (/^(찬송|찬송가)$/.test(label)) {
      /* '310장', '310장, 493장' 둘 다 받는다 */
      for (const token of value.split(/[,，]/)) {
        const num = parseHymnNumber(token);
        if (num !== null && !fields.hymnNumbers.includes(num)) fields.hymnNumbers.push(num);
      }
      continue;
    }

    if (/(특송|찬양|헌금송|봉헌송)/.test(label)) {
      const song = stripPerformer(value);
      if (song && !fields.praiseSongs.includes(song)) fields.praiseSongs.push(song);
      continue;
    }

    // 묵도·기도·헌금·광고 등 설교대지와 무관한 항목은 조용히 흘려보낸다.
  }

  if (explicitPreacher) {
    fields.preacher = explicitPreacher;
    fields.preacherSource = 'explicit';
  } else if (sermonLinePreacher) {
    fields.preacher = sermonLinePreacher;
    fields.preacherSource = 'sermonLine';
  } else if (benedictionPreacher) {
    fields.preacher = benedictionPreacher;
    fields.preacherSource = 'benediction';
  }

  return fields;
}
