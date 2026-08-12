// 게시판 댓글 — 목록/작성.
//   GET  ?postId=   : 그 글의 댓글 (오래된 순)
//   POST { postId, body }  : 댓글 — 교회 참여자면 누구나

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { SupabaseServerConfigError, supabaseRest } from '../../../../lib/supabase/server';
import { requireMember } from '../../../../features/membership/guard';

export const runtime = 'nodejs';

const CommentSchema = z.object({
  postId: z.string().uuid('글을 찾을 수 없습니다.'),
  body: z.string().trim().min(1, '댓글 내용을 입력해 주세요.').max(4000),
});

interface CommentRow { id: string }

function jsonError(message: string, status: number, code = 'COMMENT_FAILED') {
  return NextResponse.json({ ok: false, code, message }, { status });
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
    const postId = new URL(request.url).searchParams.get('postId')?.trim();
    if (!postId) return jsonError('글이 지정되지 않았습니다.', 400, 'NO_POST');

    const params = new URLSearchParams({
      select: 'id,created_at,author_user_id,author_name,body',
      order: 'created_at.asc',
      limit: '500',
      post_id: `eq.${postId}`,
    });
    const comments = await supabaseRest(`/board_comments?${params.toString()}`, { method: 'GET' });
    return NextResponse.json({ ok: true, comments });
  } catch (error) {
    console.error('[board-comments] list failed', error);
    if (error instanceof SupabaseServerConfigError) return jsonError(error.message, 503, error.code);
    const message = error instanceof Error ? error.message : '댓글을 불러오지 못했습니다.';
    return jsonError(message, 500, 'COMMENT_LIST_FAILED');
  }
}

export async function POST(request: Request) {
  const caller = await requireMember();
  if (caller instanceof NextResponse) return caller;

  try {
    const payload = CommentSchema.parse(await request.json());
    const [comment] = await supabaseRest<CommentRow[]>(
      '/board_comments',
      {
        method: 'POST',
        body: JSON.stringify({
          church_id: caller.churchId,
          post_id: payload.postId,
          author_user_id: caller.userId,
          author_name: await authorName(caller.userId),
          body: payload.body,
        }),
      },
      { prefer: 'return=representation' },
    );
    return NextResponse.json({ ok: true, commentId: comment?.id ?? '' });
  } catch (error) {
    console.error('[board-comments] create failed', error);
    if (error instanceof SupabaseServerConfigError) return jsonError(error.message, 503, error.code);
    if (error instanceof z.ZodError) return jsonError(error.issues[0]?.message ?? '입력값을 확인해 주세요.', 400, 'INVALID_COMMENT');
    const message = error instanceof Error ? error.message : '댓글을 저장하지 못했습니다.';
    return jsonError(message, 500);
  }
}
