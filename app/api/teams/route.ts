// 팀 목록·생성·정리, 그리고 가입·탈퇴.
//
// GET    → 이 교회의 팀 목록 + 내가 어디에 속했는지
// POST   → 팀 만들기 (관리자만)
// PATCH  → 팀 가입·탈퇴 (본인)
// DELETE → 팀 접기 (관리자만). 지우지 않고 archived_at 을 찍는다 —
//          worship_prep_songs 가 팀 이름으로 자료를 물고 있어서 지우면 그 자료가 미아가 된다.
//
// 가입은 자유다. 팀 경계는 '자기 팀 것만 보이게 해서 화면을 단순하게' 하는 장치이지
// 훔쳐보기를 막는 잠금이 아니다. 담당자(팀장)만 코드로 정한다.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { SupabaseServerConfigError, supabaseRest } from '../../../lib/supabase/server';
import { getSessionUserId } from '../../../features/membership/currentUser';
import { getActiveChurchId } from '../../../lib/churchScope';
import { joinTeam, loadMembership } from '../../../features/membership/store';

export const runtime = 'nodejs';

export const TEAM_CATEGORIES = ['준비찬양', '찬양대'] as const;

const CreateSchema = z.object({
  category: z.enum(TEAM_CATEGORIES),
  name: z.string().trim().min(1, '팀 이름을 적어 주세요.').max(30),
});

const MembershipSchema = z.object({
  team: z.string().trim().min(1),
  join: z.boolean(),
});

interface TeamRow {
  id: string;
  category: string;
  name: string;
  sort_order: number;
}

function jsonError(message: string, status: number, code = 'TEAMS_FAILED') {
  return NextResponse.json({ ok: false, code, message }, { status });
}

async function context() {
  const userId = await getSessionUserId();
  if (!userId) return null;
  const churchId = await getActiveChurchId();
  return { userId, churchId };
}

export async function GET() {
  try {
    const ctx = await context();
    if (!ctx) return jsonError('로그인이 필요합니다.', 401, 'LOGIN_REQUIRED');

    const [teams, membership] = await Promise.all([
      supabaseRest<TeamRow[]>(
        `/worship_teams?select=id,category,name,sort_order`
          + `&church_id=eq.${ctx.churchId}&archived_at=is.null&order=sort_order.asc,name.asc`,
        { method: 'GET' },
      ),
      loadMembership(ctx.churchId, ctx.userId),
    ]);

    return NextResponse.json({
      ok: true,
      teams,
      /* 팀 이름 → 내 역할(leader | member). 없으면 안 들어간 팀이다 */
      mine: membership.teams,
      isAdmin: membership.churchRole === 'admin',
    });
  } catch (error) {
    if (error instanceof SupabaseServerConfigError) return jsonError(error.message, 503, error.code);
    console.error('[teams] list failed', error);
    return jsonError('팀 목록을 불러오지 못했습니다.', 500);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await context();
    if (!ctx) return jsonError('로그인이 필요합니다.', 401, 'LOGIN_REQUIRED');

    const membership = await loadMembership(ctx.churchId, ctx.userId);
    if (membership.churchRole !== 'admin') {
      return jsonError('교회 관리자만 팀을 만들 수 있습니다.', 403, 'NOT_ADMIN');
    }

    const body = CreateSchema.parse(await request.json());
    await supabaseRest(
      '/worship_teams',
      {
        method: 'POST',
        body: JSON.stringify({
          church_id: ctx.churchId,
          category: body.category,
          name: body.name,
          created_by: ctx.userId,
          sort_order: 99,
        }),
      },
      { prefer: 'return=minimal' },
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof SupabaseServerConfigError) return jsonError(error.message, 503, error.code);
    if (error instanceof z.ZodError) {
      return jsonError(error.issues[0]?.message ?? '입력값을 확인해 주세요.', 400, 'INVALID_TEAM');
    }
    /* 같은 이름이 이미 있으면 고유 인덱스가 막는다 */
    const message = error instanceof Error && /duplicate|unique/i.test(error.message)
      ? '같은 이름의 팀이 이미 있습니다.'
      : '팀을 만들지 못했습니다.';
    console.error('[teams] create failed', error);
    return jsonError(message, 400, 'TEAM_CREATE_FAILED');
  }
}

export async function PATCH(request: Request) {
  try {
    const ctx = await context();
    if (!ctx) return jsonError('로그인이 필요합니다.', 401, 'LOGIN_REQUIRED');

    const body = MembershipSchema.parse(await request.json());

    if (body.join) {
      await joinTeam(ctx.churchId, ctx.userId, body.team, 'member');
      return NextResponse.json({ ok: true });
    }

    /* 담당자는 스스로 빠질 수 없다 — 빠지면 그 팀에 담당자가 없어지고,
       담당자 코드는 1회용이라 관리자가 새로 뽑아야 한다. */
    const membership = await loadMembership(ctx.churchId, ctx.userId);
    if (membership.teams[body.team] === 'leader') {
      return jsonError('담당자는 스스로 나갈 수 없습니다. 교회 관리자에게 말씀해 주세요.', 400, 'LEADER_CANNOT_LEAVE');
    }

    await supabaseRest(
      `/worship_team_members?church_id=eq.${ctx.churchId}&user_id=eq.${ctx.userId}`
        + `&team=eq.${encodeURIComponent(body.team)}`,
      { method: 'DELETE' },
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof SupabaseServerConfigError) return jsonError(error.message, 503, error.code);
    if (error instanceof z.ZodError) return jsonError('입력값을 확인해 주세요.', 400, 'INVALID_TEAM');
    console.error('[teams] membership failed', error);
    return jsonError('팀 가입 상태를 바꾸지 못했습니다.', 500);
  }
}

export async function DELETE(request: Request) {
  try {
    const ctx = await context();
    if (!ctx) return jsonError('로그인이 필요합니다.', 401, 'LOGIN_REQUIRED');

    const membership = await loadMembership(ctx.churchId, ctx.userId);
    if (membership.churchRole !== 'admin') {
      return jsonError('교회 관리자만 팀을 정리할 수 있습니다.', 403, 'NOT_ADMIN');
    }

    const id = new URL(request.url).searchParams.get('id')?.trim();
    if (!id) return jsonError('id가 없습니다.', 400, 'NO_ID');

    /* 지우지 않고 접는다 — 자료가 팀 이름을 물고 있어서 지우면 미아가 된다 */
    await supabaseRest(
      `/worship_teams?church_id=eq.${ctx.churchId}&id=eq.${id}`,
      { method: 'PATCH', body: JSON.stringify({ archived_at: new Date().toISOString() }) },
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof SupabaseServerConfigError) return jsonError(error.message, 503, error.code);
    console.error('[teams] archive failed', error);
    return jsonError('팀을 정리하지 못했습니다.', 500);
  }
}
