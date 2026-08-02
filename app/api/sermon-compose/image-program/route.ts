// 설교 참고 사진 → 별도 프로그램으로 저장. 기존 /api/sermon-outlines 는 건드리지 않는다.
//
// POST multipart/form-data — payload(JSON) + image0..imageN (브라우저에서 변환한 WebP)

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import {
  SupabaseServerConfigError,
  ensureSupabaseBucket,
  uploadSupabaseObject,
} from '../../../../lib/supabase/server';
import { getActiveChurchId } from '../../../../lib/churchScope';
import {
  MAX_ITEMS_PER_PROGRAM,
  MEDIA_BUCKET,
  type SubImageItem,
} from '../../../../lib/sermon-compose/subProgram';
import { insertSubProgram } from '../../../../lib/sermon-compose/subProgramStore';

export const runtime = 'nodejs';

const PayloadSchema = z.object({
  serviceType: z.string().trim().min(1).default('주일낮예배'),
  serviceDate: z.string().trim().optional().default(''),
  title: z.string().trim().optional().default(''),
  images: z
    .array(
      z.object({
        width: z.number().int().positive(),
        height: z.number().int().positive(),
        caption: z.string().trim().optional().default(''),
      }),
    )
    .min(1, '이미지를 한 장 이상 올려 주세요.')
    .max(MAX_ITEMS_PER_PROGRAM, `이미지는 한 프로그램에 ${MAX_ITEMS_PER_PROGRAM}장까지 올릴 수 있습니다.`),
});

function jsonError(message: string, status: number, code = 'SERMON_IMAGE_PROGRAM_FAILED') {
  return NextResponse.json({ ok: false, code, message }, { status });
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();

    const rawPayload = formData.get('payload');
    if (typeof rawPayload !== 'string') {
      return jsonError('payload가 없습니다.', 400, 'NO_PAYLOAD');
    }
    const payload = PayloadSchema.parse(JSON.parse(rawPayload));

    /* 메타(width/height)와 실제 파일 개수가 어긋나면 순서가 밀리므로 먼저 막는다. */
    const files = payload.images.map((_, index) => formData.get(`image${index}`));
    const missing = files.findIndex((file) => !(file instanceof File));
    if (missing >= 0) {
      return jsonError(`이미지 파일(image${missing})이 빠졌습니다.`, 400, 'IMAGE_FILE_MISSING');
    }

    await ensureSupabaseBucket({
      bucket: MEDIA_BUCKET,
      fileSizeLimit: 10_485_760,
      allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
    });

    const churchId = await getActiveChurchId();
    const programId = randomUUID();

    const items: SubImageItem[] = [];
    for (const [index, meta] of payload.images.entries()) {
      const file = files[index] as File;
      const path = `churches/${churchId}/${programId}/${index + 1}.webp`;
      await uploadSupabaseObject({
        bucket: MEDIA_BUCKET,
        path,
        body: await file.arrayBuffer(),
        contentType: file.type || 'image/webp',
      });
      items.push({ path, width: meta.width, height: meta.height, caption: meta.caption });
    }

    const saved = await insertSubProgram({
      id: programId,
      kind: 'image',
      churchId,
      serviceType: payload.serviceType,
      serviceDate: payload.serviceDate,
      title: payload.title,
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
    console.error('[sermon-image-program] save failed', error);

    if (error instanceof SupabaseServerConfigError) {
      return jsonError(error.message, 503, error.code);
    }

    if (error instanceof z.ZodError) {
      return jsonError(error.issues[0]?.message ?? '입력값을 확인해 주세요.', 400, 'INVALID_IMAGE_PROGRAM');
    }

    const message = error instanceof Error ? error.message : '이미지 프로그램 저장 중 오류가 발생했습니다.';
    return jsonError(message, 500);
  }
}
