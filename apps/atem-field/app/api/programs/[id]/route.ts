/**
 * app/api/programs/[id]/route.ts
 * 개별 프로그램 조회 / 수정 / 삭제
 *
 * GET    /api/programs/:id  — 조회
 * PUT    /api/programs/:id  — 수정 (전체 덮어쓰기)
 * DELETE /api/programs/:id  — 삭제
 */

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import type { SavedProgram } from '@/lib/generators/programTypes';
import { rejectLargeRequest, requireRequestRole, requireTrustedWriteRequest } from '@/lib/auth/serverAuth';
import { dataPath } from '@/lib/localLibraryPath';

const DATA_DIR = dataPath('programs');
const MAX_PROGRAM_REQUEST_BYTES = 2 * 1024 * 1024;

function sanitizeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9가-힣_\-]/g, '');
}

function filePath(id: string): string | null {
  const safe = sanitizeId(id);
  if (!safe || safe !== id) return null;
  return path.join(DATA_DIR, `${safe}.json`);
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const fp = filePath(id);
    if (!fp) {
      return NextResponse.json({ error: 'Invalid program id' }, { status: 400 });
    }

    const raw = await fs.readFile(fp, 'utf-8');
    const program: SavedProgram = JSON.parse(raw);
    return NextResponse.json({ program });
  } catch {
    return NextResponse.json({ error: 'Program not found' }, { status: 404 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireRequestRole(req, 'crew');
  if ('response' in authResult) return authResult.response;
  const trustedWriteResponse = requireTrustedWriteRequest(req, authResult.auth);
  if (trustedWriteResponse) return trustedWriteResponse;
  const tooLargeResponse = rejectLargeRequest(req, MAX_PROGRAM_REQUEST_BYTES);
  if (tooLargeResponse) return tooLargeResponse;

  try {
    const { id } = await params;
    const body: SavedProgram = await req.json();
    const fp = filePath(id);
    if (!fp) {
      return NextResponse.json({ error: 'Invalid program id' }, { status: 400 });
    }

    if (!body.type || !body.worshipId || !body.item) {
      return NextResponse.json(
        { error: 'Missing required fields: type, worshipId, item' },
        { status: 400 }
      );
    }

    body.id = id;
    body.updatedAt = Date.now();

    await fs.writeFile(fp, JSON.stringify(body, null, 2), 'utf-8');

    return NextResponse.json({ program: body });
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to update program', detail: String(err) },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireRequestRole(req, 'crew');
  if ('response' in authResult) return authResult.response;
  const trustedWriteResponse = requireTrustedWriteRequest(req, authResult.auth);
  if (trustedWriteResponse) return trustedWriteResponse;

  try {
    const { id } = await params;
    const fp = filePath(id);
    if (!fp) {
      return NextResponse.json({ error: 'Invalid program id' }, { status: 400 });
    }

    await fs.unlink(fp);
    return NextResponse.json({ deleted: true });
  } catch {
    return NextResponse.json({ error: 'Program not found' }, { status: 404 });
  }
}
