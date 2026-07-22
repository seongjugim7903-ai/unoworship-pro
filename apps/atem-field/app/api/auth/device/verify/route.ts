/**
 * POST /api/auth/device/verify
 *
 * Electron 앱이 매 기동 시 호출. X-Device-Token 헤더 또는 { token } 바디로 전달.
 * 구독 상태 최신화 → 스냅샷 갱신 → 결과 반환.
 *
 * 응답:
 *   200 { ok: true,  subscription: SubscriptionSnapshot | null, token_id, church_id }
 *   401 { ok: false, reason: 'invalid_token' | 'revoked' }
 *   403 { ok: false, reason: 'subscription_expired', subscription }
 *
 * Electron 측:
 *   200 → 로컬 캐시 갱신 후 기동
 *   401 → 토큰 삭제, 로그인 창
 *   403 → 재결제 모달
 *   네트워크 실패 → 로컬 캐시 last_verified_at 기반 오프라인 grace (30일)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import {
  hashDeviceToken,
  buildSubscriptionSnapshot,
  isSubscriptionActive,
} from '@/lib/auth/deviceToken';

export async function POST(req: NextRequest) {
  // 1. 토큰 추출
  const headerToken = req.headers.get('x-device-token');
  const body = await req.json().catch(() => ({}));
  const bodyToken = body?.token ? String(body.token) : null;
  const token = headerToken ?? bodyToken;

  if (!token) {
    return NextResponse.json({ ok: false, reason: 'invalid_token' }, { status: 401 });
  }

  // 2. DB 에서 조회
  const admin = createAdminClient();
  const tokenHash = hashDeviceToken(token);

  const { data: row } = await admin
    .from('device_tokens')
    .select('id, user_id, church_id, revoked_at')
    .eq('token_hash', tokenHash)
    .maybeSingle();

  if (!row) {
    return NextResponse.json({ ok: false, reason: 'invalid_token' }, { status: 401 });
  }
  if (row.revoked_at) {
    return NextResponse.json({ ok: false, reason: 'revoked' }, { status: 401 });
  }

  // 3. 최신 구독 조회 + 스냅샷 빌드
  const { data: sub } = await admin
    .from('subscriptions')
    .select('plan, status, expires_at, trial_ends_at')
    .eq('user_id', row.user_id)
    .in('status', ['active', 'trial'])
    .order('expires_at', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  const snapshot = buildSubscriptionSnapshot(sub);
  let active = isSubscriptionActive(snapshot);

  // admin / superadmin 은 구독 무관하게 통과 (개발자 + 운영진)
  if (!active) {
    const { data: profile } = await admin
      .from('profiles')
      .select('role')
      .eq('id', row.user_id)
      .maybeSingle();
    if (profile?.role === 'admin' || profile?.role === 'superadmin') {
      active = true;
    }
  }

  // 4. last_verified_at + snapshot 갱신
  const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
  await admin
    .from('device_tokens')
    .update({
      last_verified_at: new Date().toISOString(),
      subscription_snapshot: snapshot,
      last_verified_ip: clientIp,
    })
    .eq('id', row.id);

  // 5. 구독 만료면 403 (단, 토큰은 살아있음 — 재결제로 복구 가능)
  if (!active) {
    return NextResponse.json(
      { ok: false, reason: 'subscription_expired', subscription: snapshot },
      { status: 403 }
    );
  }

  return NextResponse.json({
    ok: true,
    subscription: snapshot,
    token_id: row.id,
    church_id: row.church_id,
  });
}
