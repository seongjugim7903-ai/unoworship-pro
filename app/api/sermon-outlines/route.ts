import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  SupabaseServerConfigError,
  supabaseRest,
} from '../../../lib/supabase/server';

export const runtime = 'nodejs';

const SermonOutlineSchema = z.object({
  serviceType: z.string().trim().min(1).default('주일낮예배'),
  serviceDate: z.string().trim().optional().default(''),
  content: z.string().trim().min(1, '설교대지 내용을 입력해 주세요.'),
  hymn: z.string().trim().optional().default(''),
  source: z.string().trim().optional().default('unoworship-pro'),
  /* 기존 대지 수정 시 대상 id */
  id: z.string().uuid().optional(),
});

interface SermonOutlineRow {
  id: string;
}

function jsonError(message: string, status: number, code = 'SERMON_OUTLINE_SAVE_FAILED') {
  return NextResponse.json({ ok: false, code, message }, { status });
}

function clampLimit(value: string | null) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 20;
  return Math.max(1, Math.min(50, Math.floor(parsed)));
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const limit = clampLimit(url.searchParams.get('limit'));
    const params = new URLSearchParams({
      select: 'id,created_at,updated_at,service_date,service_type,content,hymn,status',
      order: 'service_date.desc.nullslast,created_at.desc',
      limit: String(limit),
    });

    const rows = await supabaseRest(
      `/sermon_outlines?${params.toString()}`,
      { method: 'GET' },
    );

    return NextResponse.json({ ok: true, outlines: rows });
  } catch (error) {
    console.error('[sermon-outlines] list failed', error);

    if (error instanceof SupabaseServerConfigError) {
      return jsonError(error.message, 503, error.code);
    }

    const message = error instanceof Error ? error.message : '설교대지 목록을 불러오지 못했습니다.';
    return jsonError(message, 500, 'SERMON_OUTLINE_LIST_FAILED');
  }
}

export async function POST(request: Request) {
  try {
    const payload = SermonOutlineSchema.parse(await request.json());

    const fields = {
      service_date: payload.serviceDate || null,
      service_type: payload.serviceType,
      content: payload.content,
      hymn: payload.hymn,
      source: payload.source,
      status: 'saved',
      metadata: {
        appUrl: request.headers.get('origin') ?? null,
        savedBy: 'sermon-outline-page',
      },
    };

    let outlineRow: SermonOutlineRow | undefined;
    let updatedExisting = false;
    if (payload.id) {
      const updatedRows = await supabaseRest<SermonOutlineRow[]>(
        `/sermon_outlines?id=eq.${payload.id}`,
        { method: 'PATCH', body: JSON.stringify(fields) },
        { prefer: 'return=representation' },
      );
      outlineRow = updatedRows[0];
      updatedExisting = Boolean(outlineRow);
    }
    if (!outlineRow) {
      [outlineRow] = await supabaseRest<SermonOutlineRow[]>(
        '/sermon_outlines',
        { method: 'POST', body: JSON.stringify(fields) },
        { prefer: 'return=representation' },
      );
    }

    return NextResponse.json({
      ok: true,
      outlineId: outlineRow.id,
      updatedExisting,
    });
  } catch (error) {
    console.error('[sermon-outlines] save failed', error);

    if (error instanceof SupabaseServerConfigError) {
      return jsonError(error.message, 503, error.code);
    }

    if (error instanceof z.ZodError) {
      return jsonError(error.issues[0]?.message ?? '입력값을 확인해 주세요.', 400, 'INVALID_SERMON_OUTLINE');
    }

    const message = error instanceof Error ? error.message : '설교대지 저장 중 오류가 발생했습니다.';
    return jsonError(message, 500);
  }
}
