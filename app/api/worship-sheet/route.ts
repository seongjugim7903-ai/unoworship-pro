import { NextResponse } from 'next/server';
import { createSignedUrl, SupabaseServerConfigError } from '../../../lib/supabase/server';

export const runtime = 'nodejs';

const BUCKET_NAME = 'worship-sheets';
// 악보 경로는 두 가지다(전부 ascii 로 정규화됨).
//   library/<team>/<title>.ext        곡에 매인 악보 — 지금 올리는 것은 전부 이쪽이다
//   worship/<team>/<date>/NN-title.ext  회차 폴더에 있던 예전 악보
const PATH_PATTERN = /^(library|worship)\/[A-Za-z0-9._/-]+$/;

export async function GET(request: Request) {
  try {
    const path = new URL(request.url).searchParams.get('path') ?? '';
    if (!PATH_PATTERN.test(path)) {
      return NextResponse.json({ ok: false, message: '잘못된 악보 경로입니다.' }, { status: 400 });
    }

    const signed = await createSignedUrl({ bucket: BUCKET_NAME, path, expiresIn: 3600 });
    return NextResponse.redirect(signed, 302);
  } catch (error) {
    console.error('[worship-sheet] signed url failed', error);
    if (error instanceof SupabaseServerConfigError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 503 });
    }
    const message = error instanceof Error ? error.message : '악보를 불러오지 못했습니다.';
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
