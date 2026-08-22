// 지금 로그인한 사람이 누구이고 어느 교회·팀에 속했는지.
//
// GET   → { loggedIn, name, phone, churchRole, isPreacher, teams, teamCategories, can }
// PATCH → { name?, phone? }  내 정보 고치기. 남의 것은 못 고친다 — 세션의 나만 고친다
//
// can 은 화면이 무엇을 보여줄지 정하는 데 쓴다. 권한이 없는 기능은 버튼조차 안 보인다 —
// 눌러 보고 나서 안 된다고 알려 주는 것보다 낫다. 물론 서버도 따로 막는다.
//
// 화면이 이걸 보고 세 갈래로 나눈다.
//   loggedIn=false                 → 로그인하라고 안내
//   loggedIn=true, churchRole=null → 참여 화면으로 (코드를 아직 안 넣은 사람)
//   그 외                          → 그대로 쓴다
//
// 로그인하지 않은 것은 오류가 아니다 — 200 에 loggedIn:false 로 돌려준다.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { SupabaseServerConfigError, supabaseRest } from '../../../../lib/supabase/server';
import { getSessionUserId } from '../../../../features/membership/currentUser';
import { getActiveChurchId } from '../../../../lib/churchScope';
import { loadMembership } from '../../../../features/membership/store';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const userId = await getSessionUserId();
    if (!userId) return NextResponse.json({ ok: true, loggedIn: false });

    const churchId = await getActiveChurchId();
    const [membership, profiles, teamRows] = await Promise.all([
      loadMembership(churchId, userId),
      /* phone 은 나중에 붙은 열이다 — 아직 마이그레이션을 안 돌린 교회에서는
         이 조회가 실패한다. 그때는 이름만 있는 것으로 보고 넘어간다. */
      supabaseRest<Array<{ full_name: string | null; phone: string | null }>>(
        `/profiles?select=full_name,phone&id=eq.${userId}&limit=1`,
        { method: 'GET' },
      ).catch(() => supabaseRest<Array<{ full_name: string | null; phone: string | null }>>(
        `/profiles?select=full_name&id=eq.${userId}&limit=1`,
        { method: 'GET' },
      ).catch(() => [])),
      supabaseRest<Array<{ name: string; category: string }>>(
        `/worship_teams?select=name,category&church_id=eq.${churchId}&archived_at=is.null`,
        { method: 'GET' },
      ).catch(() => []),
    ]);

    const isAdmin = membership.churchRole === 'admin';
    const categoryOf = new Map(teamRows.map((row) => [row.name, row.category]));
    /* 내가 든 팀을 카테고리로 묶는다 — 화면이 '이 기능을 보여줄까'를 이걸로 정한다 */
    const mine = Object.keys(membership.teams);
    const inCategory = (category: string) =>
      isAdmin || mine.some((team) => categoryOf.get(team) === category);
    const leadsCategory = (category: string) =>
      isAdmin || mine.some((team) => categoryOf.get(team) === category && membership.teams[team] === 'leader');

    return NextResponse.json({
      ok: true,
      loggedIn: true,
      name: profiles?.[0]?.full_name ?? '',
      phone: profiles?.[0]?.phone ?? '',
      churchRole: membership.churchRole,
      isPreacher: membership.isPreacher,
      teams: membership.teams,
      teamCategories: Object.fromEntries(
        mine.map((team) => [team, categoryOf.get(team) ?? '']),
      ),
      can: {
        /* 설교대지는 목회자와 관리자만. 남에게는 화면 자체를 보여주지 않는다 */
        sermon: isAdmin || membership.isPreacher,
        /* 곡·악보는 준비찬양 팀과 찬양대가 함께 쓴다 — 반주자는 어느 팀이든 악보를 본다.
           자료는 팀 이름으로 갈리므로 화면 하나로 충분하다(worship_prep_songs.team). */
        worship: inCategory('준비찬양') || inCategory('찬양대'),
        /* 자막 이미지 만들기는 찬양대만 */
        choir: inCategory('찬양대'),
        /* 방송실·예배준비 — 그 팀에 든 사람만 화면이 보인다 */
        broadcast: inCategory('방송실'),
        prep: inCategory('예배준비'),
        /* 게시판 — 참여자면 누구나 보고 댓글. 글쓰기는 팀장급 이상 */
        board: membership.churchRole !== null,
        postBoard: isAdmin || mine.some((team) => membership.teams[team] === 'leader'),
        /* 올리고 고치는 것은 담당자만 */
        editWorship: leadsCategory('준비찬양') || leadsCategory('찬양대'),
        editChoir: leadsCategory('찬양대'),
        editPrep: leadsCategory('예배준비'),
      },
    });
  } catch (error) {
    if (error instanceof SupabaseServerConfigError) {
      /* 저장 환경이 없는 배포에서는 막지 않는다 — 화면이 통째로 잠기면 손쓸 방법이 없다 */
      return NextResponse.json({ ok: true, loggedIn: false, unavailable: true });
    }
    console.error('[membership] me failed', error);
    return NextResponse.json({ ok: true, loggedIn: false, unavailable: true });
  }
}

const EditSchema = z.object({
  name: z.string().trim().min(1, '이름을 적어 주세요.').max(40).optional(),
  /* 형식을 강제하지 않는다 — 010-1234-5678, 01012345678, 집 전화가 다 온다 */
  phone: z.string().trim().max(30).optional(),
});

/**
 * 내 정보 고치기 — 이름과 연락처.
 *
 * 고칠 수 있는 것은 세션의 나뿐이다. 남의 id 를 받지 않는다.
 * 교회 소속(church_id)은 여기서 건드리지 않는다 — 그것은 참여 코드가 정한다.
 */
export async function PATCH(request: Request) {
  try {
    const userId = await getSessionUserId();
    if (!userId) return NextResponse.json({ ok: false, code: 'LOGIN_REQUIRED', message: '로그인이 필요합니다.' }, { status: 401 });

    const body = EditSchema.parse(await request.json());
    const patch: Record<string, string> = {};
    if (body.name !== undefined) patch.full_name = body.name;
    if (body.phone !== undefined) patch.phone = body.phone;
    if (Object.keys(patch).length === 0) return NextResponse.json({ ok: true, message: '고칠 것이 없습니다.' });

    const write = (fields: Record<string, string>) => supabaseRest(
      `/profiles?id=eq.${userId}`,
      { method: 'PATCH', body: JSON.stringify(fields) },
      { prefer: 'return=minimal' },
    );

    try {
      await write(patch);
    } catch (error) {
      /* phone 열이 아직 없는 교회 — 이름만이라도 저장하고 무엇이 빠졌는지 알린다.
         마이그레이션(supabase/migrations/202608220001_profile_contact.sql)을 돌리면 끝난다. */
      if (patch.phone === undefined) throw error;
      const { phone, ...rest } = patch;
      void phone;
      if (Object.keys(rest).length > 0) await write(rest);
      return NextResponse.json({ ok: true, message: '이름을 저장했습니다. 연락처는 아직 저장할 수 없습니다 — 교회 관리자에게 말씀해 주세요.' });
    }

    return NextResponse.json({ ok: true, message: '저장했습니다.' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ ok: false, code: 'INVALID_PROFILE', message: error.issues[0]?.message ?? '입력값을 확인해 주세요.' }, { status: 400 });
    }
    if (error instanceof SupabaseServerConfigError) {
      return NextResponse.json({ ok: false, code: error.code, message: error.message }, { status: 503 });
    }
    console.error('[membership] profile update failed', error);
    return NextResponse.json({ ok: false, code: 'PROFILE_UPDATE_FAILED', message: '저장하지 못했습니다.' }, { status: 500 });
  }
}
