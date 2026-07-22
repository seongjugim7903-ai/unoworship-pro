/**
 * GET /api/hymn
 *
 * UnoWorship does not ship hymn lyric/content databases by default. Churches
 * may install materials they own or are licensed to use into a local pack.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';

const ROOT = process.cwd();
const LOCAL_HYMN_PACK_PATH = path.join(ROOT, 'data/hymns/local-new-hymn-lyrics.json');

interface LocalHymn {
  num: number;
  title: string;
  lyrics: string;
  lines: string[];
  sections: string[];
}

interface LocalHymnPack {
  version: {
    id: string;
    name: string;
    totalCount: number;
    installedCount: number;
    linesPerSection: number;
  };
  installedAt: string;
  sourceZip: string;
  copyrightPolicy: string;
  hymns: LocalHymn[];
  validation: {
    expectedCount: number;
    actualCount: number;
    missing: number[];
    warnings: string[];
  };
}

function normalizeSearch(value: string): string {
  return value.toLowerCase().replace(/\s+/g, '').trim();
}

async function readLocalPack(): Promise<LocalHymnPack | null> {
  try {
    const raw = await fs.readFile(LOCAL_HYMN_PACK_PATH, 'utf8');
    return JSON.parse(raw) as LocalHymnPack;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

function summarizeHymn(hymn: LocalHymn) {
  return {
    num: hymn.num,
    title: hymn.title,
    lineCount: hymn.lines.length,
    sectionCount: hymn.sections.length,
    preview: hymn.sections[0] ?? '',
  };
}

export async function GET(req: NextRequest) {
  const pack = await readLocalPack();
  if (!pack) {
    return NextResponse.json(
      {
        installed: false,
        error: 'licensed_content_required',
        message:
          'UnoWorship은 찬송가/찬양곡 가사 DB를 기본 제공하지 않습니다. 교회가 보유하거나 사용 허가를 받은 자료를 로컬에 설치한 뒤 사용할 수 있습니다.',
      },
      { status: 403 }
    );
  }

  const url = new URL(req.url);
  const num = Number(url.searchParams.get('num') || '');
  const query = normalizeSearch(url.searchParams.get('q') || '');
  const limit = Math.min(Number(url.searchParams.get('limit') || 40) || 40, 100);

  if (Number.isInteger(num) && num > 0) {
    const hymn = pack.hymns.find((entry) => entry.num === num);
    if (!hymn) {
      return NextResponse.json({ installed: true, error: 'not_found' }, { status: 404 });
    }
    return NextResponse.json({
      installed: true,
      version: pack.version,
      installedAt: pack.installedAt,
      sourceZip: pack.sourceZip,
      copyrightPolicy: pack.copyrightPolicy,
      hymn,
    });
  }

  const hymns = pack.hymns
    .filter((hymn) => {
      if (!query) return true;
      return (
        String(hymn.num).includes(query) ||
        normalizeSearch(hymn.title).includes(query) ||
        normalizeSearch(hymn.lyrics).includes(query)
      );
    })
    .slice(0, limit)
    .map(summarizeHymn);

  return NextResponse.json({
    installed: true,
    version: pack.version,
    installedAt: pack.installedAt,
    sourceZip: pack.sourceZip,
    validation: pack.validation,
    hymns,
  });
}
