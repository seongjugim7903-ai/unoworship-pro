/**
 * POST /api/auth/device/issue
 *
 * Electron 앱 최초 실행 시 "로그인 창" 에서 호출.
 * 사용자 Supabase 세션(쿠키)이 있어야 함.
 *
 * 요청:
 *   { device_name: string, device_type: 'server'|'composer', os_platform?, app_version? }
 *
 * 응답:
 *   { token: string, token_id: string, expires_at: null, subscription: SubscriptionSnapshot | null }
 *     → token 은 이 응답에서만 볼 수 있음. DB 에는 sha256 저장.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import {
  generateDeviceToken,
  hashDeviceToken,
  buildSubscriptionSnapshot,
} from '@/lib/auth/deviceToken';

export async function POST(req: NextRequest) {
  // 1. 사용자 인증 확인
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  // 2. 입력 파싱
  const body = await req.json().catch(() => ({}));
  const deviceName = String(body.device_name ?? '').slice(0, 120).trim();
  const deviceType = String(body.device_type ?? '');
  const osPlatform = body.os_platform ? String(body.os_platform).slice(0, 32) : null;
  const appVersion = body.app_version ? String(body.app_version).slice(0, 32) : null;

  if (!deviceName) {
    return NextResponse.json({ error: 'device_name required' }, { status: 400 });
  }
  if (deviceType !== 'server' && deviceType !== 'composer') {
    return NextResponse.json({ error: 'invalid device_type' }, { status: 400 });
  }

  // 3. 프로필에서 church_id 조회 + 활성 구독 조회
  const admin = createAdminClient();

  const { data: profile } = await admin
    .from('profiles')
    .select('church_id')
    .eq('id', user.id)
    .maybeSingle();

  const churchId = profile?.church_id ?? null;

  let { data: sub } = await admin
    .from('subscriptions')
    .select('plan, status, expires_at, trial_ends_at')
    .eq('user_id', user.id)
    .in('status', ['active', 'trial'])
    .order('expires_at', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  // ── 신규 유저 자동 trial (14일) ──
  //   구독이 아예 없는 사용자(방금 가입 등) 에게 trial 자동 부여.
  //   결제 연동 전까지 개발/데모 환경에서 사용. 이후 결제 후크로 대체.
  if (!sub) {
    const trialDays = 14;
    const trialEnds = new Date(Date.now() + trialDays * 86400_000).toISOString();
    const { data: inserted } = await admin
      .from('subscriptions')
      .insert({
        user_id:       user.id,
        plan:          'church_basic',
        status:        'trial',
        started_at:    new Date().toISOString(),
        expires_at:    trialEnds,
        trial_ends_at: trialEnds,
      })
      .select('plan, status, expires_at, trial_ends_at')
      .single();
    sub = inserted;
  }

  const snapshot = buildSubscriptionSnapshot(sub);

  // 4. 토큰 발급 + DB 저장 (해시만)
  const token = generateDeviceToken();
  const tokenHash = hashDeviceToken(token);

  const { data: inserted, error: insertErr } = await admin
    .from('device_tokens')
    .insert({
      user_id: user.id,
      church_id: churchId,
      token_hash: tokenHash,
      device_name: deviceName,
      device_type: deviceType,
      os_platform: osPlatform,
      app_version: appVersion,
      subscription_snapshot: snapshot,
      last_verified_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (insertErr || !inserted) {
    console.error('[device/issue] insert 실패:', insertErr);
    return NextResponse.json({ error: 'issue_failed' }, { status: 500 });
  }

  return NextResponse.json({
    token,                   // 평문 — 이 응답 뿐
    token_id: inserted.id,
    subscription: snapshot,
  });
}
