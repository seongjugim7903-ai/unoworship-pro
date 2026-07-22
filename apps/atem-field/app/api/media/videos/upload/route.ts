import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { rejectLargeRequest, requireRequestRole, requireTrustedWriteRequest } from '@/lib/auth/serverAuth';

export const runtime = 'nodejs';
// 큰 영상 저장에 대비한 타임아웃 여유값(자체 호스팅 커스텀 서버에선 사실상 무제한).
export const maxDuration = 60;

import { dataPath } from '@/lib/localLibraryPath';

const DATA_DIR = dataPath('media', 'videos');
const MAX_VIDEO_UPLOAD_BYTES = 1024 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set(['mp4', 'mov', 'm4v', 'webm']);

async function ensureDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

function sanitizeBaseName(name: string): string {
  const withoutExt = name.replace(/\.[^.]+$/, '');
  const normalized = withoutExt
    .normalize('NFKC')
    .replace(/[^a-zA-Z0-9가-힣_\- ]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 80);
  return normalized || 'video';
}

// raw 업로드용 — 파일명(x-filename 헤더) + content-type 으로 확장자 판정.
function resolveExtension(filename: string, contentType: string): string | null {
  const nameExt = filename.split('.').pop()?.toLowerCase();
  if (nameExt && ALLOWED_EXTENSIONS.has(nameExt)) return nameExt;

  const ct = contentType.toLowerCase();
  if (ct.includes('mp4')) return 'mp4';
  if (ct.includes('quicktime')) return 'mov';
  if (ct.includes('x-m4v')) return 'm4v';
  if (ct.includes('webm')) return 'webm';
  return null;
}

export async function POST(req: NextRequest) {
  const authResult = await requireRequestRole(req, 'crew');
  if ('response' in authResult) return authResult.response;
  const trustedWriteResponse = requireTrustedWriteRequest(req, authResult.auth);
  if (trustedWriteResponse) return trustedWriteResponse;
  const tooLargeResponse = rejectLargeRequest(req, MAX_VIDEO_UPLOAD_BYTES);
  if (tooLargeResponse) return tooLargeResponse;

  try {
    // [FIX] req.formData() 가 Next16 + 커스텀서버 조합에서 "Failed to parse body as FormData"
    //   로 실패한다(req.json() 은 정상 → body 전달은 OK, multipart 파서만 문제).
    //   그래서 클라이언트가 파일을 raw 바이너리로 보내고, 여기서 arrayBuffer 로 받는다.
    const rawName = req.headers.get('x-filename');
    const originalName = rawName ? decodeURIComponent(rawName) : 'video';
    const contentType = req.headers.get('content-type') || '';

    const ext = resolveExtension(originalName, contentType);
    if (!ext) {
      return NextResponse.json(
        { error: 'Unsupported video format. Use mp4, mov, m4v, or webm.' },
        { status: 415 }
      );
    }

    const bytes = Buffer.from(await req.arrayBuffer());
    if (bytes.length <= 0 || bytes.length > MAX_VIDEO_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: 'Video file size is invalid or too large.' },
        { status: 413 }
      );
    }

    await ensureDir();

    const safeBase = sanitizeBaseName(originalName);
    const filename = `${Date.now()}-${safeBase}.${ext}`;
    const fp = path.join(DATA_DIR, filename);
    await fs.writeFile(fp, bytes);

    return NextResponse.json({
      video: {
        filename,
        originalName,
        size: bytes.length,
        contentType: contentType || `video/${ext}`,
        url: `/api/media/videos/${encodeURIComponent(filename)}`,
      },
    }, { status: 201 });
  } catch (err) {
    console.error('[video-upload] 업로드 실패:', err);
    return NextResponse.json(
      { error: 'Failed to upload video', detail: String(err) },
      { status: 500 }
    );
  }
}
