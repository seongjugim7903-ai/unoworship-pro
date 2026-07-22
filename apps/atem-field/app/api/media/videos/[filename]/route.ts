import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import { createReadStream } from 'fs';
import path from 'path';
import { Readable } from 'stream';

export const runtime = 'nodejs';

import { dataPath } from '@/lib/localLibraryPath';

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

    if (range) {
      const chunkSize = range.end - range.start + 1;
      const stream = createReadStream(fp, { start: range.start, end: range.end });
      const body = Readable.toWeb(stream) as ReadableStream;
      return new NextResponse(body, {
        status: 206,
        headers: {
          'Accept-Ranges': 'bytes',
          'Content-Length': String(chunkSize),
          'Content-Range': `bytes ${range.start}-${range.end}/${stat.size}`,
          'Content-Type': type,
          'Cache-Control': 'no-store',
        },
      });
    }

    const stream = createReadStream(fp);
    const body = Readable.toWeb(stream) as ReadableStream;
    return new NextResponse(body, {
      headers: {
        'Accept-Ranges': 'bytes',
        'Content-Length': String(stat.size),
        'Content-Type': type,
        'Cache-Control': 'no-store',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Video not found' }, { status: 404 });
  }
}
