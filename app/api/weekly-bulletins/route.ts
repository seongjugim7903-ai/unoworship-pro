import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  SupabaseServerConfigError,
  supabaseRest,
} from '../../../lib/supabase/server';
import { getActiveChurchId } from '../../../lib/churchScope';
import { toWeekStart } from '../../../lib/weekStart';

export const runtime = 'nodejs';

const BulletinSchema = z.object({
  /* 주보가 속한 날짜 — 서버가 그 주 일요일로 정규화한다. */
  date: z.string().trim().min(1, '주보 주간을 정할 날짜가 필요합니다.'),
  content: z.string().trim().min(1, '주보 내용을 입력해 주세요.'),
  source: z.string().trim().optional().default('unoworship-pro'),
});

interface BulletinRow {
  id: string;
  week_start: string;
}

function jsonError(message: string, status: number, code = 'BULLETIN_SAVE_FAILED') {
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
      select: 'id,created_at,updated_at,week_start,content',
      order: 'week_start.desc',
      limit: String(limit),
    });

    params.set('church_id', `eq.${await getActiveChurchId()}`);

    const rows = await supabaseRest(
      `/weekly_bulletins?${params.toString()}`,
      { method: 'GET' },
    );

    return NextResponse.json({ ok: true, bulletins: rows });
  } catch (error) {
    console.error('[weekly-bulletins] list failed', error);

    if (error instanceof SupabaseServerConfigError) {
      return jsonError(error.message, 503, error.code);
    }

    const message = error instanceof Error ? error.message : '주보 목록을 불러오지 못했습니다.';
    return jsonError(message, 500, 'BULLETIN_LIST_FAILED');
  }
}

export async function POST(request: Request) {
  try {
    const payload = BulletinSchema.parse(await request.json());
    const weekStart = toWeekStart(payload.date);
    const churchId = await getActiveChurchId();

    /* (church_id, week_start) unique — 같은 교회·같은 주 재저장은 merge-duplicates로 덮어쓴다. */
    const [row] = await supabaseRest<BulletinRow[]>(
      '/weekly_bulletins?on_conflict=church_id,week_start',
      {
        method: 'POST',
        body: JSON.stringify({
          church_id: churchId,
          week_start: weekStart,
          content: payload.content,
          source: payload.source,
          metadata: {
            appUrl: request.headers.get('origin') ?? null,
            savedBy: 'sermon-outline-page',
          },
        }),
      },
      { prefer: 'resolution=merge-duplicates,return=representation' },
    );

    return NextResponse.json({ ok: true, bulletinId: row.id, weekStart });
  } catch (error) {
    console.error('[weekly-bulletins] save failed', error);

    if (error instanceof SupabaseServerConfigError) {
      return jsonError(error.message, 503, error.code);
    }

    if (error instanceof z.ZodError) {
      return jsonError(error.issues[0]?.message ?? '입력값을 확인해 주세요.', 400, 'INVALID_BULLETIN');
    }

    const message = error instanceof Error ? error.message : '주보 저장 중 오류가 발생했습니다.';
    return jsonError(message, 500);
  }
}
