// 교회 참여자 목록과 목회자 지정 — 관리자만.
//
// GET   → 참여자 목록 (이름·역할·목회자 여부·소속 팀)
// PATCH → 목회자 표시 켜기·끄기  { userId, isPreacher }
//
// 이름은 profiles.full_name 을 쓴다. 카톡 닉네임은 🌸행복🌸 같은 것이 흔해서
// 관리자가 누가 누구인지 알 수 없다 — 참여할 때 따로 받은 이유다.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { SupabaseServerConfigError, supabaseRest } from '../../../../lib/supabase/server';
import { getSessionUserId } from '../../../../lib/authn/currentUser';
import { getActiveChurchId } from '../../../../lib/churchScope';
import { loadMembership } from '../../../../lib/authn/membership';

export const runtime = 'nodejs';

const PatchSchema = z.object({
  userId: z.string().trim().min(1),
  isPreacher: z.boolean(),
});

function jsonError(message: string, status: number, code = 'MEMBERS_FAILED') {
  return NextResponse.json({ ok: false, code, message }, { status });
}

async function requireAdmin(): Promise<{ churchId: string } | { response: NextResponse }> {
  const userId = await getSessionUserId();
  if (!userId) return { response: jsonError('로그인이 필요합니다.', 401, 'LOGIN_REQUIRED') };
  const churchId = await getActiveChurchId();
  const membership = await loadMembership(churchId, userId);
  if (membership.churchRole !== 'admin') {
    return { response: jsonError('교회 관리자만 볼 수 있습니다.', 403, 'NOT_ADMIN') };
  }
  return { churchId };
}

export async function GET() {
  try {
    const auth = await requireAdmin();
    if ('response' in auth) return auth.response;

    const [rows, teams] = await Promise.all([
      supabaseRest<Array<{ user_id: string; role: string; is_preacher: boolean | null; created_at: string }>>(
        `/church_members?select=user_id,role,is_preacher,created_at`
          + `&church_id=eq.${auth.churchId}&order=created_at.asc`,
        { method: 'GET' },
      ),
      supabaseRest<Array<{ user_id: string; team: string; role: string }>>(
        `/worship_team_members?select=user_id,team,role&church_id=eq.${auth.churchId}`,
        { method: 'GET' },
      ),
    ]);

    /* 이름은 따로 읽는다 — church_members 에서 profiles 로 가는 외래키가 없다 */
    const ids = rows.map((row) => row.user_id);
    const names = ids.length
      ? await supabaseRest<Array<{ id: string; full_name: string | null }>>(
        `/profiles?select=id,full_name&id=in.(${ids.join(',')})`,
        { method: 'GET' },
      ).catch(() => [])
      : [];
    const nameOf = new Map(names.map((row) => [row.id, row.full_name ?? '']));

    return NextResponse.json({
      ok: true,
      members: rows.map((row) => ({
        userId: row.user_id,
        name: nameOf.get(row.user_id) || '이름 없음',
        role: row.role,
        isPreacher: Boolean(row.is_preacher),
        teams: teams
          .filter((team) => team.user_id === row.user_id)
          .map((team) => ({ team: team.team, role: team.role })),
      })),
    });
  } catch (error) {
    if (error instanceof SupabaseServerConfigError) return jsonError(error.message, 503, error.code);
    console.error('[members] list failed', error);
    return jsonError('참여자 목록을 불러오지 못했습니다.', 500);
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await requireAdmin();
    if ('response' in auth) return auth.response;

    const body = PatchSchema.parse(await request.json());
    await supabaseRest(
      `/church_members?church_id=eq.${auth.churchId}&user_id=eq.${body.userId}`,
      { method: 'PATCH', body: JSON.stringify({ is_preacher: body.isPreacher }) },
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof SupabaseServerConfigError) return jsonError(error.message, 503, error.code);
    if (error instanceof z.ZodError) return jsonError('입력값을 확인해 주세요.', 400, 'INVALID_MEMBER');
    console.error('[members] patch failed', error);
    return jsonError('목회자 표시를 바꾸지 못했습니다.', 500);
  }
}
