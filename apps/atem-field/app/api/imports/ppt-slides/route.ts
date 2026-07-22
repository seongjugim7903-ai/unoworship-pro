import { NextRequest, NextResponse } from 'next/server';
import { execFile } from 'child_process';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { promisify } from 'util';
import type { SavedProgram } from '@/lib/generators/programTypes';

export const runtime = 'nodejs';

const execFileAsync = promisify(execFile);
const PROJECT_ROOT = process.cwd();
// 소스 스캔 폴더: 사용자 다운로드 폴더(요청). 아카이브·출력 경로는 기존 그대로 유지한다.
const INBOX_DIR = path.join(os.homedir(), 'Downloads');
const INBOX_ARCHIVE_DIR = path.join(PROJECT_ROOT, 'generator', 'ppt-slides', 'inbox', 'archive');
const GENERATED_DIR = path.join(PROJECT_ROOT, 'generator', 'ppt-slides', 'generated');
const DATA_PROGRAMS_DIR = path.join(PROJECT_ROOT, 'data', 'programs');
const PUBLIC_SLIDES_DIR = path.join(PROJECT_ROOT, 'public', 'generated', 'ppt-slides');
const PUBLIC_SLIDES_BASE = '/generated/ppt-slides';
const FILES_DIR = path.join(PROJECT_ROOT, 'FILES');
const FILE_LIBRARY_DIRS = {
  hymns: path.join(FILES_DIR, '01_HYMNS'),
  praise: path.join(FILES_DIR, '02_PRAISE'),
} as const;
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp']);
const PRESENTATION_EXTENSIONS = new Set(['.ppt', '.pptx']);
const collator = new Intl.Collator('ko', { numeric: true, sensitivity: 'base' });

type LibraryType = keyof typeof FILE_LIBRARY_DIRS;
type KeyMode = 'none' | 'luma-invert';

interface ImportSource {
  id: string;
  type: 'image-folder' | 'presentation';
  name: string;
  imageCount: number;
  updatedAt: number;
}

function safeSegment(value: string, fallback = 'slides'): string {
  const normalized = String(value || '')
    .normalize('NFC')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9가-힣_-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return normalized || fallback;
}

function isImageFile(fileName: string): boolean {
  return IMAGE_EXTENSIONS.has(path.extname(fileName).toLowerCase());
}

function isPresentationFile(fileName: string): boolean {
  return PRESENTATION_EXTENSIONS.has(path.extname(fileName).toLowerCase());
}

function todayYYYYMMDD(): string {
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('');
}

function formatDateLabel(yyyymmdd: string): string {
  return `${yyyymmdd.slice(0, 4)}.${yyyymmdd.slice(4, 6)}.${yyyymmdd.slice(6, 8)}`;
}

function buildPublicUrl(assetFolder: string, fileName: string): string {
  return `${PUBLIC_SLIDES_BASE}/${encodeURIComponent(assetFolder)}/${encodeURIComponent(fileName)}`;
}

async function ensureDirs() {
  await Promise.all([
    fs.mkdir(INBOX_DIR, { recursive: true }),
    fs.mkdir(INBOX_ARCHIVE_DIR, { recursive: true }),
    fs.mkdir(GENERATED_DIR, { recursive: true }),
    fs.mkdir(DATA_PROGRAMS_DIR, { recursive: true }),
    fs.mkdir(PUBLIC_SLIDES_DIR, { recursive: true }),
    fs.mkdir(FILE_LIBRARY_DIRS.hymns, { recursive: true }),
    fs.mkdir(FILE_LIBRARY_DIRS.praise, { recursive: true }),
  ]);
}

async function listImageFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && isImageFile(entry.name))
    .map((entry) => path.join(dir, entry.name))
    .sort((a, b) => collator.compare(path.basename(a), path.basename(b)));
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function findExecutable(candidates: Array<string | undefined>): Promise<string | null> {
  for (const candidate of candidates) {
    if (!candidate) continue;
    if (candidate.includes('/') && await pathExists(candidate)) return candidate;
    if (!candidate.includes('/')) {
      try {
        const { stdout } = await execFileAsync('/usr/bin/which', [candidate], {
          timeout: 5_000,
          encoding: 'utf-8',
        });
        const resolved = stdout.trim().split('\n')[0];
        if (resolved && await pathExists(resolved)) return resolved;
      } catch {
        // PATH에 없는 명령은 다음 후보를 확인한다.
      }
    }
  }
  return null;
}

async function listSources(): Promise<ImportSource[]> {
  await fs.mkdir(INBOX_DIR, { recursive: true });
  const entries = await fs.readdir(INBOX_DIR, { withFileTypes: true });
  const sources: ImportSource[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name === 'archive') continue;
    const sourcePath = path.join(INBOX_DIR, entry.name);
    const images = await listImageFiles(sourcePath);
    if (images.length === 0) continue;
    const stat = await fs.stat(sourcePath);
    sources.push({
      id: entry.name,
      type: 'image-folder',
      name: entry.name,
      imageCount: images.length,
      updatedAt: stat.mtimeMs,
    });
  }

  for (const entry of entries) {
    if (!entry.isFile() || !isPresentationFile(entry.name)) continue;
    const sourcePath = path.join(INBOX_DIR, entry.name);
    const stat = await fs.stat(sourcePath);
    sources.push({
      id: entry.name,
      type: 'presentation',
      name: entry.name.replace(/\.(pptx?|PPTX?)$/, ''),
      imageCount: 0,
      updatedAt: stat.mtimeMs,
    });
  }

  sources.sort((a, b) => b.updatedAt - a.updatedAt);
  return sources;
}

function resolveInboxSource(sourceId: string, sourceType: 'image-folder' | 'presentation'): string | null {
  const basename = path.basename(sourceId);
  if (!basename || basename !== sourceId || basename.includes('..')) return null;
  const sourcePath = path.join(INBOX_DIR, basename);
  if (sourceType === 'presentation' && !isPresentationFile(basename)) return null;
  return sourcePath;
}

function resolveLibraryType(value: unknown): LibraryType {
  return value === 'hymns' ? 'hymns' : 'praise';
}

function resolveKeyMode(value: unknown): KeyMode {
  return value === 'luma-invert' ? 'luma-invert' : 'none';
}

function compactTimestamp(date = new Date()): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
    '-',
    String(date.getHours()).padStart(2, '0'),
    String(date.getMinutes()).padStart(2, '0'),
    String(date.getSeconds()).padStart(2, '0'),
  ].join('');
}

async function getUniquePath(dir: string, baseName: string): Promise<string> {
  let target = path.join(dir, baseName);
  if (!await pathExists(target)) return target;

  const parsed = path.parse(baseName);
  for (let i = 2; i < 1000; i += 1) {
    target = path.join(dir, `${parsed.name}-${i}${parsed.ext}`);
    if (!await pathExists(target)) return target;
  }

  throw new Error('고유한 아카이브 파일명을 만들지 못했습니다.');
}

function getDuplicateTitleIndex(title: string, baseTitle: string): number | null {
  const normalizedTitle = title.trim();
  if (normalizedTitle === baseTitle) return 0;
  const prefix = `${baseTitle} (`;
  if (!normalizedTitle.startsWith(prefix) || !normalizedTitle.endsWith(')')) return null;
  const suffix = normalizedTitle.slice(prefix.length, -1);
  if (!/^\d+$/.test(suffix)) return null;
  return Number(suffix);
}

async function resolveUniqueSlideProgramTitle(baseTitle: string): Promise<string> {
  await fs.mkdir(DATA_PROGRAMS_DIR, { recursive: true });
  const files = await fs.readdir(DATA_PROGRAMS_DIR);
  const used = new Set<number>();

  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    try {
      const raw = await fs.readFile(path.join(DATA_PROGRAMS_DIR, file), 'utf-8');
      const program = JSON.parse(raw) as Partial<SavedProgram>;
      if (program.type !== 'slide-images') continue;
      const title = program.item?.title;
      if (typeof title !== 'string') continue;
      const index = getDuplicateTitleIndex(title, baseTitle);
      if (index !== null) used.add(index);
    } catch {
      // 손상된 기존 프로그램 파일은 중복 제목 판단에서 제외한다.
    }
  }

  if (!used.has(0)) return baseTitle;
  for (let i = 1; i < 1000; i += 1) {
    if (!used.has(i)) return `${baseTitle} (${i})`;
  }
  throw new Error('고유한 프로그램 제목을 만들지 못했습니다.');
}

async function archiveInboxSource(sourcePath: string, programId: string): Promise<string> {
  const dayDir = path.join(INBOX_ARCHIVE_DIR, todayYYYYMMDD());
  await fs.mkdir(dayDir, { recursive: true });

  const sourceName = path.basename(sourcePath);
  const archiveName = `${compactTimestamp()}__${programId}__${sourceName}`;
  const archivePath = await getUniquePath(dayDir, archiveName);
  await fs.rename(sourcePath, archivePath);
  return archivePath;
}

async function writeFileLibraryPackage(params: {
  libraryType: LibraryType;
  program: SavedProgram;
  programJson: string;
  assetDir: string;
  slideFileNames: string[];
}): Promise<string> {
  const libraryDir = FILE_LIBRARY_DIRS[params.libraryType];
  const packageDir = path.join(libraryDir, params.program.id);
  const slidesDir = path.join(packageDir, 'slides');

  await fs.mkdir(slidesDir, { recursive: true });
  await fs.writeFile(path.join(packageDir, 'program.json'), params.programJson, 'utf-8');

  await Promise.all(
    params.slideFileNames.map((fileName) =>
      fs.copyFile(path.join(params.assetDir, fileName), path.join(slidesDir, fileName))
    )
  );

  return packageDir;
}

async function convertPresentationToImages(sourceFile: string, workDir: string): Promise<string[]> {
  await fs.mkdir(workDir, { recursive: true });
  const pdfDir = path.join(workDir, 'pdf');
  const pngDir = path.join(workDir, 'png');
  await fs.mkdir(pdfDir, { recursive: true });
  await fs.mkdir(pngDir, { recursive: true });

  const soffice = await findExecutable([
    process.env.LIBREOFFICE_PATH,
    '/Applications/LibreOffice.app/Contents/MacOS/soffice',
    '/Users/kimseongju/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/override/soffice',
    '/Users/kimseongju/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/soffice',
    'soffice',
  ]);
  if (!soffice) {
    throw new Error('LibreOffice 변환 엔진을 찾지 못했습니다.');
  }

  await execFileAsync(
    soffice,
    ['--headless', '--convert-to', 'pdf', '--outdir', pdfDir, sourceFile],
    { timeout: 120_000, maxBuffer: 1024 * 1024 * 4 }
  );

  const pdfFiles = (await fs.readdir(pdfDir))
    .filter((file) => file.toLowerCase().endsWith('.pdf'))
    .sort((a, b) => collator.compare(a, b));
  const pdfPath = pdfFiles[0] ? path.join(pdfDir, pdfFiles[0]) : '';
  if (!pdfPath) {
    throw new Error('PPT를 PDF로 변환하지 못했습니다.');
  }

  const pdftoppm = await findExecutable([
    process.env.PDFTOPPM_PATH,
    '/Users/kimseongju/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/override/pdftoppm',
    '/Users/kimseongju/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/pdftoppm',
    'pdftoppm',
  ]);
  if (!pdftoppm) {
    throw new Error('PDF 이미지 변환 엔진을 찾지 못했습니다.');
  }

  await execFileAsync(
    pdftoppm,
    ['-png', '-r', '144', pdfPath, path.join(pngDir, 'slide')],
    { timeout: 120_000, maxBuffer: 1024 * 1024 * 4 }
  );

  const pngFiles = (await fs.readdir(pngDir))
    .filter((file) => file.toLowerCase().endsWith('.png'))
    .map((file) => path.join(pngDir, file))
    .sort((a, b) => collator.compare(path.basename(a), path.basename(b)));
  if (pngFiles.length === 0) {
    throw new Error('PPT 슬라이드 이미지를 생성하지 못했습니다.');
  }
  return pngFiles;
}

async function readImageSize(filePath: string): Promise<{ width: number; height: number }> {
  const buffer = await fs.readFile(filePath);
  const ext = path.extname(filePath).toLowerCase();

  if (ext === '.png' && buffer.length >= 24 && buffer.toString('ascii', 1, 4) === 'PNG') {
    return {
      width: buffer.readUInt32BE(16),
      height: buffer.readUInt32BE(20),
    };
  }

  if ((ext === '.jpg' || ext === '.jpeg') && buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset < buffer.length) {
      if (buffer[offset] !== 0xff) break;
      const marker = buffer[offset + 1];
      const length = buffer.readUInt16BE(offset + 2);
      if (marker >= 0xc0 && marker <= 0xc3 && offset + 8 < buffer.length) {
        return {
          width: buffer.readUInt16BE(offset + 7),
          height: buffer.readUInt16BE(offset + 5),
        };
      }
      offset += 2 + length;
    }
  }

  return { width: 1920, height: 1080 };
}

export async function GET() {
  try {
    const sources = await listSources();
    return NextResponse.json({ sources, inboxDir: INBOX_DIR });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to list PPT image folders', detail: String(error) },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      sourceId?: string;
      sourceType?: 'image-folder' | 'presentation';
      name?: string;
      worshipId?: string;
      worshipName?: string;
      fit?: 'fill' | 'contain' | 'cover';
      libraryType?: LibraryType;
      keyMode?: KeyMode;
    };

    const sourceId = body.sourceId ?? '';
    const sourceType = body.sourceType === 'presentation' ? 'presentation' : 'image-folder';
    const sourcePath = resolveInboxSource(sourceId, sourceType);
    if (!sourcePath) {
      return NextResponse.json({ error: 'Invalid source' }, { status: 400 });
    }

    const date = todayYYYYMMDD();
    const now = Date.now();
    const fit = body.fit && ['fill', 'contain', 'cover'].includes(body.fit) ? body.fit : 'fill';
    const libraryType = resolveLibraryType(body.libraryType);
    const keyMode = resolveKeyMode(body.keyMode);
    const worshipId = safeSegment(body.worshipId || `${date}-이미지슬라이드`);
    const worshipName = body.worshipName || `${formatDateLabel(date)} 이미지 슬라이드`;

    // 변환 작업 디렉터리가 없는 초기 설치에서도 바로 동작하도록 먼저 보장한다.
    await ensureDirs();

    const requestedTitle = (body.name || sourceId.replace(/\.(pptx?|PPTX?)$/, '')).trim() || sourceId;
    const title = await resolveUniqueSlideProgramTitle(requestedTitle);
    const titleSlug = safeSegment(title);
    const programId = safeSegment(`slide-images-${date}-${titleSlug}-${now}`);
    const assetFolder = safeSegment(`${date}-${titleSlug}-${now}`);
    const assetDir = path.join(PUBLIC_SLIDES_DIR, assetFolder);

    const images = sourceType === 'presentation'
      ? await convertPresentationToImages(sourcePath, path.join(GENERATED_DIR, `${programId}-work`))
      : await listImageFiles(sourcePath);
    if (images.length === 0) {
      return NextResponse.json({ error: 'No slide images found' }, { status: 400 });
    }

    await fs.mkdir(assetDir, { recursive: true });

    const slideAssets = [];
    for (let i = 0; i < images.length; i += 1) {
      const source = images[i];
      const ext = path.extname(source).toLowerCase();
      const destName = `${String(i + 1).padStart(3, '0')}${ext}`;
      const size = await readImageSize(source);
      await fs.copyFile(source, path.join(assetDir, destName));
      slideAssets.push({
        index: i + 1,
        sourceName: path.basename(source),
        destName,
        url: buildPublicUrl(assetFolder, destName),
        width: size.width,
        height: size.height,
      });
    }

    const program: SavedProgram = {
      id: programId,
      type: 'slide-images',
      worshipId,
      worshipName,
      formData: {
        generator: 'ppt-slide-folder-v1',
        preserveElements: true,
        sourceLabel: sourceId,
        sourceType,
        sourceCount: images.length,
        assetFolder,
        libraryType,
        keyMode,
        fit,
        generatedAt: new Date(now).toISOString(),
      },
      item: {
        id: programId,
        title,
        promptLayout: 'none',
        sections: slideAssets.map((slide) => ({
          id: `${programId}-section-${String(slide.index).padStart(3, '0')}`,
          label: String(slide.index).padStart(2, '0'),
          text: '',
          colorMark: '#38bdf8',
          elements: [
            {
              id: `${programId}-image-${String(slide.index).padStart(3, '0')}`,
              type: 'image',
              src: slide.url,
              objectFit: fit,
              keyMode,
              x: 0,
              y: 0,
              width: 100,
              height: 100,
              rotation: 0,
              opacity: 1,
              zIndex: 0,
              locked: true,
              visible: true,
              imageMeta: {
                sourceName: slide.sourceName,
                naturalWidthPx: slide.width,
                naturalHeightPx: slide.height,
                assumedDpi: 72,
                hasEmbeddedDpi: false,
              },
            },
          ],
        })),
      },
      createdAt: now,
      updatedAt: now,
    };

    const programPath = path.join(DATA_PROGRAMS_DIR, `${programId}.json`);
    const manifestPath = path.join(GENERATED_DIR, `${programId}.json`);
    const json = `${JSON.stringify(program, null, 2)}\n`;
    const libraryPath = await writeFileLibraryPackage({
      libraryType,
      program,
      programJson: json,
      assetDir,
      slideFileNames: slideAssets.map((slide) => slide.destName),
    });
    await Promise.all([
      fs.writeFile(programPath, json, 'utf-8'),
      fs.writeFile(manifestPath, json, 'utf-8'),
    ]);

    let archivePath = '';
    let archiveError = '';
    try {
      archivePath = await archiveInboxSource(sourcePath, programId);
    } catch (error) {
      archiveError = error instanceof Error ? error.message : String(error);
    }

    return NextResponse.json({ program, libraryPath, archivePath, archiveError });
  } catch (error) {
    console.error('[api/imports/ppt-slides] import failed', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json(
      { error: 'Failed to import PPT image folder', detail: String(error) },
      { status: 500 }
    );
  }
}
