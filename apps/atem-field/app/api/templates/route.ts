/**
 * app/api/templates/route.ts
 *
 * 자막 템플릿 서버 저장 API — data/templates/{id}.json 파일 단위 CRUD
 * GET     /api/templates            — 모든 템플릿 조회
 * PUT     /api/templates            — 템플릿 저장 { template }
 * DELETE  /api/templates?id=...      — 템플릿 삭제
 *
 * 기존 /api/designs 와 별개(결정: 저장 경로 분리). 나중에 마이그레이션으로 흡수.
 */

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { rejectLargeRequest, requireRequestRole, requireTrustedWriteRequest } from '@/lib/auth/serverAuth';

const DATA_DIR = path.join(process.cwd(), 'data', 'templates');
const MAX_TEMPLATE_REQUEST_BYTES = 5 * 1024 * 1024;

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
    const templates: unknown[] = [];

    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      const raw = await fs.readFile(path.join(DATA_DIR, file), 'utf-8');
      templates.push(JSON.parse(raw));
    }

    return NextResponse.json({ templates });
  } catch {
    return NextResponse.json({ templates: [] });
  }
}

export async function PUT(req: NextRequest) {
  const authResult = await requireRequestRole(req, 'crew');
  if ('response' in authResult) return authResult.response;
  const trustedWriteResponse = requireTrustedWriteRequest(req, authResult.auth);
  if (trustedWriteResponse) return trustedWriteResponse;
  const tooLargeResponse = rejectLargeRequest(req, MAX_TEMPLATE_REQUEST_BYTES);
  if (tooLargeResponse) return tooLargeResponse;

  await ensureDir();

  const { template } = await req.json();

  if (!template || !template.id) {
    return NextResponse.json({ error: 'template with id required' }, { status: 400 });
  }

  const rawId = String(template.id);
  const safeId = sanitize(rawId);
  if (!safeId || safeId !== rawId) {
    return NextResponse.json({ error: 'Invalid template id' }, { status: 400 });
  }

  const filePath = path.join(DATA_DIR, `${safeId}.json`);
  await fs.writeFile(filePath, JSON.stringify(template, null, 2), 'utf-8');

  return NextResponse.json({ ok: true, id: safeId });
}

export async function DELETE(req: NextRequest) {
  const authResult = await requireRequestRole(req, 'crew');
  if ('response' in authResult) return authResult.response;
  const trustedWriteResponse = requireTrustedWriteRequest(req, authResult.auth);
  if (trustedWriteResponse) return trustedWriteResponse;

  const rawId = new URL(req.url).searchParams.get('id') ?? '';
  const safeId = sanitize(rawId);
  if (!safeId || safeId !== rawId) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  await ensureDir();
  try {
    await fs.unlink(path.join(DATA_DIR, `${safeId}.json`));
  } catch {
    // 이미 없으면 무시
  }

  return NextResponse.json({ ok: true });
}
