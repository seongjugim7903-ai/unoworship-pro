// 참여 코드 발급·조회·회수.
//
//   관리자   교회 코드 · 담당자 코드 · 모든 팀의 팀원 링크
//   담당자   자기 팀의 팀원 링크만
//
// 팀원 링크를 담당자가 쥐는 이유 — 팀원을 부르는 것은 담당자의 일이다.
// 관리자가 모든 팀의 팀원 링크까지 나눠 주면 사람이 바뀔 때마다 관리자를 거쳐야 한다.
//
// GET    → 이 교회의 살아 있는 코드 목록. ?check=<주소>&team=<팀> 이면 중복 검사만 한다
// POST   → 코드 발급 (같은 자리에 살아 있는 코드가 있으면 회수하고 새로 만든다)
// DELETE → 코드 회수 (?id=)
//
// 팀원 링크의 주소는 담당자가 직접 정한다 — 카페 이름을 정하듯이. 무작위 코드
// (/join/J95XAF)는 단톡방에 붙었을 때 무엇인지 알 수 없고, 누가 보낸 것인지도 모른다.
// 담당자 코드는 그대로 무작위다 — 1:1 로 한 번 보내고 마는 값이라 외울 일이 없다.
//
// 교회 참여 코드는 여기서 만들지 않는다. 교회가 생길 때 하나 심어 두고 계속 쓴다
// (마이그레이션 202608090001). 잃어버렸을 때만 재발급한다.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { SupabaseServerConfigError, supabaseRest } from '../../../../lib/supabase/server';
import { getSessionUserId } from '../../../../features/membership/currentUser';
import { getActiveChurchId } from '../../../../lib/churchScope';
import { generateInviteCode, loadMembership } from '../../../../features/membership/store';
import { isValidInviteSlug, normalizeInviteCode } from '../../../../features/membership/inviteCode';

export const runtime = 'nodejs';

const IssueSchema = z.object({
  kind: z.enum(['team_leader', 'team_join', 'church_join']),
  team: z.string().trim().max(40).optional().default(''),
  /* 담당자가 정한 팀원 링크 주소. team_join 일 때만 쓴다 */
  code: z.string().trim().max(40).optional().default(''),
});

const SLUG_RULE = '영문 소문자와 숫자, 하이픈(-)만 3~30자로 정해 주세요.';

interface CodeRow { id: string; church_id: string; kind: string; team: string | null }

/** 이 주소를 쓰고 있는 코드 — 회수된 것까지 본다. code 열이 전체 유니크라 자리를 계속 차지한다 */
async function findByCode(code: string): Promise<CodeRow | null> {
  const rows = await supabaseRest<CodeRow[]>(
    /* 대소문자를 가리지 않는다. 주소에는 % _ 가 들어갈 수 없어 와일드카드 걱정이 없다 */
    `/invite_codes?select=id,church_id,kind,team&code=ilike.${encodeURIComponent(code)}&limit=1`,
    { method: 'GET' },
  );
  return rows[0] ?? null;
}

/** 이 팀이 전에 쓰다 회수한 주소면 되살려 쓴다 — 그 외에는 남이 쓰는 자리다 */
function isOwnSlot(row: CodeRow | null, churchId: string, team: string): boolean {
  return !!row && row.church_id === churchId && row.kind === 'team_join' && row.team === team;
}

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

export async function GET(request: Request) {
  try {
    const who = await caller();
    if ('response' in who) return who.response;

    /* 중복 검사 — 담당자가 주소를 타이핑하는 동안 부른다 */
    const params = new URL(request.url).searchParams;
    const check = params.get('check');
    if (check !== null) {
      const slug = normalizeInviteCode(check);
      if (!isValidInviteSlug(slug)) {
        return NextResponse.json({ ok: true, slug, available: false, reason: SLUG_RULE });
      }
      const team = params.get('team')?.trim() ?? '';
      const row = await findByCode(slug);
      const available = !row || isOwnSlot(row, who.churchId, team);
      return NextResponse.json({
        ok: true,
        slug,
        available,
        reason: available ? '' : '이미 쓰고 있는 주소입니다. 다른 이름으로 정해 주세요.',
      });
    }

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

    /* 팀원 링크 주소는 담당자가 정한다. 담당자 코드·교회 코드는 무작위 그대로 */
    let code = generateInviteCode();
    let reviveId: string | null = null;
    if (body.kind === 'team_join') {
      const slug = normalizeInviteCode(body.code);
      if (!slug) return jsonError('초대 주소를 정해 주세요.', 400, 'NO_SLUG');
      if (!isValidInviteSlug(slug)) return jsonError(SLUG_RULE, 400, 'BAD_SLUG');
      const row = await findByCode(slug);
      if (row && !isOwnSlot(row, auth.churchId, body.team)) {
        return jsonError('이미 쓰고 있는 주소입니다. 다른 이름으로 정해 주세요.', 409, 'SLUG_TAKEN');
      }
      code = slug;
      reviveId = row?.id ?? null;
    }

    /* 같은 자리에 살아 있는 코드가 있으면 회수한다 — 부분 유니크 인덱스가 중복을 막고,
       회수해 두어야 '다시 발급'이 곧 '이전 것 무효화'가 된다 */
    const scope = needsTeam
      ? `&kind=eq.${body.kind}&team=eq.${encodeURIComponent(body.team)}`
      : '&kind=eq.church_join';
    await supabaseRest(
      `/invite_codes?church_id=eq.${auth.churchId}&revoked_at=is.null${scope}`,
      { method: 'PATCH', body: JSON.stringify({ revoked_at: new Date().toISOString() }) },
    );

    if (reviveId) {
      /* 전에 쓰던 주소로 되돌아왔다. code 열이 전체 유니크라 새로 넣을 수 없고,
         바로 위에서 방금 회수해 두었으므로 되살리면 그것이 유일한 살아 있는 코드가 된다 */
      await supabaseRest(
        `/invite_codes?id=eq.${reviveId}`,
        { method: 'PATCH', body: JSON.stringify({ revoked_at: null }) },
        { prefer: 'return=minimal' },
      );
    } else {
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
    }

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
