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
import { getActiveChurchId, getActiveChurchName } from '../../../../lib/churchScope';
import {
  MAX_ITEMS_PER_PROGRAM,
  type SubHymnItem,
  type SubNewsItem,
  type SubPraiseItem,
} from '../../../../lib/sermon-compose/subProgram';
import { splitNewsBlocks } from '../../../../lib/sermon-compose/churchNews';
import { replaceSubProgram, type SavedSubProgram } from '../../../../lib/sermon-compose/subProgramStore';
import { parseSermonOutline } from '../../../../lib/sermon-compose/parseSermonOutline';
import { PARSER_VERSION } from '../../../../lib/sermon-compose/types';
import { requireLogin } from '../../../../features/membership/requireLogin';

export const runtime = 'nodejs';

const BodySchema = z.object({
  serviceType: z.string().trim().min(1).default('주일낮예배'),
  serviceDate: z.string().trim().optional().default(''),
  /* 주보만 올리고 협조문은 나중에 붙이는 경우가 있어 내용은 비어 있어도 받는다. */
  content: z.string().trim().optional().default(''),
  /* 주보 또는 협조문에서 채워진 값 — 사람이 고쳤을 수 있으니 그대로 받는다. */
  sermonTitle: z.string().trim().optional().default(''),
  scriptureRef: z.string().trim().optional().default(''),
  preacher: z.string().trim().optional().default(''),
  /* 주보에서 뽑은 해당 예배 순서표 원문 — 나중에 되짚을 수 있게 남긴다. */
  serviceOrder: z.string().optional().default(''),
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
  /* 주보 좌측 상단에서 읽은 교회소식. 빈 줄로 나눈 한 건이 한 섹션이 된다.
     교회소식 탭과 같은 규칙으로 서버에서 다시 나눈다 — 클라이언트가 나눈 결과를 믿지 않는다. */
  newsTitle: z.string().trim().optional().default(''),
  news: z.string().optional().default(''),
});

interface OutlineRow {
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

/**
 * 현장 Composer 가 읽어 갈 목록.
 * 기존 /api/sermon-outlines 는 metadata 를 응답에 넣지 않아(수정 금지 대상)
 * 파싱 구조와 제목·본문·설교자를 받을 수 없다. 그래서 여기서 metadata 까지 준다.
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const params = new URLSearchParams({
      select: 'id,created_at,updated_at,service_date,service_type,content,hymn,status,metadata',
      order: 'service_date.desc.nullslast,created_at.desc',
      limit: String(clampLimit(url.searchParams.get('limit'))),
      church_id: `eq.${await getActiveChurchId()}`,
    });

    const outlines = await supabaseRest(`/sermon_outlines?${params.toString()}`, { method: 'GET' });
    return NextResponse.json({ ok: true, outlines });
  } catch (error) {
    console.error('[sermon-compose-outline] list failed', error);

    if (error instanceof SupabaseServerConfigError) {
      return jsonError(error.message, 503, error.code);
    }

    const message = error instanceof Error ? error.message : '설교대지 목록을 불러오지 못했습니다.';
    return jsonError(message, 500, 'SERMON_OUTLINE_LIST_FAILED');
  }
}

export async function POST(request: Request) {
  /* 쓰기는 로그인한 사람만 — 강제 여부는 UNOWORSHIP_REQUIRE_LOGIN 이 정한다 */
  const denied = await requireLogin();
  if (denied) return denied;

  try {
    const body = BodySchema.parse(await request.json());

    /* 협조문도 본문도 없으면 설교대지를 만들 수 없다. */
    if (!body.content && !body.scriptureRef) {
      return jsonError('협조문 내용이나 본문(요절) 중 하나는 필요합니다.', 400, 'EMPTY_OUTLINE');
    }

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
            /* 현장에서 설교대지 3종을 만들 때 쓰는 값 — 협조문 파싱보다 이쪽이 우선이다.
               사람이 화면에서 고친 최종값이기 때문이다. */
            sermonTitle: body.sermonTitle || parsed.sermonTitle,
            scriptureRef: body.scriptureRef || parsed.scriptureRef,
            preacher: body.preacher,
            /* 설교자 자막의 소속 슬롯 — 교회마다 다르므로 churches 레코드에서 읽는다. */
            churchName: await getActiveChurchName(),
            serviceOrder: body.serviceOrder,
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
        await replaceSubProgram({
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

    /* 교회소식 — 찬송가·찬양과 같이 한 예배에 하나뿐이라 교체 저장한다 */
    const newsBlocks = splitNewsBlocks(body.news);
    if (newsBlocks.length > MAX_ITEMS_PER_PROGRAM) {
      return jsonError(
        `교회소식은 한 프로그램에 ${MAX_ITEMS_PER_PROGRAM}건까지 넣을 수 있습니다. (지금 ${newsBlocks.length}건)`,
        400,
        'TOO_MANY_NEWS',
      );
    }
    if (newsBlocks.length > 0) {
      const items: SubNewsItem[] = newsBlocks.map((block) => ({ body: block }));
      subPrograms.push(
        await replaceSubProgram({
          id: randomUUID(),
          kind: 'news',
          churchId,
          serviceType: body.serviceType,
          serviceDate: body.serviceDate,
          title: body.newsTitle,
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
        await replaceSubProgram({
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
