/**
 * POST /api/users/init-super
 *
 * 김성주를 슈퍼관리자로 설정하는 1회용 엔드포인트.
 * 이미 superadmin이 존재하면 실행 불가.
 * Service Role Key 사용.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { rejectLargeRequest } from '@/lib/auth/serverAuth';

const TARGET_NAME = '김성주';
const MAX_INIT_SUPER_REQUEST_BYTES = 1024;

export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const tooLargeResponse = rejectLargeRequest(req, MAX_INIT_SUPER_REQUEST_BYTES);
  if (tooLargeResponse) return tooLargeResponse;

  const initSecret = process.env.INIT_SUPER_SECRET;
  const requestSecret = req.headers.get('x-init-secret');
  if (!initSecret || requestSecret !== initSecret) {
    return NextResponse.json({ error: 'Forbidden: init secret required' }, { status: 403 });
  }

  const admin = createAdminClient();

  // 1. 전체 유저 목록 조회
  const { data, error } = await admin.auth.admin.listUsers();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // 2. 이미 superadmin이 있는지 확인
  const { data: profileSuperadmin } = await admin
    .from('profiles')
    .select('id')
    .eq('role', 'superadmin')
    .limit(1)
    .maybeSingle();
  if (profileSuperadmin) {
    return NextResponse.json({
      message: 'superadmin already exists',
      source: 'profiles',
    });
  }

  const existingSuperadmin = data.users.find(
    (u) => u.user_metadata?.role === 'superadmin'
  );
  if (existingSuperadmin) {
    return NextResponse.json({
      message: 'superadmin already exists',
      user: existingSuperadmin.email,
    });
  }

  // 3. 김성주 찾기 (full_name 또는 email 매칭)
  const target = data.users.find(
    (u) =>
      u.user_metadata?.full_name === TARGET_NAME ||
      u.email?.includes('kimseongju') ||
      u.email?.includes('seongju')
  );

  if (!target) {
    // 유저 못 찾으면 첫 번째 유저를 superadmin으로 설정
    const firstUser = data.users[0];
    if (!firstUser) {
      return NextResponse.json({ error: 'No users found' }, { status: 404 });
    }

    const { error: updateError } = await admin.auth.admin.updateUserById(firstUser.id, {
      user_metadata: { ...firstUser.user_metadata, role: 'superadmin' },
    });

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    await admin
      .from('profiles')
      .upsert({
        id: firstUser.id,
        full_name: firstUser.user_metadata?.full_name ?? firstUser.email?.split('@')[0] ?? null,
        role: 'superadmin',
        source: firstUser.user_metadata?.source ?? 'unolive',
      }, { onConflict: 'id' });

    return NextResponse.json({
      message: `Target '${TARGET_NAME}' not found. First user set as superadmin.`,
      user: firstUser.email,
    });
  }

  // 4. 역할 업데이트
  const { error: updateError } = await admin.auth.admin.updateUserById(target.id, {
    user_metadata: { ...target.user_metadata, role: 'superadmin' },
  });

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  await admin
    .from('profiles')
    .upsert({
      id: target.id,
      full_name: target.user_metadata?.full_name ?? target.email?.split('@')[0] ?? null,
      role: 'superadmin',
      source: target.user_metadata?.source ?? 'unolive',
    }, { onConflict: 'id' });

  return NextResponse.json({
    message: `${TARGET_NAME} set as superadmin`,
    user: target.email,
  });
}
