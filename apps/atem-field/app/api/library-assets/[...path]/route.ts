/**
 * GET /api/library-assets/<...path>
 *
 * 로컬 라이브러리의 생성 에셋(generated/*) 서빙.
 * 패키지된 Electron 앱에서는 public/ 이 읽기 전용(asar)이라 정적 서빙이 불가하므로,
 * UNOLIVE_LIBRARY_DIR 아래 generated/ 폴더를 이 라우트로 서빙한다.
 * 개발 모드에서도 동작하며 public/generated 를 그대로 읽는다.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
import { generatedPath } from '@/lib/localLibraryPath';

export const runtime = 'nodejs';

const CONTENT_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
};

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: segments } = await params;
  if (!segments?.length) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  const root = path.normalize(generatedPath());
  const target = path.normalize(generatedPath(...segments));

  // 경로 탈출 방지
  if (!target.startsWith(root)) {
    return NextResponse.json({ error: 'invalid path' }, { status: 400 });
  }

  const ext = path.extname(target).toLowerCase();
  const contentType = CONTENT_TYPES[ext];
  if (!contentType) {
    return NextResponse.json({ error: 'unsupported type' }, { status: 415 });
  }

  try {
    const body = await fs.readFile(target);
    return new NextResponse(new Uint8Array(body), {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=60',
      },
    });
  } catch {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
}
