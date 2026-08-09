// 참여 코드와 권한 판정 — 순수 함수만. DB 를 모르므로 테스트가 쉽다.
// DB 를 만지는 쪽은 membership.ts (서버 전용).

export type InviteKind = 'church_join' | 'team_leader';
export type TeamRole = 'leader' | 'member';
export type ChurchRole = 'admin' | 'crew' | 'member';

/* 사람이 카톡으로 받아 손으로 옮겨 적는다 — 헷갈리는 글자(0/O, 1/I/L)를 뺀다 */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function generateInviteCode(length = 6): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

/** 입력한 코드를 저장된 모양으로 — 소문자·공백·하이픈을 흘려보낸다 */
export function normalizeInviteCode(raw: string): string {
  return String(raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export class InviteError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
  }
}

export interface Membership {
  churchRole: ChurchRole | null;
  /** 설교대지를 쓸 수 있는 사람 — 팀이 아니라 사람에게 붙는 표시다 */
  isPreacher: boolean;
  /** 팀 이름 → 그 팀에서의 역할 */
  teams: Record<string, TeamRole>;
}

/**
 * 그 팀의 곡·악보를 수정·삭제할 수 있는가.
 * 교회 관리자는 모든 팀, 담당자는 자기 팀만. 팀원은 보기만 한다.
 */
export function canEditTeam(membership: Membership, team: string): boolean {
  if (membership.churchRole === 'admin') return true;
  return membership.teams[team] === 'leader';
}

/**
 * 설교대지를 쓸 수 있는가.
 * 목회자로 등록된 사람과 교회 관리자다 — 관리자는 어디든 쓸 수 있다.
 * 남의 설교대지를 고치는 것은 별개다(작성자 본인만).
 */
export function canWriteSermon(membership: Membership): boolean {
  return membership.churchRole === 'admin' || membership.isPreacher;
}
