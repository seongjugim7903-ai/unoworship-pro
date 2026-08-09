import { describe, expect, it } from 'vitest';
import {
  canEditTeam,
  canWriteSermon,
  generateInviteCode,
  normalizeInviteCode,
  type Membership,
} from '../features/membership/inviteCode';

// 코드는 사람이 카톡으로 받아 손으로 옮겨 적는다. 그 과정에서 생기는 흔들림
// (소문자, 하이픈, 공백)을 흘려보내는 것이 이 함수들의 일이다.

describe('normalizeInviteCode', () => {
  it('소문자를 올린다', () => {
    expect(normalizeInviteCode('a2c4e6')).toBe('A2C4E6');
  });

  it('사람이 끼워 넣는 하이픈·공백을 버린다', () => {
    expect(normalizeInviteCode('ABC-DEF')).toBe('ABCDEF');
    expect(normalizeInviteCode(' ABC DEF ')).toBe('ABCDEF');
  });

  it('빈 값은 빈 문자열', () => {
    expect(normalizeInviteCode('')).toBe('');
    expect(normalizeInviteCode('   ')).toBe('');
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
