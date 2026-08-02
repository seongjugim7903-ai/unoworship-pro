// 설교 참고 유튜브 링크 → 별도 프로그램으로 저장.
// 파일 업로드가 없어 JSON 만 받는다(영상 파일 업로드는 하지 않는다).
//
// POST application/json — { serviceType, serviceDate, title, links: [{ url, caption }] }

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { SupabaseServerConfigError } from '../../../../lib/supabase/server';
import { getActiveChurchId } from '../../../../lib/churchScope';
import {
  MAX_ITEMS_PER_PROGRAM,
  type SubYoutubeItem,
} from '../../../../lib/sermon-compose/subProgram';
import { insertSubProgram } from '../../../../lib/sermon-compose/subProgramStore';
import { extractYoutubeId } from '../../../../lib/sermon-compose/youtubeLink';

export const runtime = 'nodejs';

const BodySchema = z.object({
  serviceType: z.string().trim().min(1).default('주일낮예배'),
  serviceDate: z.string().trim().optional().default(''),
  title: z.string().trim().optional().default(''),
  links: z
    .array(
      z.object({
        url: z.string().trim().min(1),
        caption: z.string().trim().optional().default(''),
      }),
    )
    .min(1, '유튜브 링크를 하나 이상 넣어 주세요.')
    .max(MAX_ITEMS_PER_PROGRAM, `링크는 한 프로그램에 ${MAX_ITEMS_PER_PROGRAM}개까지 넣을 수 있습니다.`),
});

function jsonError(message: string, status: number, code = 'SERMON_YOUTUBE_PROGRAM_FAILED') {
  return NextResponse.json({ ok: false, code, message }, { status });
}

export async function POST(request: Request) {
  try {
    const body = BodySchema.parse(await request.json());

    /* 서버에서도 videoId 를 다시 뽑는다 — 클라이언트 검사만 믿지 않는다. */
    const items: SubYoutubeItem[] = [];
    for (const [index, link] of body.links.entries()) {
      const videoId = extractYoutubeId(link.url);
      if (!videoId) {
        return jsonError(
          `${index + 1}번째 링크에서 유튜브 영상 ID를 찾지 못했습니다. (${link.url})`,
          400,
          'INVALID_YOUTUBE_URL',
        );
      }
      items.push({ url: link.url, videoId, caption: link.caption });
    }

    const saved = await insertSubProgram({
      id: randomUUID(),
      kind: 'youtube',
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
    console.error('[sermon-youtube-program] save failed', error);

    if (error instanceof SupabaseServerConfigError) {
      return jsonError(error.message, 503, error.code);
    }

    if (error instanceof z.ZodError) {
      return jsonError(error.issues[0]?.message ?? '입력값을 확인해 주세요.', 400, 'INVALID_YOUTUBE_PROGRAM');
    }

    const message = error instanceof Error ? error.message : '유튜브 프로그램 저장 중 오류가 발생했습니다.';
    return jsonError(message, 500);
  }
}
