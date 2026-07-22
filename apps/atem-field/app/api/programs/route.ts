/**
 * app/api/programs/route.ts
 * 프로그램 목록 조회 + 저장 API
 *
 * GET  /api/programs              — 전체 목록
 * GET  /api/programs?worship=ID   — 특정 워쉽의 프로그램만
 * GET  /api/programs?type=choir   — 특정 유형만
 * POST /api/programs              — 새 프로그램 저장
 */

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import type { SavedProgram } from '@/lib/generators/programTypes';
import { rejectLargeRequest, requireRequestRole, requireTrustedWriteRequest } from '@/lib/auth/serverAuth';
import { dataPath } from '@/lib/localLibraryPath';

const DATA_DIR = dataPath('programs');
const MAX_PROGRAM_REQUEST_BYTES = 2 * 1024 * 1024;

/** data/programs 디렉토리 보장 */
async function ensureDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

function sanitizeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9가-힣_\-]/g, '');
}

/** 모든 프로그램 파일 읽기 */
async function readAllPrograms(): Promise<SavedProgram[]> {
  await ensureDir();
  const files = await fs.readdir(DATA_DIR);
  const jsons = files.filter((f) => f.endsWith('.json'));

  const programs: SavedProgram[] = [];
  for (const file of jsons) {
    try {
      const raw = await fs.readFile(path.join(DATA_DIR, file), 'utf-8');
      programs.push(JSON.parse(raw));
    } catch {
      // 손상된 파일 무시
    }
  }

  // 최신순 정렬
  programs.sort((a, b) => b.updatedAt - a.updatedAt);
  return programs;
}

export async function GET(req: NextRequest) {
  try {
    let programs = await readAllPrograms();

    // 필터: worshipId
    const worship = req.nextUrl.searchParams.get('worship');
    if (worship) {
      programs = programs.filter((p) => p.worshipId === worship);
    }

    // 필터: type
    const type = req.nextUrl.searchParams.get('type');
    if (type) {
      programs = programs.filter((p) => p.type === type);
    }

    return NextResponse.json({ programs });
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to read programs', detail: String(err) },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const authResult = await requireRequestRole(req, 'crew');
  if ('response' in authResult) return authResult.response;
  const trustedWriteResponse = requireTrustedWriteRequest(req, authResult.auth);
  if (trustedWriteResponse) return trustedWriteResponse;
  const tooLargeResponse = rejectLargeRequest(req, MAX_PROGRAM_REQUEST_BYTES);
  if (tooLargeResponse) return tooLargeResponse;

  try {
    const body: SavedProgram = await req.json();

    if (!body.id || !body.type || !body.worshipId || !body.item) {
      return NextResponse.json(
        { error: 'Missing required fields: id, type, worshipId, item' },
        { status: 400 }
      );
    }

    const safeId = sanitizeId(body.id);
    if (!safeId || safeId !== body.id) {
      return NextResponse.json(
        { error: 'Invalid program id' },
        { status: 400 }
      );
    }

    // 타임스탬프 보장
    const now = Date.now();
    body.createdAt = body.createdAt || now;
    body.updatedAt = now;

    await ensureDir();
    const filePath = path.join(DATA_DIR, `${safeId}.json`);
    await fs.writeFile(filePath, JSON.stringify(body, null, 2), 'utf-8');

    return NextResponse.json({ program: body }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to save program', detail: String(err) },
      { status: 500 }
    );
  }
}
