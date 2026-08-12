import 'server-only';

// 교회 참여 코드와 팀 소속. 서버 전용.
//
// 배경과 결정은 docs/features/auth-church-scope/context-notes.md 참조.

import { supabaseRest } from '../../lib/supabase/server';
import {
  InviteError,
  normalizeInviteCode,
  type InviteKind,
  type Membership,
  type TeamRole,
} from './inviteCode';

/* 호출부가 두 곳을 import 하지 않게 다시 내보낸다 */
export * from './inviteCode';

export interface InviteCode {
  id: string;
  church_id: string;
  code: string;
  kind: InviteKind;
  team: string | null;
  max_uses: number | null;
  used_count: number;
  expires_at: string | null;
  revoked_at: string | null;
}

/** 쓸 수 있는 코드인지 — 없거나, 회수됐거나, 만료됐거나, 다 쓴 코드는 거절한다 */
export async function findUsableInvite(code: string): Promise<InviteCode> {
  const normalized = normalizeInviteCode(code);
  if (!normalized) throw new InviteError('참여 코드를 입력해 주세요.', 'NO_CODE');

  const rows = await supabaseRest<InviteCode[]>(
    `/invite_codes?select=id,church_id,code,kind,team,max_uses,used_count,expires_at,revoked_at`
      /* 대소문자를 가리지 않는다 — 무작위 코드는 대문자, 정한 주소는 소문자다.
         ilike 에 와일드카드를 넣지 않으므로 정확히 일치하는 것만 찾는다. */
      + `&code=ilike.${encodeURIComponent(normalized)}&limit=1`,
    { method: 'GET' },
  );
  const invite = rows?.[0];
  if (!invite) throw new InviteError('없는 코드입니다. 교회 담당자에게 다시 받아 주세요.', 'INVITE_NOT_FOUND');
  if (invite.revoked_at) throw new InviteError('더 이상 쓸 수 없는 코드입니다.', 'INVITE_REVOKED');
  if (invite.expires_at && new Date(invite.expires_at).getTime() < Date.now()) {
    throw new InviteError('기한이 지난 코드입니다.', 'INVITE_EXPIRED');
  }
  if (invite.max_uses !== null && invite.used_count >= invite.max_uses) {
    /* 팀장 코드가 여기로 온다 — 이미 누가 팀장이 되었다는 뜻이다 */
    throw new InviteError('이미 사용된 코드입니다. 교회 담당자에게 문의해 주세요.', 'INVITE_USED_UP');
  }
  return invite;
}

/** 쓴 횟수를 올린다. 실패해도 참여 자체는 이미 끝났으므로 막지 않는다 */
export async function markInviteUsed(invite: InviteCode): Promise<void> {
  await supabaseRest(
    `/invite_codes?id=eq.${invite.id}`,
    { method: 'PATCH', body: JSON.stringify({ used_count: invite.used_count + 1 }) },
  ).catch((error) => console.warn('[membership] invite use count failed', error));
}

/** 그 교회에 아직 아무도 없으면 첫 사용자다 — 관리자가 된다 */
export async function isFirstMember(churchId: string): Promise<boolean> {
  const rows = await supabaseRest<Array<{ id: string }>>(
    `/church_members?select=id&church_id=eq.${churchId}&limit=1`,
    { method: 'GET' },
  );
  return !rows?.length;
}

export async function joinChurch(
  churchId: string,
  userId: string,
  role: 'admin' | 'crew' | 'member',
): Promise<void> {
  await supabaseRest(
    '/church_members?on_conflict=church_id,user_id',
    {
      method: 'POST',
      body: JSON.stringify({ church_id: churchId, user_id: userId, role }),
    },
    { prefer: 'resolution=merge-duplicates,return=minimal' },
  );
}

export async function joinTeam(
  churchId: string,
  userId: string,
  team: string,
  role: TeamRole,
): Promise<void> {
  await supabaseRest(
    '/worship_team_members?on_conflict=church_id,user_id,team',
    {
      method: 'POST',
      body: JSON.stringify({ church_id: churchId, user_id: userId, team, role }),
    },
    { prefer: 'resolution=merge-duplicates,return=minimal' },
  );
}

export async function loadMembership(churchId: string, userId: string): Promise<Membership> {
  const [members, teams] = await Promise.all([
    supabaseRest<Array<{ role: Membership['churchRole']; is_preacher: boolean | null }>>(
      `/church_members?select=role,is_preacher&church_id=eq.${churchId}&user_id=eq.${userId}&limit=1`,
      { method: 'GET' },
    ),
    supabaseRest<Array<{ team: string; role: TeamRole }>>(
      `/worship_team_members?select=team,role&church_id=eq.${churchId}&user_id=eq.${userId}`,
      { method: 'GET' },
    ),
  ]);

  return {
    churchRole: members?.[0]?.role ?? null,
    isPreacher: Boolean(members?.[0]?.is_preacher),
    teams: Object.fromEntries((teams ?? []).map((row) => [row.team, row.role])),
  };
}

