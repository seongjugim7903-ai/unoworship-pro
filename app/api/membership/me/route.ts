// 지금 로그인한 사람이 누구이고 어느 교회·팀에 속했는지.
//
// GET → { loggedIn, name, churchRole, isPreacher, teams, teamCategories, can }
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
      supabaseRest<Array<{ full_name: string | null }>>(
        `/profiles?select=full_name&id=eq.${userId}&limit=1`,
        { method: 'GET' },
      ).catch(() => []),
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
      churchRole: membership.churchRole,
      isPreacher: membership.isPreacher,
      teams: membership.teams,
      teamCategories: Object.fromEntries(
        mine.map((team) => [team, categoryOf.get(team) ?? '']),
      ),
      can: {
        /* 설교대지는 목회자와 관리자만. 남에게는 화면 자체를 보여주지 않는다 */
        sermon: isAdmin || membership.isPreacher,
        /* 준비찬양·찬양대는 그 카테고리 팀에 든 사람만 */
        worship: inCategory('준비찬양'),
        choir: inCategory('찬양대'),
        /* 올리고 고치는 것은 담당자만 */
        editWorship: leadsCategory('준비찬양'),
        editChoir: leadsCategory('찬양대'),
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
