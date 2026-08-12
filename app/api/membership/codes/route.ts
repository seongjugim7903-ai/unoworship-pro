// 참여 코드 발급·조회·회수.
//
//   관리자   교회 코드 · 담당자 코드 · 모든 팀의 팀원 링크
//   담당자   자기 팀의 팀원 링크만
//
// 팀원 링크를 담당자가 쥐는 이유 — 팀원을 부르는 것은 담당자의 일이다.
// 관리자가 모든 팀의 팀원 링크까지 나눠 주면 사람이 바뀔 때마다 관리자를 거쳐야 한다.
//
// GET    → 이 교회의 살아 있는 코드 목록
// POST   → 팀장 코드 발급 (같은 팀에 살아 있는 코드가 있으면 회수하고 새로 만든다)
// DELETE → 코드 회수 (?id=)
//
// 교회 참여 코드는 여기서 만들지 않는다. 교회가 생길 때 하나 심어 두고 계속 쓴다
// (마이그레이션 202608090001). 잃어버렸을 때만 재발급한다.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { SupabaseServerConfigError, supabaseRest } from '../../../../lib/supabase/server';
import { getSessionUserId } from '../../../../features/membership/currentUser';
import { getActiveChurchId } from '../../../../lib/churchScope';
import { generateInviteCode, loadMembership } from '../../../../features/membership/store';

export const runtime = 'nodejs';

const IssueSchema = z.object({
  kind: z.enum(['team_leader', 'team_join', 'church_join']),
  team: z.string().trim().max(40).optional().default(''),
});

function jsonError(message: string, status: number, code = 'CODES_FAILED') {
  return NextResponse.json({ ok: false, code, message }, { status });
}

interface Caller { churchId: string; userId: string; isAdmin: boolean; teams: Record<string, string> }

async function caller(): Promise<Caller | { response: NextResponse }> {
  const userId = await getSessionUserId();
  if (!userId) return { response: jsonError('로그인이 필요합니다.', 401, 'LOGIN_REQUIRED') };
  const churchId = await getActiveChurchId();
  const membership = await loadMembership(churchId, userId);
  return {
    churchId,
    userId,
    isAdmin: membership.churchRole === 'admin',
    teams: membership.teams,
  };
}

async function requireAdmin(): Promise<{ churchId: string } | { response: NextResponse }> {
  const who = await caller();
  if ('response' in who) return who;
  if (!who.isAdmin) return { response: jsonError('교회 관리자만 할 수 있습니다.', 403, 'NOT_ADMIN') };
  return { churchId: who.churchId };
}

export async function GET() {
  try {
    const who = await caller();
    if ('response' in who) return who.response;

    const all = await supabaseRest<Array<{ kind: string; team: string | null }>>(
      `/invite_codes?select=id,code,kind,team,max_uses,used_count,created_at`
        + `&church_id=eq.${who.churchId}&revoked_at=is.null&order=kind.asc,team.asc`,
      { method: 'GET' },
    );
    /* 담당자에게는 자기 팀의 팀원 링크만 보인다 — 교회 코드나 남의 팀 코드는 볼 일이 없다 */
    const codes = who.isAdmin
      ? all
      : all.filter((row) => row.kind === 'team_join' && row.team && who.teams[row.team] === 'leader');
    return NextResponse.json({ ok: true, codes, isAdmin: who.isAdmin });
  } catch (error) {
    if (error instanceof SupabaseServerConfigError) return jsonError(error.message, 503, error.code);
    console.error('[codes] list failed', error);
    return jsonError('코드 목록을 불러오지 못했습니다.', 500);
  }
}

export async function POST(request: Request) {
  try {
    const who = await caller();
    if ('response' in who) return who.response;

    const body = IssueSchema.parse(await request.json());
    const needsTeam = body.kind === 'team_leader' || body.kind === 'team_join';
    if (needsTeam && !body.team) {
      return jsonError('팀을 골라 주세요.', 400, 'NO_TEAM');
    }

    /* 담당자는 자기 팀의 팀원 링크만 만들 수 있다 */
    const ownTeamJoin = body.kind === 'team_join' && who.teams[body.team] === 'leader';
    if (!who.isAdmin && !ownTeamJoin) {
      return jsonError('맡으신 팀의 팀원 링크만 만들 수 있습니다.', 403, 'NOT_ALLOWED');
    }
    const auth = { churchId: who.churchId };

    /* 같은 자리에 살아 있는 코드가 있으면 회수한다 — 부분 유니크 인덱스가 중복을 막고,
       회수해 두어야 '다시 발급'이 곧 '이전 것 무효화'가 된다 */
    const scope = needsTeam
      ? `&kind=eq.${body.kind}&team=eq.${encodeURIComponent(body.team)}`
      : '&kind=eq.church_join';
    await supabaseRest(
      `/invite_codes?church_id=eq.${auth.churchId}&revoked_at=is.null${scope}`,
      { method: 'PATCH', body: JSON.stringify({ revoked_at: new Date().toISOString() }) },
    );

    const code = generateInviteCode();
    await supabaseRest(
      '/invite_codes',
      {
        method: 'POST',
        body: JSON.stringify({
          church_id: auth.churchId,
          code,
          kind: body.kind,
          team: needsTeam ? body.team : null,
          /* 담당자 자리만 한 번 열린다 — 코드가 단톡방에 돌아도 사고가 나지 않는 이유다.
             팀 코드는 팀원 모두가 쓰므로 제한하지 않는다. */
          max_uses: body.kind === 'team_leader' ? 1 : null,
        }),
      },
      { prefer: 'return=minimal' },
    );

    return NextResponse.json({ ok: true, code });
  } catch (error) {
    if (error instanceof SupabaseServerConfigError) return jsonError(error.message, 503, error.code);
    if (error instanceof z.ZodError) {
      return jsonError(error.issues[0]?.message ?? '입력값을 확인해 주세요.', 400, 'INVALID_CODE_REQUEST');
    }
    console.error('[codes] issue failed', error);
    return jsonError('코드를 발급하지 못했습니다.', 500);
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = await requireAdmin();
    if ('response' in auth) return auth.response;

    const id = new URL(request.url).searchParams.get('id')?.trim();
    if (!id) return jsonError('id가 없습니다.', 400, 'NO_ID');

    await supabaseRest(
      `/invite_codes?church_id=eq.${auth.churchId}&id=eq.${id}`,
      { method: 'PATCH', body: JSON.stringify({ revoked_at: new Date().toISOString() }) },
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof SupabaseServerConfigError) return jsonError(error.message, 503, error.code);
    console.error('[codes] revoke failed', error);
    return jsonError('코드를 회수하지 못했습니다.', 500);
  }
}
