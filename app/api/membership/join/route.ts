// 참여 코드로 교회·팀에 들어간다.
//
// POST application/json — { code, name }
//
//   church_join  코드  → 교회에 들어간다. 팀은 없다
//   team_leader  코드  → 그 코드에 적힌 팀의 담당이 된다
//
// 팀원은 팀 소속을 갖지 않는다. 보기만 하므로 소속이 아무 역할을 하지 않는다 —
// 팀 소속은 담당자에게만 생기고, 그것을 정하는 것은 담당자용 코드다.
//
// 그 교회 첫 사용자는 관리자가 된다 — 구독을 결제한 사람이 가장 먼저 들어온다.
//
// 여기는 로그인이 필수다. UNOWORSHIP_REQUIRE_LOGIN 스위치와 무관하다 —
// 누가 들어오는지 모르면 참여 자체가 성립하지 않는다.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { SupabaseServerConfigError, supabaseRest } from '../../../../lib/supabase/server';
import { getSessionUserId } from '../../../../features/membership/currentUser';
import {
  InviteError,
  loadMembership,
  findUsableInvite,
  isFirstMember,
  joinChurch,
  joinTeam,
  markInviteUsed,
} from '../../../../features/membership/store';

export const runtime = 'nodejs';

const BodySchema = z.object({
  code: z.string().trim().min(1, '참여 코드를 입력해 주세요.'),
  /* 카톡 닉네임은 관리에 못 쓴다 — 교회에서 부르는 이름을 한 번 받는다 */
  /* 담당자 코드 경로에서는 이미 이름이 있으므로 비워 보낸다 */
  name: z.string().trim().max(40).optional().default(''),
});

function jsonError(message: string, status: number, code = 'MEMBERSHIP_JOIN_FAILED') {
  return NextResponse.json({ ok: false, code, message }, { status });
}

export async function POST(request: Request) {
  try {
    const userId = await getSessionUserId();
    if (!userId) {
      return jsonError('로그인이 필요합니다. 카카오로 로그인한 뒤 다시 시도해 주세요.', 401, 'LOGIN_REQUIRED');
    }

    const body = BodySchema.parse(await request.json());
    const invite = await findUsableInvite(body.code);

    /* 코드 두 종류를 구별해 안내한다 — 잘못 넣었을 때 무엇을 받아야 하는지 알려 준다 */
    const already = await loadMembership(invite.church_id, userId);
    if (invite.kind === 'church_join' && already.churchRole) {
      return jsonError('이미 교회에 참여하셨습니다. 담당을 맡으셨다면 담당자 코드를 넣어 주세요.', 400, 'ALREADY_JOINED');
    }
    if (invite.kind === 'team_leader' && already.teams[invite.team ?? '']) {
      return jsonError('이미 그 팀의 담당자입니다.', 400, 'ALREADY_LEADER');
    }

    /* 이름 먼저 — 참여가 실패해도 이름은 남는 편이 낫다(다시 묻지 않게).
       담당자 코드 경로는 이름을 비워 보내므로 그때는 덮어쓰지 않는다. */
    if (body.name) {
      await supabaseRest(
        '/profiles?on_conflict=id',
        { method: 'POST', body: JSON.stringify({ id: userId, full_name: body.name, church_id: invite.church_id }) },
        { prefer: 'resolution=merge-duplicates,return=minimal' },
      );
    }

    const first = await isFirstMember(invite.church_id);
    await joinChurch(invite.church_id, userId, first ? 'admin' : 'member');

    let joinedTeam = '';
    let teamRole: 'leader' | 'member' | null = null;

    if (invite.kind === 'team_leader' && invite.team) {
      /* 팀은 코드가 정한다 — 참여 화면에는 고르는 칸이 없다 */
      joinedTeam = invite.team;
      teamRole = 'leader';
      await joinTeam(invite.church_id, userId, invite.team, 'leader');
    }

    await markInviteUsed(invite);

    return NextResponse.json({
      ok: true,
      churchRole: first ? 'admin' : 'member',
      team: joinedTeam || null,
      teamRole,
    });
  } catch (error) {
    if (error instanceof InviteError) return jsonError(error.message, 400, error.code);
    if (error instanceof SupabaseServerConfigError) return jsonError(error.message, 503, error.code);
    if (error instanceof z.ZodError) {
      return jsonError(error.issues[0]?.message ?? '입력값을 확인해 주세요.', 400, 'INVALID_JOIN');
    }
    console.error('[membership] join failed', error);
    return jsonError('참여 처리 중 오류가 발생했습니다.', 500);
  }
}
