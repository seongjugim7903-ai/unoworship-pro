import { NextRequest, NextResponse } from 'next/server';
import {
  importChoirProgramFromSupabase,
  listChoirProgramCandidates,
} from '@/features/choir-supabase-import/importChoirProgram';

export const runtime = 'nodejs';

function jsonError(message: string, status: number, code = 'CHOIR_SUPABASE_IMPORT_FAILED') {
  return NextResponse.json({ ok: false, code, message }, { status });
}

function clampLimit(value: string | null) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 30;
  return Math.max(1, Math.min(100, Math.floor(parsed)));
}

export async function GET(request: NextRequest) {
  try {
    const limit = clampLimit(request.nextUrl.searchParams.get('limit'));
    const programs = await listChoirProgramCandidates(limit);
    return NextResponse.json({ ok: true, programs });
  } catch (error) {
    const message = error instanceof Error ? error.message : '찬양대 요청 목록을 불러오지 못했습니다.';
    return jsonError(message, 500, 'CHOIR_SUPABASE_LIST_FAILED');
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({})) as {
      requestId?: string;
      programId?: string;
      latest?: boolean;
    };

    const result = await importChoirProgramFromSupabase({
      requestId: body.requestId?.trim() || undefined,
      programId: body.programId?.trim() || undefined,
      latest: body.latest !== false,
    });

    return NextResponse.json({
      ok: true,
      program: result.program,
      filePath: result.filePath,
      imageCount: result.imageCount,
      skippedImages: result.skippedImages,
      sourceRequestId: result.sourceRequestId,
      sourceProgramId: result.sourceProgramId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '찬양대 프로그램을 가져오지 못했습니다.';
    return jsonError(message, 500);
  }
}
