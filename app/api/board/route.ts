// 전 팀 공유 게시판 — 글 목록/작성.
//   GET  ?category= &limit=   : 교회의 글 목록 (고정글 먼저, 최신순)
//   POST { category, title, body }  : 글 작성 — 팀장급 이상만

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { SupabaseServerConfigError, supabaseRest } from '../../../lib/supabase/server';
import { getActiveChurchId } from '../../../lib/churchScope';
import { requireBoardWriter, who } from '../../../features/membership/guard';

export const runtime = 'nodejs';

const CATEGORIES = ['일반', '새신자', '긴급', '준비항목'] as const;

const PostSchema = z.object({
  category: z.enum(CATEGORIES).default('일반'),
  title: z.string().trim().min(1, '제목을 입력해 주세요.').max(200),
  body: z.string().trim().max(20000).optional().default(''),
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
    const category = url.searchParams.get('category')?.trim();
    const params = new URLSearchParams({
      select: 'id,created_at,author_user_id,author_name,category,title,body,pinned,comment_count',
      order: 'pinned.desc,created_at.desc',
      limit: String(limit),
      church_id: `eq.${await getActiveChurchId()}`,
    });
    if (category && (CATEGORIES as readonly string[]).includes(category)) {
      params.set('category', `eq.${encodeURIComponent(category)}`);
    }

    const posts = await supabaseRest(`/board_posts?${params.toString()}`, { method: 'GET' });
    /* 지금 요청자가 글을 쓸 수 있는 사람인지 화면이 알아야 작성 폼을 보인다 */
    const caller = await who();
    const canPost = caller
      ? caller.membership.churchRole === 'admin' || Object.values(caller.membership.teams).some((r) => r === 'leader')
      : false;
    return NextResponse.json({ ok: true, posts, canPost });
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
