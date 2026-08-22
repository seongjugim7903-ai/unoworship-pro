// 게시판 댓글 — 목록/작성/삭제.
//   GET    ?postId=          : 그 글의 댓글 (오래된 순). mine 이 붙어 온다
//   POST   { postId, body }  : 댓글 — 교회 참여자면 누구나
//   DELETE ?id=              : 지우기 — 자기 댓글, 그리고 관리자
//
// 지우기를 자기 것으로 한정하는 이유는 단순하다. 잘못 올린 댓글을 스스로 거둘 수
// 없으면 그다음부터 아무도 안 쓴다. 남의 말을 지우는 것은 관리자만 한다 —
// 글 수정과 같은 규칙이다(app/api/board/route.ts PATCH).
//
// 글의 댓글수는 트리거가 맞춘다(supabase/migrations/202608090006_board.sql).

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { SupabaseServerConfigError, supabaseRest } from '../../../../lib/supabase/server';
import { requireMember, who } from '../../../../features/membership/guard';

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
    /* 누가 보는지에 따라 '내 댓글'이 갈린다 — 화면은 이걸 보고 삭제 버튼을 그린다 */
    const [rows, caller] = await Promise.all([
      supabaseRest<Array<Record<string, unknown>>>(`/board_comments?${params.toString()}`, { method: 'GET' }),
      who(),
    ]);
    const isAdmin = caller?.membership.churchRole === 'admin';
    const comments = rows.map((row) => ({
      ...row,
      mine: Boolean(caller) && row.author_user_id === caller?.userId,
      canDelete: (Boolean(caller) && row.author_user_id === caller?.userId) || isAdmin,
    }));
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

/**
 * 댓글 지우기 — 자기 것, 그리고 관리자.
 *
 * 지울 것을 먼저 읽어 주인을 확인한다. id 만 받고 바로 지우면 남의 교회 댓글까지
 * 지워진다 — 교회 경계는 여기서도 지킨다.
 */
export async function DELETE(request: Request) {
  const caller = await requireMember();
  if (caller instanceof NextResponse) return caller;

  try {
    const id = new URL(request.url).searchParams.get('id')?.trim();
    if (!id) return jsonError('지울 댓글이 지정되지 않았습니다.', 400, 'NO_COMMENT');

    const [row] = await supabaseRest<Array<{ author_user_id: string | null; church_id: string }>>(
      `/board_comments?select=author_user_id,church_id&id=eq.${id}&limit=1`,
      { method: 'GET' },
    );
    if (!row || row.church_id !== caller.churchId) return jsonError('댓글을 찾을 수 없습니다.', 404, 'COMMENT_NOT_FOUND');

    const isAdmin = caller.membership.churchRole === 'admin';
    if (row.author_user_id !== caller.userId && !isAdmin) {
      return jsonError('자기 댓글만 지울 수 있습니다.', 403, 'NOT_COMMENT_AUTHOR');
    }

    await supabaseRest(`/board_comments?id=eq.${id}`, { method: 'DELETE' }, { prefer: 'return=minimal' });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[board-comments] delete failed', error);
    if (error instanceof SupabaseServerConfigError) return jsonError(error.message, 503, error.code);
    const message = error instanceof Error ? error.message : '댓글을 지우지 못했습니다.';
    return jsonError(message, 500, 'COMMENT_DELETE_FAILED');
  }
}
