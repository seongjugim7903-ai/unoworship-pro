/**
 * GET /api/auth/device
 *
 * 로그인된 사용자의 연결된 기기 목록. 대시보드 "설정 > 연결된 기기" 에서 사용.
 * revoke 된 토큰도 30일간은 목록에 노출 (감사 용).
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  // RLS 덕분에 본인 소속 토큰만 자동 필터링됨
  const { data, error } = await supabase
    .from('device_tokens')
    .select('id, device_name, device_type, os_platform, app_version, last_verified_at, revoked_at, revoked_reason, created_at, subscription_snapshot')
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ devices: data ?? [] });
}
