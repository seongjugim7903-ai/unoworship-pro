#!/usr/bin/env node

/**
 * PowerPoint/Keynote image slide generator for UnoLive field builds.
 *
 * Usage:
 *   npm run generate:ppt -- --source "/Users/kimseongju/Downloads/나의하나님_와이드" --name "나의 하나님"
 *   npm run generate:ppt -- --name "주일 찬양 PPT"
 *
 * If --source is omitted, the newest image folder in generator/ppt-slides/inbox
 * is used. The generator copies images to public/generated/ppt-slides and
 * writes a SavedProgram JSON into data/programs so the Composer server loader
 * can import it as a single program with one section per slide.
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, '../..');
const INBOX_DIR = path.join(SCRIPT_DIR, 'inbox');
const INBOX_ARCHIVE_DIR = path.join(INBOX_DIR, 'archive');
const GENERATED_DIR = path.join(SCRIPT_DIR, 'generated');
const DATA_PROGRAMS_DIR = path.join(PROJECT_ROOT, 'data', 'programs');
const PUBLIC_SLIDES_DIR = path.join(PROJECT_ROOT, 'public', 'generated', 'ppt-slides');
const PUBLIC_SLIDES_BASE = '/generated/ppt-slides';
const FILES_DIR = path.join(PROJECT_ROOT, 'FILES');
const FILE_LIBRARY_DIRS = {
  hymns: path.join(FILES_DIR, '01_HYMNS'),
  praise: path.join(FILES_DIR, '02_PRAISE'),
};
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp']);

const collator = new Intl.Collator('ko', { numeric: true, sensitivity: 'base' });

function parseArgs(argv) {
  const args = {
    source: '',
    name: '',
    date: '',
    worship: '',
    worshipName: '',
    programId: '',
    fit: 'fill',
    library: 'praise',
    keyMode: 'luma-invert',
    dryRun: false,
    positional: [],
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--source' || arg === '-s') {
      args.source = argv[++i] ?? '';
    } else if (arg === '--name' || arg === '-n') {
      args.name = argv[++i] ?? '';
    } else if (arg === '--date') {
      args.date = argv[++i] ?? '';
    } else if (arg === '--worship') {
      args.worship = argv[++i] ?? '';
    } else if (arg === '--worship-name') {
      args.worshipName = argv[++i] ?? '';
    } else if (arg === '--program-id') {
      args.programId = argv[++i] ?? '';
    } else if (arg === '--fit') {
      args.fit = argv[++i] ?? 'fill';
    } else if (arg === '--library') {
      args.library = argv[++i] ?? 'praise';
    } else if (arg === '--key-mode') {
      args.keyMode = argv[++i] ?? 'luma-invert';
    } else if (arg === '--dry-run') {
      args.dryRun = true;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      args.positional.push(arg);
    }
  }

  return args;
}

function printHelp() {
  console.log(`
UnoLive PPT image slide generator

Commands:
  npm run generate:ppt -- --source "/Users/kimseongju/Downloads/SLIDE_FOLDER" --name "PROGRAM_NAME"
  npm run generate:ppt -- --name "PROGRAM_NAME"

Options:
  --source, -s       Image folder path. If omitted, newest folder in generator/ppt-slides/inbox is used.
  --name, -n         Program title shown in Composer.
  --date            Worship date as YYYYMMDD. Default: today.
  --worship         Worship id. Default: YYYYMMDD-이미지슬라이드.
  --worship-name    Worship display name. Default: YYYY.MM.DD 이미지 슬라이드.
  --program-id      Exact program id. Default: generated from date/name/time.
  --fit             Image fit: fill, contain, cover. Default: fill.
  --library         Save package to FILES/01_HYMNS or FILES/02_PRAISE: hymns, praise. Default: praise.
  --key-mode        Image key render mode: luma-invert, none. Default: luma-invert.
  --dry-run         Show result without writing files.
`);
}

function todayYYYYMMDD() {
  const d = new Date();
  const y = String(d.getFullYear());
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

function formatDateISO(yyyymmdd) {
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}

function formatDateLabel(yyyymmdd) {
  return `${yyyymmdd.slice(0, 4)}.${yyyymmdd.slice(4, 6)}.${yyyymmdd.slice(6, 8)}`;
}

function safeSegment(value, fallback = 'slides') {
  const normalized = String(value || '')
    .normalize('NFC')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9가-힣_-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return normalized || fallback;
}

function compactTimestamp(date = new Date()) {
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

function isImageFile(fileName) {
  return IMAGE_EXTENSIONS.has(path.extname(fileName).toLowerCase());
}

async function pathExists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function getUniquePath(dir, baseName) {
  let target = path.join(dir, baseName);
  if (!await pathExists(target)) return target;

  const parsed = path.parse(baseName);
  for (let i = 2; i < 1000; i += 1) {
    target = path.join(dir, `${parsed.name}-${i}${parsed.ext}`);
    if (!await pathExists(target)) return target;
  }

  throw new Error('Could not create a unique archive path.');
}

async function listImageFilesFromDirectory(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && isImageFile(entry.name))
    .map((entry) => path.join(dir, entry.name))
    .sort((a, b) => collator.compare(path.basename(a), path.basename(b)));
}

async function findNewestInboxSource() {
  await fs.mkdir(INBOX_DIR, { recursive: true });
  const entries = await fs.readdir(INBOX_DIR, { withFileTypes: true });

  const candidates = [];
  for (const entry of entries) {
    const fullPath = path.join(INBOX_DIR, entry.name);
    if (entry.isDirectory()) {
      const images = await listImageFilesFromDirectory(fullPath);
      if (images.length > 0) {
        const stat = await fs.stat(fullPath);
        candidates.push({ path: fullPath, mtime: stat.mtimeMs, imageCount: images.length });
      }
    }
  }

  if (candidates.length > 0) {
    candidates.sort((a, b) => b.mtime - a.mtime);
    return candidates[0].path;
  }

  const looseImages = await listImageFilesFromDirectory(INBOX_DIR);
  if (looseImages.length > 0) return INBOX_DIR;
  return '';
}

async function resolveSources(args) {
  const rawSources = [];
  if (args.source) rawSources.push(args.source);
  rawSources.push(...args.positional);

  if (rawSources.length === 0) {
    const inboxSource = await findNewestInboxSource();
    if (inboxSource) rawSources.push(inboxSource);
  }

  if (rawSources.length === 0) {
    throw new Error(`No source found. Put a folder in ${INBOX_DIR} or pass --source.`);
  }

  const imageFiles = [];
  const sourceRoots = [];
  let sourceLabel = '';

  for (const raw of rawSources) {
    const resolved = path.resolve(raw);
    const stat = await fs.stat(resolved);
    sourceRoots.push(resolved);
    if (stat.isDirectory()) {
      sourceLabel ||= path.basename(resolved);
      imageFiles.push(...await listImageFilesFromDirectory(resolved));
    } else if (stat.isFile() && isImageFile(resolved)) {
      sourceLabel ||= path.basename(path.dirname(resolved));
      imageFiles.push(resolved);
    }
  }

  imageFiles.sort((a, b) => collator.compare(path.basename(a), path.basename(b)));

  if (imageFiles.length === 0) {
    throw new Error('No image files found. Supported: png, jpg, jpeg, webp.');
  }

  return { sourceLabel: sourceLabel || 'slides', imageFiles, sourceRoots };
}

async function readImageSize(filePath) {
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

function buildPublicUrl(assetFolder, fileName) {
  return `${PUBLIC_SLIDES_BASE}/${encodeURIComponent(assetFolder)}/${encodeURIComponent(fileName)}`;
}

function isInsideInbox(sourcePath) {
  const relative = path.relative(INBOX_DIR, sourcePath);
  return relative && !relative.startsWith('..') && !path.isAbsolute(relative) && !relative.split(path.sep).includes('archive');
}

async function archiveInboxSource(sourcePath, programId, date) {
  if (!isInsideInbox(sourcePath)) return '';

  const dayDir = path.join(INBOX_ARCHIVE_DIR, date);
  await fs.mkdir(dayDir, { recursive: true });
  const archiveName = `${compactTimestamp()}__${programId}__${path.basename(sourcePath)}`;
  const archivePath = await getUniquePath(dayDir, archiveName);
  await fs.rename(sourcePath, archivePath);
  return archivePath;
}

async function writeFileLibraryPackage({ library, program, programJson, assetDir, slideFileNames }) {
  const libraryDir = FILE_LIBRARY_DIRS[library] ?? FILE_LIBRARY_DIRS.praise;
  const packageDir = path.join(libraryDir, program.id);
  const slidesDir = path.join(packageDir, 'slides');

  await fs.mkdir(slidesDir, { recursive: true });
  await fs.writeFile(path.join(packageDir, 'program.json'), programJson, 'utf-8');

  await Promise.all(
    slideFileNames.map((fileName) =>
      fs.copyFile(path.join(assetDir, fileName), path.join(slidesDir, fileName))
    )
  );

  return packageDir;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!['fill', 'contain', 'cover'].includes(args.fit)) {
    throw new Error('--fit must be one of fill, contain, cover.');
  }
  if (!['hymns', 'praise'].includes(args.library)) {
    throw new Error('--library must be hymns or praise.');
  }
  if (!['luma-invert', 'none'].includes(args.keyMode)) {
    throw new Error('--key-mode must be luma-invert or none.');
  }

  const { sourceLabel, imageFiles, sourceRoots } = await resolveSources(args);
  const date = args.date || todayYYYYMMDD();
  if (!/^\d{8}$/.test(date)) throw new Error('--date must be YYYYMMDD.');

  const title = args.name || sourceLabel;
  const now = Date.now();
  const titleSlug = safeSegment(title);
  const worshipId = args.worship || `${date}-이미지슬라이드`;
  const worshipName = args.worshipName || `${formatDateLabel(date)} 이미지 슬라이드`;
  const programId = safeSegment(args.programId || `slide-images-${date}-${titleSlug}-${now}`);
  const assetFolder = safeSegment(`${date}-${titleSlug}-${now}`);
  const assetDir = path.join(PUBLIC_SLIDES_DIR, assetFolder);

  const copiedSlides = [];
  for (let i = 0; i < imageFiles.length; i += 1) {
    const source = imageFiles[i];
    const ext = path.extname(source).toLowerCase();
    const destName = `${String(i + 1).padStart(3, '0')}${ext}`;
    const url = buildPublicUrl(assetFolder, destName);
    const size = await readImageSize(source);
    copiedSlides.push({
      index: i + 1,
      source,
      destName,
      url,
      width: size.width,
      height: size.height,
    });
  }

  const sections = copiedSlides.map((slide) => ({
    id: `${programId}-section-${String(slide.index).padStart(3, '0')}`,
    label: String(slide.index).padStart(2, '0'),
    text: '',
    colorMark: '#38bdf8',
    elements: [
      {
        id: `${programId}-image-${String(slide.index).padStart(3, '0')}`,
        type: 'image',
        src: slide.url,
        objectFit: args.fit,
        keyMode: args.keyMode,
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
          sourceName: path.basename(slide.source),
          naturalWidthPx: slide.width,
          naturalHeightPx: slide.height,
          assumedDpi: 72,
          hasEmbeddedDpi: false,
        },
      },
    ],
  }));

  const program = {
    id: programId,
    type: 'slide-images',
    worshipId,
    worshipName,
    formData: {
      generator: 'ppt-slide-folder-v1',
      preserveElements: true,
      sourceLabel,
      sourceCount: imageFiles.length,
      assetFolder,
      libraryType: args.library,
      keyMode: args.keyMode,
      fit: args.fit,
      generatedAt: new Date(now).toISOString(),
    },
    item: {
      id: programId,
      title,
      promptLayout: 'none',
      sections,
    },
    createdAt: now,
    updatedAt: now,
  };

  const programPath = path.join(DATA_PROGRAMS_DIR, `${programId}.json`);
  const manifestPath = path.join(GENERATED_DIR, `${programId}.json`);

  console.log(`Source: ${sourceLabel}`);
  console.log(`Slides: ${copiedSlides.length}`);
  console.log(`Program: ${title}`);
  console.log(`Worship: ${worshipName} (${worshipId})`);
  console.log(`Asset folder: ${assetFolder}`);
  console.log(`Library: ${args.library === 'hymns' ? 'FILES/01_HYMNS' : 'FILES/02_PRAISE'}`);
  console.log(`Key mode: ${args.keyMode}`);

  if (args.dryRun) {
    console.log('Dry run only. No files written.');
    return;
  }

  await fs.mkdir(assetDir, { recursive: true });
  await fs.mkdir(DATA_PROGRAMS_DIR, { recursive: true });
  await fs.mkdir(GENERATED_DIR, { recursive: true });
  await fs.mkdir(FILE_LIBRARY_DIRS.hymns, { recursive: true });
  await fs.mkdir(FILE_LIBRARY_DIRS.praise, { recursive: true });

  for (const slide of copiedSlides) {
    await fs.copyFile(slide.source, path.join(assetDir, slide.destName));
  }

  const programJson = `${JSON.stringify(program, null, 2)}\n`;
  await fs.writeFile(programPath, programJson, 'utf-8');
  await fs.writeFile(manifestPath, programJson, 'utf-8');
  const libraryPath = await writeFileLibraryPackage({
    library: args.library,
    program,
    programJson,
    assetDir,
    slideFileNames: copiedSlides.map((slide) => slide.destName),
  });

  const archived = [];
  for (const sourceRoot of sourceRoots) {
    const archivePath = await archiveInboxSource(sourceRoot, programId, date);
    if (archivePath) archived.push(archivePath);
  }

  if (!await pathExists(programPath)) {
    throw new Error('Program file was not written.');
  }

  console.log('');
  console.log('Done.');
  console.log(`Saved program: ${programPath}`);
  console.log(`Saved manifest: ${manifestPath}`);
  console.log(`Saved library package: ${libraryPath}`);
  if (archived.length > 0) {
    console.log(`Archived source: ${archived.join(', ')}`);
  }
  console.log('Composer: open the server worship loader and import this program.');
}

main().catch((error) => {
  console.error('');
  console.error(`Generator failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
