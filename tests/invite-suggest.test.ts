import { describe, expect, it } from 'vitest';
import { romanizeKorean, suggestSlugs } from '../lib/inviteSuggest';
import { isValidInviteSlug } from '../features/membership/inviteCode';

describe('romanizeKorean', () => {
  it('한글을 소리대로 옮긴다', () => {
    expect(romanizeKorean('헵시바')).toBe('hepsiba');
    expect(romanizeKorean('시온')).toBe('sion');
    expect(romanizeKorean('호산나')).toBe('hosanna');
  });

  it('숫자와 영문은 그대로 둔다', () => {
    expect(romanizeKorean('주일1부')).toBe('juil1bu');
    expect(romanizeKorean('ULJU')).toBe('ulju');
  });

  it('공백과 기호는 하이픈 하나로 모은다', () => {
    expect(romanizeKorean('헵시바 선교단')).toBe('hepsiba-seongyodan');
    expect(romanizeKorean('  주일 · 1부  ')).toBe('juil-1bu');
  });

  it('한글이 없으면 빈 문자열', () => {
    expect(romanizeKorean('!!!')).toBe('');
  });
});

describe('suggestSlugs', () => {
  it('짧은 것을 먼저 준다', () => {
    expect(suggestSlugs('헵시바', 2026)).toEqual(['hepsiba', 'hepsiba-team', 'hepsiba-2026']);
  });

  it('내놓는 것은 모두 주소 규칙을 통과한다', () => {
    for (const team of ['헵시바', '주일1부', '금요기도회', '시온찬양대']) {
      for (const slug of suggestSlugs(team, 2026)) {
        expect(isValidInviteSlug(slug), `${team} → ${slug}`).toBe(true);
      }
    }
  });

  it('너무 짧은 이름은 뒤에 붙인 것이 대신 남는다', () => {
    /* '늘' → 'neul' 은 3자를 넘지만, 한 글자 중 짧은 것은 걸러진다 */
    expect(suggestSlugs('아', 2026)).toEqual(['a-team', 'a-2026']);
  });

  it('옮길 것이 없으면 아무것도 내놓지 않는다', () => {
    expect(suggestSlugs('!!!')).toEqual([]);
  });
});
