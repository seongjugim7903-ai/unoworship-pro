// 초대 링크 첫 화면에 보여 줄 정보 — 누가 어느 팀으로 부르는지.
//
// 로그인 전에 부른다. "초대받으셨습니다" 만 띄우면 받은 사람은 이게 무엇인지,
// 누가 보낸 것인지 알 수 없다. 단톡방에 링크만 떠 있는 상황이라 더 그렇다.
//
// 코드를 가진 사람에게만 답한다 — 코드 없이는 아무것도 알 수 없다.
// 링크를 받은 사람은 어차피 참여하면 볼 정보라 새로 새는 것이 없다.

import { NextResponse } from 'next/server';
import { SupabaseServerConfigError, supabaseRest } from '../../../../lib/supabase/server';
import { InviteError, findUsableInvite } from '../../../../features/membership/store';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const code = new URL(request.url).searchParams.get('code') ?? '';
    const invite = await findUsableInvite(code);

    /* 팀장 이름과 교회 이름 — 둘 다 없어도 화면은 뜬다. 문구만 짧아진다 */
    const [churches, leaders] = await Promise.all([
      supabaseRest<Array<{ name: string }>>(
        `/churches?select=name&id=eq.${invite.church_id}&limit=1`,
        { method: 'GET' },
      ),
      invite.team
        ? supabaseRest<Array<{ user_id: string }>>(
            `/worship_team_members?select=user_id&church_id=eq.${invite.church_id}`
              + `&team=eq.${encodeURIComponent(invite.team)}&role=eq.leader&limit=1`,
            { method: 'GET' },
          )
        : Promise.resolve([]),
    ]);

    let leaderName = '';
    const leaderId = leaders?.[0]?.user_id;
    if (leaderId) {
      /* 이름은 profiles.full_name 이다 — 카톡 닉네임이 아니라 참여할 때 따로 받은 이름 */
      const profiles = await supabaseRest<Array<{ full_name: string | null }>>(
        `/profiles?select=full_name&id=eq.${leaderId}&limit=1`,
        { method: 'GET' },
      );
      leaderName = (profiles?.[0]?.full_name ?? '').trim();
    }

    return NextResponse.json({
      ok: true,
      kind: invite.kind,
      team: invite.team,
      leaderName,
      churchName: churches?.[0]?.name ?? '',
    });
  } catch (error) {
    if (error instanceof InviteError) {
      return NextResponse.json({ ok: false, code: error.code, message: error.message }, { status: 404 });
    }
    if (error instanceof SupabaseServerConfigError) {
      return NextResponse.json({ ok: false, code: error.code, message: error.message }, { status: 503 });
    }
    console.error('[invite] preview failed', error);
    return NextResponse.json(
      { ok: false, code: 'INVITE_PREVIEW_FAILED', message: '초대를 확인하지 못했습니다.' },
      { status: 500 },
    );
  }
}
