// 클라우드(unoworship-pro)에 저장된 준비찬양 셋 목록 중계.
//
// GET /api/imports/worship-prep?limit=60
//
// 여기서 프로그램을 조립하지 않는다. 찬양은 PPT 변환본을 로컬에서 찾아 복제하는데
// 그 목록도 브라우저 쪽 조립 경로가 다루므로, 설교대지와 같이 JSON 만 넘긴다.

import { NextRequest, NextResponse } from 'next/server';
import { listWorshipPrepSets } from '@/features/worship-prep-import/fetchWorshipPrep';

export const runtime = 'nodejs';

function clampLimit(value: string | null) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 60;
  return Math.max(1, Math.min(100, Math.floor(parsed)));
}

export async function GET(request: NextRequest) {
  try {
    const sets = await listWorshipPrepSets(clampLimit(request.nextUrl.searchParams.get('limit')));
    return NextResponse.json({ ok: true, sets });
  } catch (error) {
    const message = error instanceof Error ? error.message : '준비찬양 목록을 불러오지 못했습니다.';
    console.error('[worship-prep-import] list failed', error);
    return NextResponse.json(
      { ok: false, code: 'WORSHIP_PREP_LIST_FAILED', message },
      { status: 500 },
    );
  }
}
