// 설교대지 원문 + 찬송가 + 찬양(PPT) 을 한 번에 저장하는 신규 라우트.
// 기존 /api/sermon-outlines 는 건드리지 않고 같은 sermon_outlines 테이블에 쓴다.
//
// POST application/json
//   { serviceType, serviceDate, content, hymns: [{ number, caption }], praises: [{ songName, caption }] }
//
// 찬송가 가사와 찬양 슬라이드는 이 앱에 원본이 없다. 무엇을 쓸지만 적어 두고
// 현장 UnoLive 가 /api/hymn 과 PPT 변환본에서 찾아 채운다.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { SupabaseServerConfigError, supabaseRest } from '../../../../lib/supabase/server';
import { getActiveChurchId } from '../../../../lib/churchScope';
import {
  MAX_ITEMS_PER_PROGRAM,
  type SubHymnItem,
  type SubPraiseItem,
} from '../../../../lib/sermon-compose/subProgram';
import { insertSubProgram, type SavedSubProgram } from '../../../../lib/sermon-compose/subProgramStore';
import { parseSermonOutline } from '../../../../lib/sermon-compose/parseSermonOutline';
import { PARSER_VERSION } from '../../../../lib/sermon-compose/types';

export const runtime = 'nodejs';

const BodySchema = z.object({
  serviceType: z.string().trim().min(1).default('주일낮예배'),
  serviceDate: z.string().trim().optional().default(''),
  content: z.string().trim().min(1, '설교대지 내용을 입력해 주세요.'),
  hymnTitle: z.string().trim().optional().default(''),
  praiseTitle: z.string().trim().optional().default(''),
  hymns: z
    .array(z.object({ number: z.number().int().min(1).max(645), caption: z.string().trim().optional().default('') }))
    .max(MAX_ITEMS_PER_PROGRAM)
    .optional()
    .default([]),
  praises: z
    .array(z.object({ songName: z.string().trim().min(1), caption: z.string().trim().optional().default('') }))
    .max(MAX_ITEMS_PER_PROGRAM)
    .optional()
    .default([]),
});

interface OutlineRow {
  id: string;
}

function jsonError(message: string, status: number, code = 'SERMON_OUTLINE_SAVE_FAILED') {
  return NextResponse.json({ ok: false, code, message }, { status });
}

export async function POST(request: Request) {
  try {
    const body = BodySchema.parse(await request.json());
    const churchId = await getActiveChurchId();
    const origin = request.headers.get('origin');

    /* 원문은 그대로 두고 파싱 결과를 metadata 에 함께 적는다.
       파싱 규칙이 바뀌면 원문에서 다시 뽑을 수 있어야 하기 때문이다. */
    const parsed = parseSermonOutline(body.content);

    const [outline] = await supabaseRest<OutlineRow[]>(
      '/sermon_outlines',
      {
        method: 'POST',
        body: JSON.stringify({
          church_id: churchId,
          service_date: body.serviceDate || null,
          service_type: body.serviceType,
          content: body.content,
          /* 기존 화면이 읽는 hymn 컬럼도 사람이 보게 채워 둔다. */
          hymn: [
            ...body.hymns.map((item) => `${item.number}장`),
            ...body.praises.map((item) => item.songName),
          ].join('\n'),
          source: 'unoworship-pro',
          status: 'saved',
          metadata: {
            savedBy: 'sermon-compose',
            appUrl: origin,
            parserVersion: PARSER_VERSION,
            parsed,
          },
        }),
      },
      { prefer: 'return=representation' },
    );

    /* 찬송가·찬양은 각각 자기 프로그램이 된다. 비어 있으면 만들지 않는다. */
    const subPrograms: SavedSubProgram[] = [];

    if (body.hymns.length > 0) {
      const items: SubHymnItem[] = body.hymns.map((item) => ({
        number: item.number,
        caption: item.caption,
      }));
      subPrograms.push(
        await insertSubProgram({
          id: randomUUID(),
          kind: 'hymn',
          churchId,
          serviceType: body.serviceType,
          serviceDate: body.serviceDate,
          title: body.hymnTitle,
          items,
          originHeader: origin,
        }),
      );
    }

    if (body.praises.length > 0) {
      const items: SubPraiseItem[] = body.praises.map((item) => ({
        songName: item.songName,
        caption: item.caption,
      }));
      subPrograms.push(
        await insertSubProgram({
          id: randomUUID(),
          kind: 'praise',
          churchId,
          serviceType: body.serviceType,
          serviceDate: body.serviceDate,
          title: body.praiseTitle,
          items,
          originHeader: origin,
        }),
      );
    }

    return NextResponse.json({
      ok: true,
      outlineId: outline?.id ?? '',
      pointCount: parsed.points.length,
      quoteCount: parsed.points.reduce((sum, point) => sum + point.quotes.length, 0),
      subPrograms,
    });
  } catch (error) {
    console.error('[sermon-compose-outline] save failed', error);

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
