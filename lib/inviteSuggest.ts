// 초대 주소 예시 만들기 — 팀 이름을 로마자로 옮긴다.
//
// 주소는 영문이라야 한다(브라우저 주소창에서 한글은 %ED%97%B5... 로 깨져 붙는다).
// 그런데 담당자에게 "영문으로 지으세요"라고만 하면 거기서 멈춘다 — 헵시바를
// 영어로 어떻게 쓰는지가 그분의 일이 아니다. 그래서 우리가 먼저 지어서 보여 준다.
//
// 표기는 국어의 로마자 표기법(개정)을 음절 단위로만 따른다. 자음동화·구개음화는
// 넣지 않았다 — 사람이 읽을 이름이 아니라 눌러서 들어올 주소이고, 규칙이 늘수록
// 결과가 예측하기 어려워진다. 헵시바 → hepsiba, 주일1부 → juil1bu.

const INITIALS = ['g', 'kk', 'n', 'd', 'tt', 'r', 'm', 'b', 'pp', 's', 'ss', '', 'j', 'jj', 'ch', 'k', 't', 'p', 'h'];

const VOWELS = [
  'a', 'ae', 'ya', 'yae', 'eo', 'e', 'yeo', 'ye', 'o', 'wa', 'wae', 'oe', 'yo',
  'u', 'wo', 'we', 'wi', 'yu', 'eu', 'ui', 'i',
];

const FINALS = [
  '', 'k', 'kk', 'ks', 'n', 'nj', 'nh', 't', 'l', 'lk', 'lm', 'lp', 'ls', 'lt', 'lp', 'lh',
  'm', 'p', 'ps', 't', 't', 'ng', 't', 't', 'k', 't', 'p', 't',
];

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
  const base = romanizeKorean(teamName);
  if (!base) return [];
  const candidates = [base, `${base}-team`, year ? `${base}-${year}` : ''];
  const seen = new Set<string>();
  return candidates.filter((slug) => {
    if (!slug || slug.length < 3 || slug.length > 30) return false;
    if (seen.has(slug)) return false;
    seen.add(slug);
    return true;
  });
}
