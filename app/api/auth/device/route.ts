/**
 * GET /api/auth/device
 *
 * 로그인된 사용자의 연결된 기기 목록. "연결된 기기" 관리 화면에서 사용.
 * (apps/atem-field 내부 서버에서 클라우드로 이식 — 2026-07-23)
 */

import { NextResponse } from 'next/server';
import {
  createSessionClient,
  isAuthConfigured,
  authNotConfiguredResponse,
} from '../../../../lib/authn/supabaseAuth';

export async function GET() {
  if (!isAuthConfigured()) {
    return NextResponse.json(authNotConfiguredResponse(), { status: 503 });
  }

  const supabase = await createSessionClient();
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
