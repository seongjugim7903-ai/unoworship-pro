// 주보 이미지 한 면 → 예배 순서 세 가지(주일낮·주일오후·수요) 추출.
// 기존 /api/bulletin-ocr 은 다섯 섹션을 뽑는 다른 용도라 건드리지 않는다.
//
// POST multipart/form-data — image (브라우저에서 변환한 WebP)

import { NextResponse } from 'next/server';
import {
  BulletinExtractConfigError,
  extractBulletinOrders,
} from '../../../../lib/sermon-compose/bulletinExtract';
import { AnthropicServiceError } from '../../../../lib/sermon-compose/anthropicError';
import { requireLogin } from '../../../../features/membership/requireLogin';

export const runtime = 'nodejs';
export const maxDuration = 60;

const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const;
type AllowedType = (typeof ALLOWED_TYPES)[number];

/* Vercel 요청 본문 상한(4.5MB)보다 낮게 잡는다. 브라우저에서 WebP 로 줄여 보내므로 넉넉하다. */
const MAX_BYTES = 4 * 1024 * 1024;

function jsonError(message: string, status: number, code = 'BULLETIN_OCR_FAILED') {
  return NextResponse.json({ ok: false, code, message }, { status });
}

export async function POST(request: Request) {
  /* 쓰기는 로그인한 사람만 — 강제 여부는 UNOWORSHIP_REQUIRE_LOGIN 이 정한다 */
  const denied = await requireLogin();
  if (denied) return denied;

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

    if (file.size > MAX_BYTES) {
      return jsonError('이미지 용량은 4MB 이하여야 합니다.', 413, 'IMAGE_TOO_LARGE');
    }

    const base64 = Buffer.from(await file.arrayBuffer()).toString('base64');
    const orders = await extractBulletinOrders({ base64, mediaType });

    return NextResponse.json({ ok: true, orders });
  } catch (error) {
    console.error('[sermon-compose-bulletin-ocr] extract failed', error);

    if (error instanceof BulletinExtractConfigError) {
      return jsonError(error.message, 503, error.code);
    }

    /* 크레딧 부족·인증 실패 등 — 사람이 조치할 수 있는 사유는 그 문장을 그대로 올린다. */
    if (error instanceof AnthropicServiceError) {
      return jsonError(error.message, 503, error.code);
    }

    /* 그 밖의 오류는 원문(JSON 덩어리일 수 있음)을 화면에 흘리지 않는다. 로그에는 남는다. */
    return jsonError(
      '주보를 읽는 중 오류가 발생했습니다. 잠시 뒤 다시 시도해 주세요.',
      500,
    );
  }
}
