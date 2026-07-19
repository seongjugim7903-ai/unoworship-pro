import { NextResponse } from 'next/server';
import {
  SupabaseServerConfigError,
  supabaseRest,
} from '../../../lib/supabase/server';

export const runtime = 'nodejs';

function clampLimit(value: string | null) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 30;
  return Math.max(1, Math.min(100, Math.floor(parsed)));
}

function jsonError(message: string, status: number, code = 'CHOIR_PROGRAM_LIST_FAILED') {
  return NextResponse.json({ ok: false, code, message }, { status });
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const limit = clampLimit(url.searchParams.get('limit'));
    const rows = await supabaseRest(
      `/choir_programs?select=id,request_id,created_at,updated_at,program_id,title,status,program_payload&order=created_at.desc&limit=${limit}`,
      { method: 'GET' },
    );

    return NextResponse.json({ ok: true, programs: rows });
  } catch (error) {
    console.error('[choir-programs] list failed', error);

    if (error instanceof SupabaseServerConfigError) {
      return jsonError(error.message, 503, error.code);
    }

    const message = error instanceof Error ? error.message : '찬양대 프로그램 목록을 불러오지 못했습니다.';
    return jsonError(message, 500);
  }
}
