/**
 * app/api/users/route.ts
 * 사용자 목록 조회 + 역할 변경 API
 *
 * GET  /api/users           — 전체 사용자 목록 (superadmin만)
 * PUT  /api/users           — 역할 변경 { userId, role }
 * POST /api/users/init-super — 김성주 superadmin 초기 설정 (1회용)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { rejectLargeRequest, requireRequestRole, requireTrustedWriteRequest } from '@/lib/auth/serverAuth';
import type { UserRole } from '@/lib/auth/types';

const VALID_ROLES: UserRole[] = ['member', 'crew', 'admin', 'superadmin'];
const MAX_USER_ROLE_REQUEST_BYTES = 64 * 1024;

export async function GET(req: NextRequest) {
  const authResult = await requireRequestRole(req, 'superadmin');
  if ('response' in authResult) return authResult.response;

  // Service role 으로 전체 유저 목록 조회
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.listUsers();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const users = data.users.map((u) => ({
    id: u.id,
    email: u.email,
    full_name: u.user_metadata?.full_name || '',
    phone: u.user_metadata?.phone || '',
    role: (u.user_metadata?.role as UserRole) || 'member',
    profile_completed: !!u.user_metadata?.profile_completed,
    created_at: u.created_at,
    last_sign_in_at: u.last_sign_in_at,
  }));

  return NextResponse.json({ users });
}

export async function PUT(req: NextRequest) {
  const authResult = await requireRequestRole(req, 'superadmin');
  if ('response' in authResult) return authResult.response;
  const trustedWriteResponse = requireTrustedWriteRequest(req, authResult.auth);
  if (trustedWriteResponse) return trustedWriteResponse;
  const tooLargeResponse = rejectLargeRequest(req, MAX_USER_ROLE_REQUEST_BYTES);
  if (tooLargeResponse) return tooLargeResponse;

  const { userId, role } = await req.json();

  if (!userId || !role || !VALID_ROLES.includes(role)) {
    return NextResponse.json(
      { error: 'Invalid userId or role. Valid roles: member, crew, admin, superadmin' },
      { status: 400 }
    );
  }

  // 자기 자신의 등급 변경 방지 (superadmin 잠금)
  if (userId === authResult.auth.userId && role !== 'superadmin') {
    return NextResponse.json(
      { error: '자신의 슈퍼관리자 등급은 변경할 수 없습니다' },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { data: targetUserData, error: targetUserError } = await admin.auth.admin.getUserById(userId);
  if (targetUserError || !targetUserData.user) {
    return NextResponse.json(
      { error: targetUserError?.message ?? 'User not found' },
      { status: targetUserError ? 500 : 404 }
    );
  }

  const { data, error } = await admin.auth.admin.updateUserById(userId, {
    user_metadata: { ...(targetUserData.user.user_metadata ?? {}), role },
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { error: profileError } = await admin
    .from('profiles')
    .upsert({
      id: userId,
      full_name: data.user.user_metadata?.full_name ?? data.user.email?.split('@')[0] ?? null,
      role,
      source: data.user.user_metadata?.source ?? 'unolive',
    }, { onConflict: 'id' });

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  return NextResponse.json({
    user: {
      id: data.user.id,
      email: data.user.email,
      role,
    },
  });
}
