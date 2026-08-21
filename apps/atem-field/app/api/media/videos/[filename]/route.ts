import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import { createReadStream } from 'fs';
import path from 'path';
import { dataPath } from '@/lib/localLibraryPath';

export const runtime = 'nodejs';

const DATA_DIR = dataPath('media', 'videos');

function sanitizeFilename(filename: string): string | null {
  const decoded = decodeURIComponent(filename);
  if (!/^[0-9]+-[a-zA-Z0-9가-힣_\- ]+\.(mp4|mov|m4v|webm)$/i.test(decoded)) return null;
  return decoded;
}

function contentTypeFor(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  if (ext === 'mov') return 'video/quicktime';
  if (ext === 'webm') return 'video/webm';
  return 'video/mp4';
}

function parseRange(range: string | null, size: number): { start: number; end: number } | null {
  if (!range) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  if (!match) return null;

  const [, startRaw, endRaw] = match;
  if (!startRaw && !endRaw) return null;

  if (!startRaw) {
    const suffix = Number(endRaw);
    if (!Number.isFinite(suffix) || suffix <= 0) return null;
    return { start: Math.max(size - suffix, 0), end: size - 1 };
  }

  const start = Number(startRaw);
  const end = endRaw ? Number(endRaw) : size - 1;
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start || start >= size) {
    return null;
  }

  return { start, end: Math.min(end, size - 1) };
}

/**
 * [FIX: STREAM_ABORT] 파일 스트림을 응답 본문으로. **연결이 끊기면 파일 핸들을 반납한다.**
 *
 * 브라우저는 영상을 seek 하거나 loop 로 되감을 때 진행 중인 요청을 그냥 끊는다.
 * 그때 fs 스트림이 살아남으면 핸들·버퍼가 쌓여 서버가 무거워진다.
 *
 * 다만 정리 방식이 중요하다. `Readable.toWeb()` 로 만든 스트림을 밖에서
 * `destroy()` 하면 이미 닫힌 컨트롤러를 건드려
 * `Invalid state: Controller is already closed` 가 **uncaughtException 으로
 * 터지고 서버 프로세스가 통째로 죽는다** (2026-07-28 실측 — 이것 때문에
 * dev 서버가 20~30초마다 크래시 루프에 빠졌다).
 * 그래서 컨트롤러를 직접 만들고, 취소는 `cancel()` 한 곳에서만 처리한다.
 */
function fileStreamBody(fp: string, opts?: { start: number; end: number }): ReadableStream {
  const stream = opts
    ? createReadStream(fp, { start: opts.start, end: opts.end })
    : createReadStream(fp);

  // [FIX: STREAM_ABORT] 직접 ReadableStream 을 만든다.
  //   `Readable.toWeb()` 를 쓰고 밖에서 stream.destroy() 를 부르면, 이미 닫힌
  //   컨트롤러에 다시 손대면서 `Invalid state: Controller is already closed` 가
  //   **uncaughtException 으로 터져 서버 프로세스가 죽는다** (2026-07-28 실측).
  //   여기서는 컨트롤러 생명주기를 우리가 쥐고, 닫힌 뒤에는 절대 건드리지 않는다.
  let closed = false;
  const safe = (fn: () => void) => { if (!closed) { closed = true; fn(); } };

  return new ReadableStream({
    start(controller) {
      stream.on('data', (chunk) => {
        if (closed) return;
        try {
          controller.enqueue(new Uint8Array(chunk as Buffer));
        } catch {
          // 소비자가 이미 떠났다 — 조용히 정리
          safe(() => {});
          stream.destroy();
        }
        // 백프레셔: 소비자가 못 따라오면 잠시 멈춘다 (메모리 급증 방지)
        if ((controller.desiredSize ?? 1) <= 0) stream.pause();
      });
      stream.on('end', () => safe(() => { try { controller.close(); } catch { /* 이미 닫힘 */ } }));
      stream.on('error', () => safe(() => { try { controller.error(); } catch { /* 이미 닫힘 */ } }));
    },
    pull() {
      // 소비자가 더 원하면 재개
      if (!closed) stream.resume();
    },
    cancel() {
      // 브라우저가 seek·loop·창닫기로 끊은 경우 — 파일 핸들 반납
      closed = true;
      stream.destroy();
    },
  });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  const { filename: rawFilename } = await params;
  const filename = sanitizeFilename(rawFilename);
  if (!filename) {
    return NextResponse.json({ error: 'Invalid video filename' }, { status: 400 });
  }

  const fp = path.join(DATA_DIR, filename);

  try {
    const stat = await fs.stat(fp);
    if (!stat.isFile()) {
      return NextResponse.json({ error: 'Video not found' }, { status: 404 });
    }

    const type = contentTypeFor(filename);
    const range = parseRange(req.headers.get('range'), stat.size);

    // [FIX: VIDEO_CACHE] 예전에는 no-store 라 브라우저가 절대 캐시하지 못했다.
    //   송출하면 /output · /prompt · /atem-main · /atem-fill · /atemsignal/fill 가
    //   같은 파일을 각자 통째로 내려받고, 요소가 loop:true 라 반복마다 다시 받았다.
    //   50MB 영상이면 dev 서버가 250MB 이상을 동시에 스트리밍해 CPU·메모리가 튄다.
    //   파일명이 `{타임스탬프}-{이름}.{확장자}` 라 같은 URL 의 내용은 절대 바뀌지
    //   않으므로 장기 캐시가 안전하다.
    const cacheControl = 'public, max-age=31536000, immutable';
    const etag = `W/"${stat.size}-${Math.floor(stat.mtimeMs)}"`;

    // 캐시가 유효하면 본문 없이 304 — 두 번째 창부터는 파일을 다시 받지 않는다.
    if (req.headers.get('if-none-match') === etag) {
      return new NextResponse(null, {
        status: 304,
        headers: { ETag: etag, 'Cache-Control': cacheControl, 'Accept-Ranges': 'bytes' },
      });
    }

    if (range) {
      const chunkSize = range.end - range.start + 1;
      const body = fileStreamBody(fp, { start: range.start, end: range.end });
      return new NextResponse(body, {
        status: 206,
        headers: {
          'Accept-Ranges': 'bytes',
          'Content-Length': String(chunkSize),
          'Content-Range': `bytes ${range.start}-${range.end}/${stat.size}`,
          'Content-Type': type,
          'Cache-Control': cacheControl,
          ETag: etag,
        },
      });
    }

    const body = fileStreamBody(fp);
    return new NextResponse(body, {
      headers: {
        'Accept-Ranges': 'bytes',
        'Content-Length': String(stat.size),
        'Content-Type': type,
        'Cache-Control': cacheControl,
        ETag: etag,
      },
    });
  } catch {
    return NextResponse.json({ error: 'Video not found' }, { status: 404 });
  }
}
