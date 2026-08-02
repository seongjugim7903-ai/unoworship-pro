// 주보에서 뽑은 예배 순서 저장 — 예배별 구조를 그대로 보존한다.
// 기존 /api/weekly-bulletins 는 content 통짜 텍스트만 받아서(수정 금지 대상) 새로 만든다.
// 같은 weekly_bulletins 테이블에 쓰되 metadata.orders 에 예배별 원문을 함께 넣는다.
//
// POST application/json — { date, orders: { sundayMorning, sundayAfternoon, wednesday } }

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { SupabaseServerConfigError, supabaseRest } from '../../../../lib/supabase/server';
import { getActiveChurchId } from '../../../../lib/churchScope';
import { toWeekStart } from '../../../../lib/weekStart';
import {
  hasAnyBulletinOrder,
  toBulletinText,
  type BulletinOrders,
} from '../../../../lib/sermon-compose/bulletinSections';

export const runtime = 'nodejs';

const OrdersSchema = z.object({
  sundayMorning: z.string().default(''),
  sundayAfternoon: z.string().default(''),
  wednesday: z.string().default(''),
});

const BodySchema = z.object({
  /* 주보가 속한 날짜 — 서버가 그 주 일요일로 정규화한다. */
  date: z.string().trim().min(1, '주보 주간을 정할 날짜가 필요합니다.'),
  orders: OrdersSchema,
});

interface BulletinRow {
  id: string;
  week_start: string;
}

function jsonError(message: string, status: number, code = 'BULLETIN_SAVE_FAILED') {
  return NextResponse.json({ ok: false, code, message }, { status });
}

export async function POST(request: Request) {
  try {
    const body = BodySchema.parse(await request.json());
    const orders = body.orders as BulletinOrders;

    if (!hasAnyBulletinOrder(orders)) {
      return jsonError('저장할 예배 순서가 없습니다.', 400, 'EMPTY_BULLETIN');
    }

    const weekStart = toWeekStart(body.date);

    /* (church_id, week_start) unique — 같은 교회·같은 주 재저장은 merge-duplicates 로 덮어쓴다. */
    const [row] = await supabaseRest<BulletinRow[]>(
      '/weekly_bulletins?on_conflict=church_id,week_start',
      {
        method: 'POST',
        body: JSON.stringify({
          church_id: await getActiveChurchId(),
          week_start: weekStart,
          content: toBulletinText(orders),
          source: 'unoworship-pro',
          metadata: {
            appUrl: request.headers.get('origin') ?? null,
            savedBy: 'sermon-compose',
            orders,
          },
        }),
      },
      { prefer: 'resolution=merge-duplicates,return=representation' },
    );

    return NextResponse.json({ ok: true, bulletinId: row.id, weekStart });
  } catch (error) {
    console.error('[sermon-compose-bulletin] save failed', error);

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
