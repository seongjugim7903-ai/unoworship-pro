import 'server-only';

// 저장 경로의 권한 검사 — "이 사람이 이걸 할 자격이 있나".
//
// 판정 규칙은 inviteCode.ts 의 순수 함수가 갖고 있다. 여기는 그것을 라우트에서
// 쓰기 좋게 감싼 것이다 — 세션에서 사람을 찾고, 소속을 읽고, 안 되면 응답을 만든다.
//
// 로그인 강제(UNOWORSHIP_REQUIRE_LOGIN)와는 다르다. 그것은 '로그인했는가'를 보고,
// 이것은 '무엇을 할 수 있는가'를 본다.

import { NextResponse } from 'next/server';
import { getSessionUserId } from './currentUser';
import { getActiveChurchId } from '../../lib/churchScope';
import { supabaseRest } from '../../lib/supabase/server';
import { loadMembership } from './store';
import { canEditTeam, canPostBoard, canWriteSermon, isChurchMember, type Membership } from './inviteCode';

export interface Who {
  userId: string;
  churchId: string;
  membership: Membership;
}

function deny(message: string, code: string, status = 403) {
  return NextResponse.json({ ok: false, code, message }, { status });
}

/**
 * 지금 요청자를 찾는다. 로그인하지 않았으면 null —
 * 막을지 말지는 호출부가 정한다(아직 로그인을 강제하지 않는 경로가 있다).
 */
export async function who(): Promise<Who | null> {
  const userId = await getSessionUserId();
  if (!userId) return null;
  const churchId = await getActiveChurchId();
  return { userId, churchId, membership: await loadMembership(churchId, userId) };
}

/**
 * 그 팀의 자료를 고칠 수 있는가. 안 되면 응답을, 되면 null 을 돌려준다.
 *
 *   const denied = await requireTeamEditor(team);
 *   if (denied) return denied;
 *
 * 로그인하지 않았으면 막는다 — 여기까지 온 것은 자료를 바꾸겠다는 뜻이다.
 */
export async function requireTeamEditor(team: string): Promise<NextResponse | null> {
  const caller = await who();
  if (!caller) return deny('로그인이 필요합니다.', 'LOGIN_REQUIRED', 401);
  if (!canEditTeam(caller.membership, team)) {
    return deny(
      `${team} 담당자만 고칠 수 있습니다. 교회 관리자나 담당자에게 말씀해 주세요.`,
      'NOT_TEAM_EDITOR',
    );
  }
  return null;
}

/**
 * 그 카테고리(준비찬양·찬양대)의 담당자인가.
 *
 * 찬양대 자막 요청처럼 자료가 팀 이름을 들고 있지 않은 경우에 쓴다 —
 * 그 카테고리 팀 중 하나라도 맡고 있으면 통과시킨다.
 */
export async function requireCategoryEditor(category: string): Promise<NextResponse | null> {
  const caller = await who();
  if (!caller) return deny('로그인이 필요합니다.', 'LOGIN_REQUIRED', 401);
  if (caller.membership.churchRole === 'admin') return null;

  const mine = Object.entries(caller.membership.teams)
    .filter(([, role]) => role === 'leader')
    .map(([team]) => team);
  if (mine.length === 0) {
    return deny(`${category} 담당자만 올리고 고칠 수 있습니다.`, 'NOT_TEAM_EDITOR');
  }

  const rows = await supabaseRest<Array<{ name: string }>>(
    `/worship_teams?select=name&church_id=eq.${caller.churchId}&category=eq.${encodeURIComponent(category)}`
      + `&archived_at=is.null`,
    { method: 'GET' },
  ).catch(() => []);
  const inCategory = new Set(rows.map((row) => row.name));
  if (!mine.some((team) => inCategory.has(team))) {
    return deny(`${category} 담당자만 올리고 고칠 수 있습니다.`, 'NOT_TEAM_EDITOR');
  }
  return null;
}

/** 게시판에 글을 쓸 수 있는가 — 팀장급 이상(담당자·관리자). 되면 요청자를 돌려준다. */
export async function requireBoardWriter(): Promise<Who | NextResponse> {
  const caller = await who();
  if (!caller) return deny('로그인이 필요합니다.', 'LOGIN_REQUIRED', 401);
  if (!canPostBoard(caller.membership)) {
    return deny('게시판 글쓰기는 팀 담당자 이상만 가능합니다.', 'NOT_BOARD_WRITER');
  }
  return caller;
}

/** 교회에 참여한 사람인가 — 게시판 보기·댓글. 되면 요청자를 돌려준다. */
export async function requireMember(): Promise<Who | NextResponse> {
  const caller = await who();
  if (!caller) return deny('로그인이 필요합니다.', 'LOGIN_REQUIRED', 401);
  if (!isChurchMember(caller.membership)) {
    return deny('교회에 참여한 뒤 이용할 수 있습니다.', 'NOT_MEMBER');
  }
  return caller;
}

/** 설교대지를 쓸 수 있는가 — 목회자로 등록된 사람과 교회 관리자다 */
export async function requireSermonWriter(): Promise<{ userId: string } | NextResponse> {
  const caller = await who();
  if (!caller) return deny('로그인이 필요합니다.', 'LOGIN_REQUIRED', 401);
  if (!canWriteSermon(caller.membership)) {
    return deny(
      '설교대지는 목회자로 등록된 분만 쓸 수 있습니다. 교회 관리자에게 말씀해 주세요.',
      'NOT_PREACHER',
    );
  }
  return { userId: caller.userId };
}
