// 초대 주소 예시 만들기 — 팀 이름을 로마자로 옮긴다.
//
// 주소는 영문이라야 한다(브라우저 주소창에서 한글은 %ED%97%B5... 로 깨져 붙는다).
// 그런데 담당자에게 "영문으로 지으세요"라고만 하면 거기서 멈춘다 — 헵시바를
// 영어로 어떻게 쓰는지가 그분의 일이 아니다. 그래서 우리가 먼저 지어서 보여 준다.
//
// 표기는 국어의 로마자 표기법(개정)을 음절 단위로만 따른다. 자음동화·구개음화는
// 넣지 않았다 — 사람이 읽을 이름이 아니라 눌러서 들어올 주소이고, 규칙이 늘수록
// 결과가 예측하기 어려워진다. 주일1부 → juil1bu.
//
// 다만 성경에서 온 이름은 소리대로 옮기면 어색하다. 헵시바는 hepsiba 가 아니라
// Hephzibah 다(이사야 62:4). 그분들이 평생 봐 온 철자가 따로 있는데 우리가 새로
// 지어 주면 남의 이름 같다. 그래서 아는 이름은 사전에서 꺼내 쓰고, 모르는 이름만
// 소리대로 옮긴다. 사전에 없다고 틀리는 것은 아니다 — 소리대로 옮겨도 주소는 된다.

const INITIALS = ['g', 'kk', 'n', 'd', 'tt', 'r', 'm', 'b', 'pp', 's', 'ss', '', 'j', 'jj', 'ch', 'k', 't', 'p', 'h'];

const VOWELS = [
  'a', 'ae', 'ya', 'yae', 'eo', 'e', 'yeo', 'ye', 'o', 'wa', 'wae', 'oe', 'yo',
  'u', 'wo', 'we', 'wi', 'yu', 'eu', 'ui', 'i',
];

const FINALS = [
  '', 'k', 'kk', 'ks', 'n', 'nj', 'nh', 't', 'l', 'lk', 'lm', 'lp', 'ls', 'lt', 'lp', 'lh',
  'm', 'p', 'ps', 't', 't', 'ng', 't', 't', 'k', 't', 'p', 't',
];

/**
 * 정해진 철자가 있는 말 — 성경 이름과 교회에서 흔히 쓰는 낱말.
 *
 * 긴 것부터 찾아 바꾼다. '성가대'를 '성가'+'대'로 쪼개 놓으면 엉뚱해진다.
 * 여기 없는 이름은 소리대로 옮긴다 — 교회마다 부르는 이름이 달라 다 담을 수 없다.
 */
const KNOWN: Record<string, string> = {
  /* 성경에서 온 이름 */
  헵시바: 'hephzibah', 시온: 'zion', 호산나: 'hosanna', 임마누엘: 'immanuel',
  할렐루야: 'hallelujah', 에벤에셀: 'ebenezer', 베다니: 'bethany', 갈릴리: 'galilee',
  실로암: 'siloam', 엠마오: 'emmaus', 가나안: 'canaan', 나사렛: 'nazareth',
  마라나타: 'maranatha', 사르밧: 'zarephath', 브니엘: 'peniel', 아멘: 'amen',
  다윗: 'david', 사무엘: 'samuel', 다니엘: 'daniel', 에스더: 'esther',
  드보라: 'deborah', 미리암: 'miriam', 한나: 'hannah', 마리아: 'maria',
  /* 교회에서 흔히 쓰는 낱말 */
  선교단: 'mission', 선교회: 'mission', 성가대: 'choir', 찬양대: 'choir',
  찬양팀: 'praise', 워십팀: 'worship', 중창단: 'ensemble', 기도회: 'prayer',
  주일: 'sunday', 수요: 'wednesday', 금요: 'friday', 토요: 'saturday',
  청년: 'youth', 학생: 'student', 유년: 'kids', 유치: 'kids', 장년: 'adult',
};

/** 사전에 있는 말을 먼저 영문으로 바꾼다. 남은 자리는 그대로 두어 소리대로 옮기게 한다 */
function applyKnown(text: string): string {
  let out = text;
  for (const word of Object.keys(KNOWN).sort((a, b) => b.length - a.length)) {
    if (out.includes(word)) out = out.split(word).join(` ${KNOWN[word]} `);
  }
  return out;
}

const FIRST_SYLLABLE = 0xac00;
const LAST_SYLLABLE = 0xd7a3;

/**
 * 한글이 섞인 이름을 주소에 쓸 수 있는 영문으로.
 *
 * 한글은 소리대로 옮기고, 영문·숫자는 그대로 두고, 나머지(공백·기호)는 하이픈이 된다.
 */
export function romanizeKorean(text: string): string {
  let out = '';
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (code >= FIRST_SYLLABLE && code <= LAST_SYLLABLE) {
      const index = code - FIRST_SYLLABLE;
      out += INITIALS[Math.floor(index / 588)];
      out += VOWELS[Math.floor((index % 588) / 28)];
      out += FINALS[index % 28];
      continue;
    }
    out += /[a-zA-Z0-9]/.test(char) ? char.toLowerCase() : '-';
  }
  return out.replace(/-+/g, '-').replace(/^-|-$/g, '');
}

/**
 * 담당자에게 보여 줄 주소 후보 — 앞의 것일수록 짧고 좋다.
 *
 * 길이 규칙(3~30자)에 맞는 것만 남긴다. 이름이 한 글자라 너무 짧아지면
 * 뒤에 붙인 것들이 대신 남는다.
 */
export function suggestSlugs(teamName: string, year?: number): string[] {
  /* 아는 이름은 제 철자로, 모르는 이름은 소리대로. 소리대로 옮긴 것도 뒤에 남겨 둔다 —
     'hephzibah 는 길다, hepsiba 가 낫다'는 분이 있을 수 있다. 고르는 것은 담당자다. */
  const base = romanizeKorean(applyKnown(teamName));
  const sounded = romanizeKorean(teamName);
  if (!base) return [];
  const candidates = [base, `${base}-team`, sounded !== base ? sounded : (year ? `${base}-${year}` : '')];
  const seen = new Set<string>();
  return candidates.filter((slug) => {
    if (!slug || slug.length < 3 || slug.length > 30) return false;
    if (seen.has(slug)) return false;
    seen.add(slug);
    return true;
  });
}
