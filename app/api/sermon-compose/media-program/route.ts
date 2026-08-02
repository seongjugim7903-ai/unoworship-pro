// 참고자료 프로그램 목록 — 현장 Composer 가 가져갈 소스.
//
// GET ?limit=20&kind=image|youtube  (kind 생략 시 둘 다)

import { NextResponse } from 'next/server';
import { SupabaseServerConfigError } from '../../../../lib/supabase/server';
import type { MediaProgramKind } from '../../../../lib/sermon-compose/mediaProgram';
import { listMediaPrograms } from '../../../../lib/sermon-compose/mediaProgramStore';

export const runtime = 'nodejs';

function clampLimit(value: string | null) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 20;
  return Math.max(1, Math.min(50, Math.floor(parsed)));
}

function parseKind(value: string | null): MediaProgramKind | undefined {
  return value === 'image' || value === 'youtube' ? value : undefined;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const programs = await listMediaPrograms(
      clampLimit(url.searchParams.get('limit')),
      parseKind(url.searchParams.get('kind')),
    );
    return NextResponse.json({ ok: true, programs });
  } catch (error) {
    console.error('[sermon-media-program] list failed', error);

    if (error instanceof SupabaseServerConfigError) {
      return NextResponse.json({ ok: false, code: error.code, message: error.message }, { status: 503 });
    }

    const message = error instanceof Error ? error.message : '참고자료 목록을 불러오지 못했습니다.';
    return NextResponse.json(
      { ok: false, code: 'SERMON_MEDIA_PROGRAM_LIST_FAILED', message },
      { status: 500 },
    );
  }
}
