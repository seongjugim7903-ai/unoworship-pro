import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import { createWriteStream } from 'fs';
import path from 'path';
// [FIX: UPLOAD_STREAMING] 업로드를 메모리에 올리지 않고 디스크로 흘려보낸다
import { Readable, Transform } from 'stream';
import { pipeline } from 'stream/promises';
import { rejectLargeRequest, requireRequestRole, requireTrustedWriteRequest } from '@/lib/auth/serverAuth';
import { dataPath } from '@/lib/localLibraryPath';

export const runtime = 'nodejs';
// 큰 영상 저장에 대비한 타임아웃 여유값(자체 호스팅 커스텀 서버에선 사실상 무제한).
export const maxDuration = 60;

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

    // [FIX: UPLOAD_STREAMING] 예전에는 `Buffer.from(await req.arrayBuffer())` 로
    //   파일 전체를 메모리에 올린 뒤에야 크기를 검사했다. 상한이 1GB 라 큰 영상에서
    //   ArrayBuffer + Buffer 사본으로 파일 크기의 2배가 순간에 잡혀 서버가 죽었고,
    //   그동안 브라우저에 "페이지를 찾을 수 없습니다" 가 떴다.
    //   이제 요청 본문을 디스크로 흘려보내 메모리 사용량이 파일 크기와 무관하다.
    if (!req.body) {
      return NextResponse.json({ error: 'Empty request body.' }, { status: 400 });
    }

    await ensureDir();

    const safeBase = sanitizeBaseName(originalName);
    const filename = `${Date.now()}-${safeBase}.${ext}`;
    const fp = path.join(DATA_DIR, filename);

    let written = 0;
    let tooLarge = false;
    // 상한 초과를 다 받은 뒤가 아니라 **흘려보내는 중에** 감지해 즉시 끊는다.
    const limitGuard = new Transform({
      transform(chunk, _enc, cb) {
        written += chunk.length;
        if (written > MAX_VIDEO_UPLOAD_BYTES) {
          tooLarge = true;
          cb(new Error('VIDEO_TOO_LARGE'));
          return;
        }
        cb(null, chunk);
      },
    });

    try {
      await pipeline(
        Readable.fromWeb(req.body as Parameters<typeof Readable.fromWeb>[0]),
        limitGuard,
        createWriteStream(fp),
      );
    } catch (streamErr) {
      // 실패하면 부분 파일을 남기지 않는다 — 깨진 파일을 물고 재생하지 않도록.
      await fs.rm(fp, { force: true }).catch(() => {});
      if (tooLarge) {
        return NextResponse.json({ error: 'Video file is too large.' }, { status: 413 });
      }
      throw streamErr;
    }

    if (written <= 0) {
      await fs.rm(fp, { force: true }).catch(() => {});
      return NextResponse.json({ error: 'Video file is empty.' }, { status: 413 });
    }

    return NextResponse.json({
      video: {
        filename,
        originalName,
        size: written,
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
