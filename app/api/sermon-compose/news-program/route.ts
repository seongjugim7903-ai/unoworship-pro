// 교회소식 → 별도 프로그램으로 저장. 빈 줄로 나눈 소식 한 건이 한 섹션이 된다.
//
// POST application/json — { serviceType, serviceDate, title, content }
//
// 분할은 서버에서 다시 한다 — 클라이언트가 보낸 블록 배열을 그대로 믿지 않고
// 원문(content)에서 같은 규칙으로 나눈다.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { SupabaseServerConfigError } from '../../../../lib/supabase/server';
import { getActiveChurchId } from '../../../../lib/churchScope';
import { MAX_ITEMS_PER_PROGRAM, type SubNewsItem } from '../../../../lib/sermon-compose/subProgram';
import { insertSubProgram } from '../../../../lib/sermon-compose/subProgramStore';
import { splitNewsBlocks } from '../../../../lib/sermon-compose/churchNews';
import { requireLogin } from '../../../../lib/authn/requireLogin';

export const runtime = 'nodejs';

const BodySchema = z.object({
  serviceType: z.string().trim().min(1).default('주일낮예배'),
  serviceDate: z.string().trim().optional().default(''),
  title: z.string().trim().optional().default(''),
  content: z.string().trim().min(1, '교회소식 내용을 입력해 주세요.'),
});

function jsonError(message: string, status: number, code = 'SERMON_NEWS_PROGRAM_FAILED') {
  return NextResponse.json({ ok: false, code, message }, { status });
}

export async function POST(request: Request) {
  /* 쓰기는 로그인한 사람만 — 강제 여부는 UNOWORSHIP_REQUIRE_LOGIN 이 정한다 */
  const denied = await requireLogin();
  if (denied) return denied;

  try {
    const body = BodySchema.parse(await request.json());

    const blocks = splitNewsBlocks(body.content);
    if (blocks.length === 0) {
      return jsonError('나눌 소식이 없습니다.', 400, 'NO_NEWS_BLOCK');
    }
    if (blocks.length > MAX_ITEMS_PER_PROGRAM) {
      return jsonError(
        `소식은 한 프로그램에 ${MAX_ITEMS_PER_PROGRAM}건까지 넣을 수 있습니다. (지금 ${blocks.length}건)`,
        400,
        'TOO_MANY_NEWS_BLOCKS',
      );
    }

    const items: SubNewsItem[] = blocks.map((block) => ({ body: block }));

    const saved = await insertSubProgram({
      id: randomUUID(),
      kind: 'news',
      churchId: await getActiveChurchId(),
      serviceType: body.serviceType,
      serviceDate: body.serviceDate,
      title: body.title,
      items,
      originHeader: request.headers.get('origin'),
    });

    return NextResponse.json({
      ok: true,
      programId: saved.id,
      title: saved.title,
      itemCount: items.length,
    });
  } catch (error) {
    console.error('[sermon-news-program] save failed', error);

    if (error instanceof SupabaseServerConfigError) {
      return jsonError(error.message, 503, error.code);
    }

    if (error instanceof z.ZodError) {
      return jsonError(error.issues[0]?.message ?? '입력값을 확인해 주세요.', 400, 'INVALID_NEWS_PROGRAM');
    }

    const message = error instanceof Error ? error.message : '교회소식 저장 중 오류가 발생했습니다.';
    return jsonError(message, 500);
  }
}
