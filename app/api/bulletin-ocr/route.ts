import { NextResponse } from 'next/server';
import {
  BulletinExtractorConfigError,
  extractBulletinSections,
} from '../../../lib/bulletin/extractBulletin';

export const runtime = 'nodejs';
export const maxDuration = 60;

const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const;
type AllowedType = (typeof ALLOWED_TYPES)[number];

function jsonError(message: string, status: number, code = 'BULLETIN_OCR_FAILED') {
  return NextResponse.json({ ok: false, code, message }, { status });
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('image');

    if (!(file instanceof File)) {
      return jsonError('주보 이미지 파일이 없습니다.', 400, 'NO_IMAGE');
    }

    const mediaType = file.type as AllowedType;
    if (!ALLOWED_TYPES.includes(mediaType)) {
      return jsonError('PNG, JPEG, WEBP, GIF 이미지만 지원합니다.', 400, 'BAD_IMAGE_TYPE');
    }

    if (file.size > 8 * 1024 * 1024) {
      return jsonError('이미지 용량은 8MB 이하여야 합니다.', 413, 'IMAGE_TOO_LARGE');
    }

    const base64 = Buffer.from(await file.arrayBuffer()).toString('base64');
    const sections = await extractBulletinSections({ base64, mediaType });

    return NextResponse.json({ ok: true, sections });
  } catch (error) {
    console.error('[bulletin-ocr] extract failed', error);

    if (error instanceof BulletinExtractorConfigError) {
      return jsonError(error.message, 503, error.code);
    }

    const message = error instanceof Error ? error.message : '주보 텍스트 추출 중 오류가 발생했습니다.';
    return jsonError(message, 500);
  }
}
