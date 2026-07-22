#!/usr/bin/env node
/**
 * Install a church-owned/licensed Bible text pack as a local-only JSON pack.
 *
 * UnoWorship does not ship licensed Bible text. This script only converts or
 * copies local files that a church places on the machine into
 * data/bibles/local-bible.json.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import yauzl from 'yauzl';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const EXISTING_KRV = path.join(ROOT, 'data/bibles/krv.json');
const DEFAULT_OUT = path.join(ROOT, 'data/bibles/local-bible.json');
const EXPECTED_BOOK_COUNT = 66;

function findDefaultZip() {
  const bibleDir = path.join(ROOT, 'data/bibles');
  const files = fs.existsSync(bibleDir) ? fs.readdirSync(bibleDir) : [];
  const preferred = files.find((name) => /pdf/i.test(name) && /txt/i.test(name) && /\.zip$/i.test(name));
  if (preferred) return path.join(bibleDir, preferred);
  const fallback = files.find((name) => /\.zip$/i.test(name));
  return fallback ? path.join(bibleDir, fallback) : path.join(bibleDir, 'NKRV-main.zip');
}

function readArg(flag, fallback) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return fallback;
  return process.argv[index + 1] || fallback;
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function listZipFiles(zipPath) {
  return execFileSync('zipinfo', ['-1', zipPath], { encoding: 'utf8' })
    .split(/\n+/)
    .map((name) => name.trim())
    .filter(Boolean);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function readZipEntry(zipPath, filename) {
  return execFileSync('unzip', ['-p', zipPath, filename], { encoding: 'utf8' });
}

function decodeTextBuffer(buffer) {
  const attempts = [
    () => execFileSync('iconv', ['-f', 'CP949', '-t', 'UTF-8'], { input: buffer }).toString('utf8'),
    () => buffer.toString('utf8'),
    () => buffer.toString('utf16le'),
  ];

  let best = '';
  let bestScore = -1;
  for (const attempt of attempts) {
    try {
      const text = attempt();
      const score = (text.match(/[가-힣]/g) || []).length - (text.match(/�/g) || []).length * 20;
      if (score > bestScore) {
        best = text;
        bestScore = score;
      }
    } catch {
      // Try the next decoder.
    }
  }
  return best;
}

function readZipBinaryEntries(zipPath) {
  return new Promise((resolve, reject) => {
    const entries = [];
    yauzl.open(zipPath, { lazyEntries: true, decodeStrings: false }, (error, archive) => {
      if (error) {
        reject(error);
        return;
      }

      archive.readEntry();
      archive.on('entry', (entry) => {
        const rawName = Buffer.isBuffer(entry.fileName)
          ? entry.fileName.toString('binary')
          : String(entry.fileName);
        const match = rawName.match(/[\\/](1|2)-(\d{2})[^\\/]*\.txt$/i);
        if (!match || !rawName.includes('-text/')) {
          archive.readEntry();
          return;
        }

        archive.openReadStream(entry, (streamError, stream) => {
          if (streamError) {
            reject(streamError);
            return;
          }
          const chunks = [];
          stream.on('data', (chunk) => chunks.push(chunk));
          stream.on('end', () => {
            entries.push({
              group: Number(match[1]),
              num: Number(match[2]),
              buffer: Buffer.concat(chunks),
            });
            archive.readEntry();
          });
        });
      });
      archive.on('end', () => {
        resolve(entries.sort((a, b) => a.group - b.group || a.num - b.num));
      });
      archive.on('error', reject);
    });
  });
}

function validateBibleData(data) {
  const errors = [];
  if (!data || typeof data !== 'object') errors.push('root object is missing');
  if (!data?.version?.id || !data?.version?.name) errors.push('version.id/name is missing');
  if (!Array.isArray(data?.books)) errors.push('books array is missing');

  const books = Array.isArray(data?.books) ? data.books : [];
  if (books.length !== EXPECTED_BOOK_COUNT) errors.push(`book count is ${books.length}, expected ${EXPECTED_BOOK_COUNT}`);

  let chapterCount = 0;
  let verseCount = 0;
  for (const book of books) {
    if (!book?.id || !book?.name || !Array.isArray(book?.chapters)) {
      errors.push(`invalid book metadata: ${book?.id || book?.name || 'unknown'}`);
      continue;
    }
    chapterCount += book.chapters.length;
    for (const chapter of book.chapters) {
      if (!Array.isArray(chapter?.verses)) {
        errors.push(`invalid chapter verses: ${book.id} ${chapter?.num || '?'}`);
        continue;
      }
      verseCount += chapter.verses.filter((verse) => Number.isFinite(Number(verse?.num)) && String(verse?.text || '').trim()).length;
    }
  }

  if (chapterCount < 1100) errors.push(`chapter count is too small: ${chapterCount}`);
  if (verseCount < 30000) errors.push(`verse count is too small: ${verseCount}`);

  return {
    ok: errors.length === 0,
    errors,
    stats: { books: books.length, chapters: chapterCount, verses: verseCount },
  };
}

function normalizeInstalledPack(data, sourceName) {
  const versionId = String(data.version.id || 'bible');
  const versionName = String(data.version.name || '성경');
  return {
    version: {
      ...data.version,
      id: versionId.startsWith('local-') ? versionId : `local-${versionId}`,
      name: versionName.includes('로컬 설치') ? versionName : `${versionName} 로컬 설치`,
    },
    installedAt: new Date().toISOString(),
    sourceFile: sourceName,
    copyrightPolicy:
      '교회가 보유하거나 사용 허가를 받은 성경 본문을 로컬에 설치한 자료입니다. 제품 기본 배포 데이터가 아닙니다.',
    books: data.books,
  };
}

function writePack(outPath, data, sourceName) {
  const validation = validateBibleData(data);
  if (!validation.ok) {
    throw new Error(`성경 데이터 형식이 올바르지 않습니다: ${validation.errors.join('; ')}`);
  }

  const out = normalizeInstalledPack(data, sourceName);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2), 'utf8');
  console.log(`[bible-local] installed ${validation.stats.books} books, ${validation.stats.chapters} chapters, ${validation.stats.verses} verses`);
  console.log(`[bible-local] output ${outPath}`);
}

function installFromExistingKrv(outPath) {
  if (!fs.existsSync(EXISTING_KRV)) {
    throw new Error(`기존 KRV 파일을 찾을 수 없습니다: ${EXISTING_KRV}`);
  }
  const data = JSON.parse(fs.readFileSync(EXISTING_KRV, 'utf8'));
  writePack(outPath, data, path.basename(EXISTING_KRV));
}

function loadTemplateBible() {
  if (!fs.existsSync(EXISTING_KRV)) {
    throw new Error(`성경 책/장 메타데이터 기준 파일을 찾을 수 없습니다: ${EXISTING_KRV}`);
  }
  return JSON.parse(fs.readFileSync(EXISTING_KRV, 'utf8'));
}

function parseTextBibleEntries(entries, sourceName) {
  const template = loadTemplateBible();
  if (entries.length !== EXPECTED_BOOK_COUNT) {
    throw new Error(`TXT 성경 파일 수가 ${entries.length}개입니다. ${EXPECTED_BOOK_COUNT}권이 필요합니다.`);
  }

  const books = entries.map((entry, index) => {
    const bookMeta = template.books[index];
    const bookPattern = [bookMeta.abbr, bookMeta.name].map(escapeRegExp).join('|');
    const versePattern = new RegExp(`^(?:${bookPattern})\\s*(\\d+)\\s*[:：]\\s*(\\d+)\\s*(.*)$`);
    const chapters = new Map();
    let currentVerse = null;

    for (const rawLine of decodeTextBuffer(entry.buffer).replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')) {
      const line = rawLine.trim();
      if (!line) continue;

      const match = line.match(versePattern);
      if (match) {
        const chapterNum = Number(match[1]);
        const verseNum = Number(match[2]);
        const text = String(match[3] || '').trim();
        if (!chapters.has(chapterNum)) {
          chapters.set(chapterNum, []);
        }
        currentVerse = { num: verseNum, text };
        chapters.get(chapterNum).push(currentVerse);
        continue;
      }

      if (currentVerse && !/^\d+\s*[:：]\s*\d+/.test(line)) {
        currentVerse.text = `${currentVerse.text} ${line}`.trim();
      }
    }

    return {
      num: bookMeta.num,
      id: bookMeta.id,
      name: bookMeta.name,
      abbr: bookMeta.abbr,
      testament: bookMeta.testament,
      chapters: [...chapters.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([num, verses]) => ({
          num,
          verses: verses
            .filter((verse) => Number.isFinite(verse.num) && verse.text.trim())
            .sort((a, b) => a.num - b.num),
        })),
    };
  });

  return {
    version: {
      id: 'nkrv',
      name: '개역개정',
      year: 2011,
      copyright: '교회가 보유하거나 사용 허가를 받은 로컬 텍스트 자료',
      source: sourceName,
    },
    books,
  };
}

async function installFromZip(zipPath, outPath) {
  if (!fs.existsSync(zipPath)) {
    throw new Error(`성경 ZIP 파일을 찾을 수 없습니다: ${zipPath}`);
  }

  const files = listZipFiles(zipPath);
  const textFiles = files.filter((name) => /\.txt$/i.test(name));
  const jsonFiles = files.filter((name) => /\.json$/i.test(name) && !name.includes('/.obsidian/'));
  const diagnostics = {
    entries: files.length,
    textEntries: textFiles.length,
    jsonEntries: jsonFiles.length,
    sampleEntries: files.slice(0, 8),
  };

  for (const filename of jsonFiles) {
    try {
      const data = JSON.parse(readZipEntry(zipPath, filename));
      const validation = validateBibleData(data);
      if (validation.ok) {
        writePack(outPath, data, `${path.basename(zipPath)}:${filename}`);
        return;
      }
    } catch {
      // Keep looking for a valid Bible JSON entry.
    }
  }

  if (textFiles.length >= EXPECTED_BOOK_COUNT) {
    const entries = await readZipBinaryEntries(zipPath);
    if (entries.length === EXPECTED_BOOK_COUNT) {
      const data = parseTextBibleEntries(entries, path.basename(zipPath));
      writePack(outPath, data, path.basename(zipPath));
      return;
    }
  }

  throw new Error(
    [
      '설치 가능한 성경 본문 JSON을 ZIP 안에서 찾지 못했습니다.',
      `entries=${diagnostics.entries}, textEntries=${diagnostics.textEntries}, jsonEntries=${diagnostics.jsonEntries}`,
      `sample=${diagnostics.sampleEntries.join(', ')}`,
      '필요 형식: JSON 성경팩 또는 66권 TXT 묶음(각 줄: 책장:절 본문)',
    ].join('\n')
  );
}

async function main() {
  const zipPath = path.resolve(readArg('--zip', findDefaultZip()));
  const outPath = path.resolve(readArg('--out', DEFAULT_OUT));

  if (hasFlag('--from-existing-krv')) {
    installFromExistingKrv(outPath);
    return;
  }

  await installFromZip(zipPath, outPath);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
