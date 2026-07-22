/**
 * app/api/church/route.ts
 *
 * GET  /api/church  — 교회 정보 조회 (첫 번째 레코드, 없으면 빈 객체)
 * PUT  /api/church  — 교회 정보 저장/수정 (admin 이상)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

function isFieldNoLoginEnabled() {
  return process.env.NODE_ENV !== 'production' && process.env.UNOLIVE_SOCKET_DEV_BYPASS === '1';
}

function getFieldChurch() {
  return {
    id: 'field-ulju',
    name: '울주교회',
    senior_pastor: '',
    denomination: '',
    region: 'Ulju',
  };
}

export async function GET() {
  if (isFieldNoLoginEnabled()) {
    return NextResponse.json({ church: getFieldChurch() });
  }

  const supabase = await createClient();

  // 인증 확인
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('churches')
    .select('*')
    .limit(1)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ church: data });
}

export async function PUT(req: NextRequest) {
  if (isFieldNoLoginEnabled()) {
    const body = await req.json();
    return NextResponse.json({ church: { ...getFieldChurch(), ...body } });
  }

  const supabase = await createClient();

  // 인증 + 권한 확인
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }

  const role = user.user_metadata?.role as string;
  if (role !== 'admin' && role !== 'superadmin') {
    return NextResponse.json({ error: 'Forbidden: admin 이상만 수정 가능' }, { status: 403 });
  }

  const body = await req.json();
  const { name, senior_pastor, denomination, region } = body;

  // 기존 레코드 확인
  const { data: existing } = await supabase
    .from('churches')
    .select('id')
    .limit(1)
    .maybeSingle();

  let result;

  if (existing) {
    // UPDATE
    const { data, error } = await supabase
      .from('churches')
      .update({ name, senior_pastor, denomination, region })
      .eq('id', existing.id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    result = data;
  } else {
    // INSERT (최초)
    const { data, error } = await supabase
      .from('churches')
      .insert({ name, senior_pastor, denomination, region })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    result = data;
  }

  return NextResponse.json({ church: result });
}
