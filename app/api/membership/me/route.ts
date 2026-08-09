// 지금 로그인한 사람이 누구이고 어느 교회·팀에 속했는지.
//
// GET → { loggedIn, name, churchRole, teams }
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
    const [membership, profiles] = await Promise.all([
      loadMembership(churchId, userId),
      supabaseRest<Array<{ full_name: string | null }>>(
        `/profiles?select=full_name&id=eq.${userId}&limit=1`,
        { method: 'GET' },
      ).catch(() => []),
    ]);

    return NextResponse.json({
      ok: true,
      loggedIn: true,
      name: profiles?.[0]?.full_name ?? '',
      churchRole: membership.churchRole,
      teams: membership.teams,
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
