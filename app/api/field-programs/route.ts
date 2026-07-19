import { NextResponse } from 'next/server';
import { writeFieldProgram } from '../../../lib/field-program-export/programWriter';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  if (process.env.VERCEL === '1') {
    return NextResponse.json(
      {
        ok: false,
        code: 'LOCAL_FIELD_PROGRAMS_ONLY',
        message: 'Vercel 배포 페이지에서는 맥미니 로컬 data/programs 폴더에 직접 저장할 수 없습니다. 현장 맥에서 로컬 서버로 실행해 주세요.',
      },
      { status: 409 },
    );
  }

  try {
    const payload = await request.json();
    const result = await writeFieldProgram(payload);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : '현장 프로그램 파일 저장에 실패했습니다.';
    console.error('[field-programs] save failed', error);
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
