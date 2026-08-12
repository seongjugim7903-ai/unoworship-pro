import { describe, expect, it } from 'vitest';
import {
  canEditTeam,
  canWriteSermon,
  generateInviteCode,
  isValidInviteSlug,
  normalizeInviteCode,
  type Membership,
} from '../features/membership/inviteCode';

// 코드는 두 모양이다 — 담당자 코드는 무작위 대문자, 팀원 초대 주소는 담당자가 정한
// 영문 소문자다. 정규화는 둘 다 찾을 수 있는 모양으로 만드는 일을 한다.

describe('normalizeInviteCode', () => {
  it('대소문자를 가리지 않는다 — 조회도 대소문자를 무시한다', () => {
    expect(normalizeInviteCode('A2C4E6')).toBe('a2c4e6');
    expect(normalizeInviteCode('a2c4e6')).toBe('a2c4e6');
  });

  it('하이픈은 남긴다 — 담당자가 정한 주소의 일부다', () => {
    expect(normalizeInviteCode('ULJU-Sunday1')).toBe('ulju-sunday1');
  });

  it('공백과 그 밖의 글자는 버린다', () => {
    expect(normalizeInviteCode(' ABC DEF ')).toBe('abcdef');
    expect(normalizeInviteCode('울주 ulju!')).toBe('ulju');
  });

  it('빈 값은 빈 문자열', () => {
    expect(normalizeInviteCode('')).toBe('');
    expect(normalizeInviteCode('   ')).toBe('');
  });
});

describe('isValidInviteSlug', () => {
  it('영문 소문자·숫자·하이픈 3~30자를 받는다', () => {
    expect(isValidInviteSlug('ulju-sunday1')).toBe(true);
    expect(isValidInviteSlug('abc')).toBe(true);
    expect(isValidInviteSlug('a'.repeat(30))).toBe(true);
  });

  it('너무 짧거나 길면 막는다 — 주소창에 들어갈 이름이다', () => {
    expect(isValidInviteSlug('ab')).toBe(false);
    expect(isValidInviteSlug('a'.repeat(31))).toBe(false);
  });

  it('하이픈으로 시작할 수 없고 대문자·한글은 못 쓴다', () => {
    expect(isValidInviteSlug('-ulju')).toBe(false);
    expect(isValidInviteSlug('Ulju')).toBe(false);
    expect(isValidInviteSlug('울주')).toBe(false);
  });
});

describe('generateInviteCode', () => {
  it('헷갈리는 글자를 쓰지 않는다', () => {
    // 0/O, 1/I/L 은 손으로 옮겨 적을 때 서로 뒤바뀐다
    const codes = Array.from({ length: 200 }, () => generateInviteCode());
    expect(codes.join('')).not.toMatch(/[01OIL]/);
  });

  it('길이를 지킨다', () => {
    expect(generateInviteCode()).toHaveLength(6);
    expect(generateInviteCode(8)).toHaveLength(8);
  });

  it('같은 코드가 연달아 나오지 않는다', () => {
    const codes = new Set(Array.from({ length: 200 }, () => generateInviteCode()));
    expect(codes.size).toBeGreaterThan(190);
  });
});

describe('canEditTeam', () => {
  const make = (over: Partial<Membership> = {}): Membership => ({
    churchRole: 'member', isPreacher: false, teams: {}, ...over,
  });

  it('교회 관리자는 모든 팀을 손댄다', () => {
    const admin = make({ churchRole: 'admin' });
    expect(canEditTeam(admin, '주일1부')).toBe(true);
    expect(canEditTeam(admin, '금요기도회')).toBe(true);
  });

  it('팀장은 자기 팀만', () => {
    const leader = make({ teams: { 주일1부: 'leader', 수요예배: 'member' } });
    expect(canEditTeam(leader, '주일1부')).toBe(true);
    expect(canEditTeam(leader, '수요예배')).toBe(false);
  });

  it('팀원은 보기만 한다', () => {
    expect(canEditTeam(make({ teams: { 주일1부: 'member' } }), '주일1부')).toBe(false);
  });

  it('소속이 없으면 아무 것도 못 고친다', () => {
    expect(canEditTeam(make({ churchRole: null }), '주일1부')).toBe(false);
  });
});

describe('canWriteSermon', () => {
  const make = (over: Partial<Membership> = {}): Membership => ({
    churchRole: 'member', isPreacher: false, teams: {}, ...over,
  });

  it('목회자로 등록된 사람은 쓸 수 있다', () => {
    expect(canWriteSermon(make({ isPreacher: true }))).toBe(true);
  });

  it('교회 관리자는 표시와 무관하게 쓸 수 있다', () => {
    expect(canWriteSermon(make({ churchRole: 'admin' }))).toBe(true);
  });

  it('그 외에는 못 쓴다 — 팀 담당이어도 설교대지는 별개다', () => {
    expect(canWriteSermon(make())).toBe(false);
    expect(canWriteSermon(make({ teams: { 주일1부: 'leader' } }))).toBe(false);
  });
});
