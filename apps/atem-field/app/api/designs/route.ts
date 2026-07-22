/**
 * app/api/designs/route.ts
 *
 * GET  /api/designs              — 모든 프로그램 디자인 조회
 * PUT  /api/designs              — 특정 프로그램 디자인 저장 { programType, design }
 */

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { rejectLargeRequest, requireRequestRole, requireTrustedWriteRequest } from '@/lib/auth/serverAuth';
import { dataPath } from '@/lib/localLibraryPath';

const DATA_DIR = dataPath('designs');
const MAX_DESIGN_REQUEST_BYTES = 5 * 1024 * 1024;

async function ensureDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '');
}

export async function GET() {
  await ensureDir();

  try {
    const files = await fs.readdir(DATA_DIR);
    const designs: Record<string, unknown> = {};

    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      const raw = await fs.readFile(path.join(DATA_DIR, file), 'utf-8');
      const key = file.replace('.json', '');
      designs[key] = JSON.parse(raw);
    }

    return NextResponse.json({ designs });
  } catch {
    return NextResponse.json({ designs: {} });
  }
}

export async function PUT(req: NextRequest) {
  const authResult = await requireRequestRole(req, 'crew');
  if ('response' in authResult) return authResult.response;
  const trustedWriteResponse = requireTrustedWriteRequest(req, authResult.auth);
  if (trustedWriteResponse) return trustedWriteResponse;
  const tooLargeResponse = rejectLargeRequest(req, MAX_DESIGN_REQUEST_BYTES);
  if (tooLargeResponse) return tooLargeResponse;

  await ensureDir();

  const { programType, design } = await req.json();

  if (!programType || !design) {
    return NextResponse.json({ error: 'programType and design required' }, { status: 400 });
  }

  const safeName = sanitize(programType);
  if (!safeName || safeName !== programType) {
    return NextResponse.json({ error: 'Invalid programType' }, { status: 400 });
  }

  const filePath = path.join(DATA_DIR, `${safeName}.json`);
  await fs.writeFile(filePath, JSON.stringify(design, null, 2), 'utf-8');

  return NextResponse.json({ ok: true, programType: safeName });
}
