// 전 팀 공유 게시판 — 글 목록/작성/수정.
//   GET  ?category= &limit=   : 볼 수 있는 글 목록 (고정글 먼저, 최신순)
//   POST { category, title, body }   : 글 작성 — 팀장급 이상
//   PATCH { id, category?, title?, body? } : 수정 — 작성자 또는 관리자
//
// 카테고리 = 고정(공지사항·일반·새신자·긴급·준비항목) + 팀 이름(worship_teams).
// 팀 이름 카테고리에 올린 글은 그 팀 소속(과 관리자)만 본다. 나머지는 전원 공개.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { SupabaseServerConfigError, supabaseRest } from '../../../lib/supabase/server';
import { getActiveChurchId } from '../../../lib/churchScope';
import { requireBoardWriter, who, type Who } from '../../../features/membership/guard';

export const runtime = 'nodejs';

const FIXED_CATEGORIES = ['공지사항', '일반', '새신자', '긴급', '준비항목'];

const PostSchema = z.object({
  category: z.string().trim().min(1).default('일반'),
  title: z.string().trim().min(1, '제목을 입력해 주세요.').max(200),
  body: z.string().trim().max(20000).optional().default(''),
});

const EditSchema = z.object({
  id: z.string().uuid('글을 찾을 수 없습니다.'),
  category: z.string().trim().min(1).optional(),
  title: z.string().trim().min(1).max(200).optional(),
  body: z.string().trim().max(20000).optional(),
});

interface PostRow { id: string }

function jsonError(message: string, status: number, code = 'BOARD_FAILED') {
  return NextResponse.json({ ok: false, code, message }, { status });
}

function clampLimit(value: string | null) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 50;
  return Math.max(1, Math.min(100, Math.floor(parsed)));
}

function callerCanPost(caller: Who | null): boolean {
  if (!caller) return false;
  return caller.membership.churchRole === 'admin'
    || Object.values(caller.membership.teams).some((role) => role === 'leader');
}

async function teamNames(churchId: string): Promise<string[]> {
  const rows = await supabaseRest<Array<{ name: string }>>(
    `/worship_teams?select=name&church_id=eq.${churchId}&archived_at=is.null&order=sort_order.asc`,
    { method: 'GET' },
  ).catch(() => []);
  return rows.map((row) => row.name);
}

/** 요청자가 보고/쓸 수 있는 카테고리 목록 — 고정 + (관리자면 전 팀 / 아니면 내 팀) */
function visibleCategories(caller: Who | null, allTeams: string[]): string[] {
  const isAdmin = caller?.membership.churchRole === 'admin';
  const myTeams = caller ? Object.keys(caller.membership.teams) : [];
  const teams = isAdmin ? allTeams : allTeams.filter((t) => myTeams.includes(t));
  return [...FIXED_CATEGORIES, ...teams];
}

async function authorName(userId: string): Promise<string> {
  const rows = await supabaseRest<Array<{ full_name: string | null }>>(
    `/profiles?select=full_name&id=eq.${userId}&limit=1`,
    { method: 'GET' },
  ).catch(() => []);
  return rows[0]?.full_name ?? '';
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const limit = clampLimit(url.searchParams.get('limit'));
    const selected = url.searchParams.get('category')?.trim() ?? '';

    const churchId = await getActiveChurchId();
    /* 요청자 조회와 팀 목록은 서로 기다릴 필요가 없다 — 함께 던진다 */
    const [caller, allTeams] = await Promise.all([who(), teamNames(churchId)]);
    const isAdmin = caller?.membership.churchRole === 'admin';
    const categories = visibleCategories(caller, allTeams);

    const params = new URLSearchParams({
      select: 'id,created_at,updated_at,author_user_id,author_name,category,title,body,pinned,comment_count',
      order: 'pinned.desc,created_at.desc',
      limit: String(limit),
      church_id: `eq.${churchId}`,
    });

    if (selected) {
      if (!categories.includes(selected)) {
        return NextResponse.json({ ok: true, posts: [], canPost: callerCanPost(caller), isAdmin, categories });
      }
      /* URLSearchParams 가 한 번 인코딩한다 — 여기서 또 encode 하면 이중 인코딩으로 안 걸린다 */
      params.set('category', `eq.${selected}`);
    } else {
      const list = categories.map((c) => `"${c.replace(/["(),]/g, '')}"`).join(',');
      params.set('category', `in.(${list})`);
    }

    const rows = await supabaseRest<Array<Record<string, unknown>>>(`/board_posts?${params.toString()}`, { method: 'GET' });
    const posts = rows.map((row) => ({ ...row, mine: Boolean(caller) && row.author_user_id === caller?.userId }));
    return NextResponse.json({ ok: true, posts, canPost: callerCanPost(caller), isAdmin, categories });
  } catch (error) {
    console.error('[board] list failed', error);
    if (error instanceof SupabaseServerConfigError) return jsonError(error.message, 503, error.code);
    const message = error instanceof Error ? error.message : '게시글을 불러오지 못했습니다.';
    return jsonError(message, 500, 'BOARD_LIST_FAILED');
  }
}

export async function POST(request: Request) {
  const caller = await requireBoardWriter();
  if (caller instanceof NextResponse) return caller;

  try {
    const payload = PostSchema.parse(await request.json());
    const allTeams = await teamNames(caller.churchId);
    const valid = new Set([...FIXED_CATEGORIES, ...allTeams]);
    if (!valid.has(payload.category)) return jsonError('알 수 없는 분류입니다.', 400, 'BAD_CATEGORY');

    const isAdmin = caller.membership.churchRole === 'admin';
    if (allTeams.includes(payload.category) && !isAdmin && caller.membership.teams[payload.category] === undefined) {
      return jsonError('그 팀 게시판에는 그 팀 담당자만 올릴 수 있습니다.', 403, 'NOT_TEAM_MEMBER');
    }

    const [post] = await supabaseRest<PostRow[]>(
      '/board_posts',
      {
        method: 'POST',
        body: JSON.stringify({
          church_id: caller.churchId,
          author_user_id: caller.userId,
          author_name: await authorName(caller.userId),
          category: payload.category,
          title: payload.title,
          body: payload.body,
        }),
      },
      { prefer: 'return=representation' },
    );
    return NextResponse.json({ ok: true, postId: post?.id ?? '' });
  } catch (error) {
    console.error('[board] create failed', error);
    if (error instanceof SupabaseServerConfigError) return jsonError(error.message, 503, error.code);
    if (error instanceof z.ZodError) return jsonError(error.issues[0]?.message ?? '입력값을 확인해 주세요.', 400, 'INVALID_POST');
    const message = error instanceof Error ? error.message : '글을 저장하지 못했습니다.';
    return jsonError(message, 500);
  }
}

export async function PATCH(request: Request) {
  const caller = await who();
  if (!caller) return jsonError('로그인이 필요합니다.', 401, 'LOGIN_REQUIRED');

  try {
    const payload = EditSchema.parse(await request.json());
    const [post] = await supabaseRest<Array<{ author_user_id: string | null }>>(
      `/board_posts?id=eq.${payload.id}&church_id=eq.${caller.churchId}&select=author_user_id&limit=1`,
      { method: 'GET' },
    );
    if (!post) return jsonError('글을 찾을 수 없습니다.', 404, 'NOT_FOUND');

    const isAdmin = caller.membership.churchRole === 'admin';
    if (!isAdmin && post.author_user_id !== caller.userId) {
      return jsonError('작성자만 수정할 수 있습니다.', 403, 'NOT_AUTHOR');
    }

    const update: Record<string, unknown> = {};
    if (payload.title !== undefined) update.title = payload.title;
    if (payload.body !== undefined) update.body = payload.body;
    if (payload.category !== undefined) {
      const allTeams = await teamNames(caller.churchId);
      const valid = new Set([...FIXED_CATEGORIES, ...allTeams]);
      if (!valid.has(payload.category)) return jsonError('알 수 없는 분류입니다.', 400, 'BAD_CATEGORY');
      if (allTeams.includes(payload.category) && !isAdmin && caller.membership.teams[payload.category] === undefined) {
        return jsonError('그 팀 게시판으로는 옮길 수 없습니다.', 403, 'NOT_TEAM_MEMBER');
      }
      update.category = payload.category;
    }
    if (Object.keys(update).length === 0) return jsonError('바꿀 내용이 없습니다.', 400, 'EMPTY');

    await supabaseRest(
      `/board_posts?id=eq.${payload.id}&church_id=eq.${caller.churchId}`,
      { method: 'PATCH', body: JSON.stringify(update) },
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[board] edit failed', error);
    if (error instanceof SupabaseServerConfigError) return jsonError(error.message, 503, error.code);
    if (error instanceof z.ZodError) return jsonError(error.issues[0]?.message ?? '입력값을 확인해 주세요.', 400, 'INVALID_EDIT');
    const message = error instanceof Error ? error.message : '글을 수정하지 못했습니다.';
    return jsonError(message, 500);
  }
}
