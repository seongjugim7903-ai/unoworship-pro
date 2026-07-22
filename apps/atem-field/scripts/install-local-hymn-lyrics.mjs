#!/usr/bin/env node
/**
 * Install a church-owned/licensed hymn lyric ZIP as a local-only JSON pack.
 *
 * This does not ship hymn lyrics with the product. It converts a ZIP that the
 * church places locally into data/hymns/local-new-hymn-lyrics.json.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { TextDecoder } from 'node:util';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DEFAULT_ZIP = path.join(ROOT, 'data/hymns/새찬송가 가사.zip');
const DEFAULT_INDEX = path.join(ROOT, 'data/hymns/new-hymn.json');
const DEFAULT_OUT = path.join(ROOT, 'data/hymns/local-new-hymn-lyrics.json');
const EXPECTED_COUNT = 645;
const DEFAULT_LINES_PER_SECTION = 2;

function readArg(flag, fallback) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return fallback;
  return process.argv[index + 1] || fallback;
}

function normalizeText(value) {
  return value
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.replace(/\s+$/g, '').trim())
    .filter(Boolean)
    .join('\n');
}

function normalizeComparable(value) {
  return value.replace(/\s+/g, '').trim();
}

function splitIntoTwoLineSections(lines, linesPerSection) {
  const sections = [];
  for (let i = 0; i < lines.length; i += linesPerSection) {
    const text = lines.slice(i, i + linesPerSection).join('\n').trim();
    if (text) sections.push(text);
  }
  return sections;
}

function loadTitleMap(indexPath) {
  const parsed = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  const hymns = Array.isArray(parsed.hymns) ? parsed.hymns : [];
  return new Map(hymns.map((hymn) => [Number(hymn.num), String(hymn.title || '').trim()]));
}

function listZipFiles(zipPath) {
  return execFileSync('zipinfo', ['-1', zipPath], { encoding: 'utf8' })
    .split(/\n+/)
    .map((name) => name.trim())
    .filter((name) => /^[0-9]{3}\.txt$/.test(name))
    .sort();
}

function readZipText(zipPath, filename) {
  const buffer = execFileSync('unzip', ['-p', zipPath, filename]);
  return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
}

function main() {
  const zipPath = path.resolve(readArg('--zip', DEFAULT_ZIP));
  const indexPath = path.resolve(readArg('--index', DEFAULT_INDEX));
  const outPath = path.resolve(readArg('--out', DEFAULT_OUT));
  const linesPerSection = Number(readArg('--lines-per-section', String(DEFAULT_LINES_PER_SECTION))) || DEFAULT_LINES_PER_SECTION;

  if (!fs.existsSync(zipPath)) {
    throw new Error(`찬송가 ZIP 파일을 찾을 수 없습니다: ${zipPath}`);
  }
  if (!fs.existsSync(indexPath)) {
    throw new Error(`찬송가 제목 인덱스를 찾을 수 없습니다: ${indexPath}`);
  }

  const titles = loadTitleMap(indexPath);
  const files = listZipFiles(zipPath);
  const seen = new Set();
  const hymns = [];
  const warnings = [];

  for (const file of files) {
    const num = Number(file.slice(0, 3));
    seen.add(num);
    const title = titles.get(num) || '';
    const normalized = normalizeText(readZipText(zipPath, file));
    let lines = normalized.split('\n').filter(Boolean);

    if (title && lines[0] && normalizeComparable(lines[0]) === normalizeComparable(title)) {
      lines = lines.slice(1);
    }

    if (lines.length === 0) warnings.push(`blank:${file}`);

    hymns.push({
      num,
      title,
      lyrics: lines.join('\n'),
      lines,
      sections: splitIntoTwoLineSections(lines, linesPerSection),
    });
  }

  const missing = [];
  for (let i = 1; i <= EXPECTED_COUNT; i += 1) {
    if (!seen.has(i)) missing.push(i);
  }

  const out = {
    version: {
      id: 'new-local-lyrics',
      name: '새찬송가 로컬 가사',
      totalCount: EXPECTED_COUNT,
      installedCount: hymns.length,
      linesPerSection,
    },
    installedAt: new Date().toISOString(),
    sourceZip: path.basename(zipPath),
    copyrightPolicy:
      '교회가 보유하거나 사용 허가를 받은 찬송가 텍스트를 로컬에 설치한 자료입니다. 제품 기본 배포 데이터가 아닙니다.',
    hymns,
    validation: {
      expectedCount: EXPECTED_COUNT,
      actualCount: hymns.length,
      missing,
      warnings,
    },
  };

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2), 'utf8');

  console.log(`[hymn-local] installed ${hymns.length}/${EXPECTED_COUNT}`);
  console.log(`[hymn-local] output ${outPath}`);
  if (missing.length > 0) console.warn(`[hymn-local] missing ${missing.join(', ')}`);
  if (warnings.length > 0) console.warn(`[hymn-local] warnings ${warnings.join(', ')}`);
}

main();
