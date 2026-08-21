// 클라우드(unoworship-pro)에 저장된 설교대지 목록 중계.
//
// GET /api/imports/sermon-compose?limit=20
//
// 여기서 프로그램을 조립하지 않는다. 본문 넘침 분할이 canvas 측정에 기대므로
// 조립은 컴포저 브라우저에서 buildSermonPrograms 로 한다.

import { NextRequest, NextResponse } from 'next/server';
import { listSermonComposeCandidates } from '@/features/sermon-compose-import/fetchSermonCompose';

export const runtime = 'nodejs';

function clampLimit(value: string | null) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 20;
  return Math.max(1, Math.min(50, Math.floor(parsed)));
}

export async function GET(request: NextRequest) {
  try {
    const candidates = await listSermonComposeCandidates(
      clampLimit(request.nextUrl.searchParams.get('limit')),
    );
    return NextResponse.json({ ok: true, candidates });
  } catch (error) {
    const message = error instanceof Error ? error.message : '설교대지 목록을 불러오지 못했습니다.';
    console.error('[sermon-compose-import] list failed', error);
    return NextResponse.json(
      { ok: false, code: 'SERMON_COMPOSE_LIST_FAILED', message },
      { status: 500 },
    );
  }
}
