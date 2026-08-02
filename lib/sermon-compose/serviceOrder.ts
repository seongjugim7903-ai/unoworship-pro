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
  /** '집례: 김동경 강도사' — 그 예배를 집례하는 사람. 대개 설교자와 같다 */
  | 'presider'
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

/**
 * 주보가 항목과 내용 사이에 넣는 채움 문자.
 * 점선만 있는 게 아니다 — 하이픈·물결·가운뎃점을 쓰는 주보도 흔하다.
 */
const LEADER = /[.·․‥…∙•*=_\-–—~〜]{2,}/;

/** '묵      도 ................ 다같이' 처럼 늘어난 공백·채움 문자를 정리한다 */
function tidy(value: string): string {
  return value
    .replace(new RegExp(LEADER.source, 'g'), ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 항목과 내용을 나눈다. 나눌 수 없으면 null.
 *
 * 세 가지를 순서대로 시도한다.
 *   1) 채움 문자 — '성경봉독 ...... 요 14:1-3'
 *   2) 콜론      — '성경봉독: 요 14:1-3'  (첫 콜론에서 끊는다)
 *   3) 넓은 공백 — '성경봉독      요 14:1-3'
 *
 * 채움 문자를 콜론보다 먼저 보는 이유는 내용 쪽에 콜론이 들어가는 경우
 * (성경 장절 '요 14:1-3')가 흔하기 때문이다. 콜론도 첫 콜론에서 끊는다.
 *
 * 넓은 공백은 맨 마지막이다. '찬      송      310장' 처럼 항목 글자 사이에도
 * 공백이 들어가므로, 가장 넓은 공백 덩어리에서만 끊는다.
 */
function splitEntry(rawLine: string): { label: string; value: string } | null {
  const build = (rawLabel: string, rawValue: string) => {
    const label = tidy(rawLabel).replace(/\s+/g, '');
    const value = tidy(rawValue).replace(/^[:：]\s*/, '');
    return label && value ? { label, value } : null;
  };

  const leader = new RegExp(`^(.+?)${LEADER.source}(.+)$`).exec(rawLine);
  if (leader) {
    const built = build(leader[1], leader[2]);
    if (built) return built;
  }

  /* 항목 이름에는 숫자가 없다. 잘라낸 왼쪽에 숫자가 있으면 값 안의 콜론('빌4:6-7')에서
     잘못 끊은 것이므로 이 방법을 버리고 공백 쪽으로 넘어간다. */
  const colon = /^([^:：]+?)[:：]\s*(.+)$/.exec(rawLine);
  if (colon && !/\d/.test(colon[1])) {
    const built = build(colon[1], colon[2]);
    if (built) return built;
  }

  /* 가장 넓은 공백 덩어리를 찾아 거기서 끊는다. 2칸 미만은 항목 글자 사이 공백으로 본다. */
  let widest: { index: number; length: number } | null = null;
  for (const match of rawLine.matchAll(/\s{2,}/g)) {
    const index = match.index ?? 0;
    const length = match[0].length;
    if (index === 0 || index + length >= rawLine.length) continue;
    if (!widest || length > widest.length) widest = { index, length };
  }
  if (!widest) return null;

  return build(rawLine.slice(0, widest.index), rawLine.slice(widest.index + widest.length));
}

/** 곡명 뒤에 붙은 담당자 표기를 떼어낸다 — '주 품에 / 찬양대' → '주 품에' */
function stripPerformer(value: string): string {
  return tidy(value.split(/[/|]/)[0]);
}

/**
 * 성경 표기 뒤의 쪽수 안내를 떼어낸다 — '히10:32-39(신364)' → '히10:32-39'.
 * 주보는 성경책 쪽수를 괄호로 덧붙이는 경우가 많다(신약 364쪽).
 */
function stripPageHint(value: string): string {
  return tidy(value.replace(/[(（]\s*[가-힣]{0,2}\s*\d+\s*(?:쪽|p|P)?\s*[)）]\s*$/, ''));
}

/** 예배 순서의 항목 이름으로 볼 만한 줄인지 — 라벨 없는 설교제목을 가려낼 때 쓴다 */
const KNOWN_ITEM = /(묵도|찬송|찬양|경배|기도|봉헌|헌금|헌금위원|광고|축도|성경|봉독|말씀|설교|주기도|사도신경|교독문|성찬|폐회|개회|인도|사회|반주|集禮|집례|시간)/;

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
  let presiderPreacher = '';
  let benedictionPreacher = '';

  /* 라벨 없는 줄의 위치를 기억해 둔다. 설교제목이 성경 줄 바로 다음에
     라벨 없이 오는 주보가 있어서(울주교회 수요예배), 나중에 그 자리를 본다. */
  const looseLines = new Map<number, string>();
  let scriptureLine = -1;

  const lines = raw.split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    /* 점선을 살려서 넘겨야 하므로 여기서는 앞뒤 공백만 턴다. */
    const rawLine = lines[index].trim();
    if (!rawLine) continue;

    const entry = splitEntry(rawLine);
    if (!entry) {
      looseLines.set(index, tidy(rawLine));
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

    // 집례자는 그 예배를 이끄는 사람 — 수요·금요 예배에서는 대개 설교자와 같다.
    if (/집례/.test(label)) {
      if (!presiderPreacher) presiderPreacher = findPerson(value);
      continue;
    }

    // 축도는 담임목사가 맡는 경우가 많아 설교자와 다를 수 있다 — 최후 수단으로만 쓴다.
    if (/축도/.test(label)) {
      if (!benedictionPreacher) benedictionPreacher = findPerson(value);
      continue;
    }

    // '성경봉독' 뿐 아니라 '성경' 한 글자짜리 라벨을 쓰는 주보도 많다.
    if (/(성경봉독|봉독|성경말씀|성경|본문)/.test(label)) {
      if (!fields.scriptureRef) {
        fields.scriptureRef = stripPageHint(value);
        scriptureLine = index;
      }
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

  /* 설교제목 라벨이 없는 주보 — 성경 줄 바로 다음의 라벨 없는 문장을 제목으로 본다.
     ('성경: 히10:32-39(신364)' 다음 줄에 '물러나지 않는 믿음' 만 적혀 있는 형식)
     앞줄이 아니라 '바로 다음 줄'만 보고, 순서 항목 이름처럼 생긴 줄은 제외한다. */
  if (!fields.sermonTitle && scriptureLine >= 0) {
    for (let index = scriptureLine + 1; index < lines.length; index += 1) {
      if (!lines[index].trim()) continue; // 빈 줄은 건너뛴다
      const candidate = looseLines.get(index);
      if (candidate && !KNOWN_ITEM.test(candidate)) {
        fields.sermonTitle = candidate;
        looseLines.delete(index);
      }
      break; // 바로 다음 줄만 본다
    }
  }

  fields.unmatched = [...looseLines.values()];

  if (explicitPreacher) {
    fields.preacher = explicitPreacher;
    fields.preacherSource = 'explicit';
  } else if (sermonLinePreacher) {
    fields.preacher = sermonLinePreacher;
    fields.preacherSource = 'sermonLine';
  } else if (presiderPreacher) {
    fields.preacher = presiderPreacher;
    fields.preacherSource = 'presider';
  } else if (benedictionPreacher) {
    fields.preacher = benedictionPreacher;
    fields.preacherSource = 'benediction';
  }

  return fields;
}
