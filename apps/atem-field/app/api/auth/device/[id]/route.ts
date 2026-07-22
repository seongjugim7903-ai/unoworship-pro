/**
 * DELETE /api/auth/device/:id
 *
 * 기기 해제 — 토큰 즉시 무효화 (soft delete, revoked_at 세팅).
 * 해당 기기는 다음 verify 호출에서 401 을 받고 로그인 창으로 돌아감.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  // RLS 덕분에 본인 소유가 아니면 행이 업데이트되지 않음
  const { data, error } = await supabase
    .from('device_tokens')
    .update({
      revoked_at: new Date().toISOString(),
      revoked_reason: 'user',
    })
    .eq('id', id)
    .is('revoked_at', null)
    .select('id')
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: 'not_found_or_forbidden' }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
