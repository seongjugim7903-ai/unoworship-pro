import { createHash } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import type { ImageElement, ShapeElement, TextElement } from '@/lib/canvasTypes';
import type { SavedProgram } from '@/lib/generators/programTypes';

const BUCKET_FALLBACK = 'choir-generated-images';
const DATA_PROGRAMS_DIR = path.join(process.cwd(), 'data', 'programs');
const PUBLIC_ASSET_ROOT = path.join(process.cwd(), 'public', 'generated', 'choir-supabase');
const PUBLIC_ASSET_BASE = '/generated/choir-supabase';
const DEFAULT_CLOUD_API_BASE = 'https://unoworship-pro-eight.vercel.app/api';

export interface ChoirProgramCandidate {
  id: string;
  requestId: string;
  programId: string;
  title: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  sectionCount: number;
  imageCount: number;
}

export interface ImportChoirProgramOptions {
  requestId?: string;
  programId?: string;
  latest?: boolean;
}

export interface ImportChoirProgramResult {
  program: SavedProgram;
  filePath: string;
  imageCount: number;
  skippedImages: string[];
  sourceRequestId: string;
  sourceProgramId: string;
}

interface SupabaseConfig {
  url: string;
  serviceRoleKey: string;
}

interface ChoirProgramRow {
  id: string;
  request_id: string;
  created_at: string;
  updated_at: string;
  program_id: string;
  title: string;
  status: string;
  program_payload: RemoteChoirPayload;
}

interface ChoirRequestRow {
  id: string;
  service_date: string | null;
  service_type: string;
  song_title: string;
  composer: string;
  arranger: string;
  lyrics: string;
  section_count: number;
}

interface ChoirImageRow {
  section_index: number;
  label: string;
  bucket: string;
  storage_path: string;
  width: number;
  height: number;
  size_bytes: number;
  checksum: string | null;
}

interface RemoteChoirPayload {
  id?: string;
  type?: string;
  worshipId?: string;
  worshipName?: string;
  formData?: {
    storageBucket?: string;
    imagePaths?: string[];
    worshipType?: string;
    composer?: string;
    arranger?: string;
    [key: string]: unknown;
  };
  item?: {
    title?: string;
    sections?: Array<{
      id?: string;
      label?: string;
      text?: string;
      generatedImagePath?: string | null;
      [key: string]: unknown;
    }>;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

interface LocalImageAsset {
  sectionIndex: number;
  sourcePath: string;
  localUrl: string;
  width: number;
  height: number;
}

class ChoirImportConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ChoirImportConfigError';
  }
}

function getSupabaseConfig(): SupabaseConfig {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/+$/, '');
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || !serviceRoleKey) {
    throw new ChoirImportConfigError('Supabase URL 또는 service role key가 설정되어 있지 않습니다.');
  }

  return { url, serviceRoleKey };
}

function cloudApiBase(): string {
  return (process.env.UNOWORSHIP_PRO_CLOUD_API_BASE?.trim() || DEFAULT_CLOUD_API_BASE).replace(/\/+$/, '');
}

function safeSegment(value: string, fallback = 'choir'): string {
  const normalized = String(value || '')
    .normalize('NFC')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9가-힣_-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64);

  if (normalized) return normalized;
  return `${fallback}-${createHash('sha1').update(value || fallback).digest('hex').slice(0, 8)}`;
}

function buildQuery(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, String(value));
  }
  return search.toString();
}

async function supabaseRest<T>(resource: string, init: RequestInit = {}): Promise<T> {
  const { url, serviceRoleKey } = getSupabaseConfig();
  const response = await fetch(`${url}/rest/v1${resource}`, {
    ...init,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Supabase REST 요청 실패 (${response.status}) ${detail}`.trim());
  }

  if (response.status === 204) return undefined as T;
  return await response.json() as T;
}

function encodeStoragePath(storagePath: string): string {
  return storagePath.split('/').map(encodeURIComponent).join('/');
}

async function downloadStorageObject(bucket: string, storagePath: string): Promise<Buffer> {
  const { url, serviceRoleKey } = getSupabaseConfig();
  const response = await fetch(
    `${url}/storage/v1/object/${encodeURIComponent(bucket)}/${encodeStoragePath(storagePath)}`,
    {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      cache: 'no-store',
    },
  );

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`이미지 다운로드 실패 (${response.status}) ${storagePath} ${detail}`.trim());
  }

  return Buffer.from(await response.arrayBuffer());
}

async function fetchCloudChoirPrograms(limit = 30): Promise<ChoirProgramRow[]> {
  const response = await fetch(
    `${cloudApiBase()}/choir-programs?${buildQuery({
      limit: Math.max(1, Math.min(100, Math.floor(limit))),
    })}`,
    { cache: 'no-store' },
  );

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`UnoWorship Pro API 요청 실패 (${response.status}) ${detail}`.trim());
  }

  const body = await response.json().catch(() => null) as {
    ok?: boolean;
    programs?: ChoirProgramRow[];
    message?: string;
  } | null;

  if (!body?.ok || !Array.isArray(body.programs)) {
    throw new Error(body?.message || 'UnoWorship Pro API 응답을 읽지 못했습니다.');
  }

  return body.programs;
}

function matchChoirProgramRow(row: ChoirProgramRow, options: ImportChoirProgramOptions): boolean {
  if (options.requestId && row.request_id !== options.requestId) return false;
  if (options.programId && row.program_id !== options.programId) return false;
  return true;
}

function dateKeyFromRequest(row: ChoirRequestRow | null, fallbackIso: string): string {
  const raw = row?.service_date ?? fallbackIso.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw.replaceAll('-', '');
  return new Date().toISOString().slice(0, 10).replaceAll('-', '');
}

function dateKeyFromPayload(payload: RemoteChoirPayload, fallbackIso: string): string {
  const candidates = [
    payload.worshipId,
    payload.id,
    payload.formData?.requestId,
    fallbackIso,
  ].map((value) => String(value ?? ''));

  for (const value of candidates) {
    const compact = value.match(/\b(20\d{6})\b/);
    if (compact?.[1]) return compact[1];

    const dashed = value.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
    if (dashed) return `${dashed[1]}${dashed[2]}${dashed[3]}`;
  }

  return new Date().toISOString().slice(0, 10).replaceAll('-', '');
}

function dateKeyFromProgram(row: ChoirProgramRow, requestRow: ChoirRequestRow | null): string {
  if (requestRow?.service_date) return dateKeyFromRequest(requestRow, row.created_at);
  return dateKeyFromPayload(row.program_payload, row.created_at);
}

function formatWorshipName(row: ChoirRequestRow | null, fallbackPayload: RemoteChoirPayload): string {
  if (fallbackPayload.worshipName) return fallbackPayload.worshipName;
  const serviceType = row?.service_type || fallbackPayload.formData?.worshipType || '주일낮예배';
  const date = row?.service_date && /^\d{4}-\d{2}-\d{2}$/.test(row.service_date)
    ? row.service_date.replaceAll('-', '.')
    : new Date().toISOString().slice(0, 10).replaceAll('-', '.');
  return `${date} ${serviceType}`;
}

function buildHephzibahProgramId(title: string, dateKey: string): string {
  return `헵시바-${safeSegment(title, '찬양대')}-${dateKey}`;
}

function parseLyricSections(lyrics: string): string[] {
  return lyrics
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean);
}

function sourceSectionTexts(payload: RemoteChoirPayload, requestRow: ChoirRequestRow | null): string[] {
  const fromPayload = payload.item?.sections
    ?.map((section) => String(section.text ?? '').trim())
    .filter(Boolean) ?? [];
  if (fromPayload.length) return fromPayload;
  return parseLyricSections(requestRow?.lyrics ?? '');
}

function twoLineMainText(value: string): string {
  const lines = value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.slice(0, 2).join('\n');
}

function makeMainTextElement(sectionId: string, text: string): TextElement {
  return {
    id: `${sectionId}__main_lyrics`,
    type: 'text',
    content: twoLineMainText(text),
    linked: true,
    fieldRole: 'body',
    fontFamily: 'Nanum Square Neo',
    fontSize: 76,
    fontWeight: 900,
    fontStyle: 'normal',
    textAlign: 'left',
    verticalAlign: 'middle',
    lineHeight: 1.28,
    letterSpacing: 0,
    color: '#ffffff',
    strokeColor: '#000000',
    strokeWidth: 5,
    useGradient: false,
    gradient: {
      type: 'linear',
      angle: 90,
      stops: [
        { offset: 0, color: '#ffffff' },
        { offset: 1, color: '#ffffff' },
      ],
    },
    autoWidth: false,
    autoHeight: false,
    autoFit: true,
    useShadow: true,
    shadow: {
      color: '#00000099',
      offsetX: 3,
      offsetY: 3,
      blur: 7,
    },
    x: 5,
    y: 70,
    width: 90,
    height: 20,
    rotation: 0,
    opacity: 1,
    zIndex: 5,
    locked: false,
    visible: true,
    layerRole: 'lyrics',
    visibleOn: ['output', 'broadcast'],
  };
}

function makePromptFallbackElements(sectionId: string, text: string): Array<ShapeElement | TextElement> {
  return [
    {
      id: `${sectionId}__prompt_bg`,
      type: 'shape',
      shapeType: 'rect',
      fill: '#000000',
      fillOpacity: 1,
      stroke: 'transparent',
      strokeWidth: 0,
      cornerRadius: 0,
      useGradient: false,
      gradient: {
        type: 'linear',
        angle: 90,
        stops: [
          { offset: 0, color: '#000000' },
          { offset: 1, color: '#000000' },
        ],
      },
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      rotation: 0,
      opacity: 1,
      zIndex: 0,
      locked: true,
      visible: true,
      layerRole: 'background',
      visibleOn: ['prompt'],
    },
    {
      id: `${sectionId}__prompt_text`,
      type: 'text',
      content: text,
      linked: true,
      fieldRole: 'body',
      fontFamily: 'Nanum Square Neo',
      fontSize: 92,
      fontWeight: 900,
      fontStyle: 'normal',
      textAlign: 'center',
      verticalAlign: 'middle',
      lineHeight: 1.32,
      letterSpacing: 0,
      color: '#ffffff',
      strokeColor: '#000000',
      strokeWidth: 4,
      useGradient: false,
      gradient: {
        type: 'linear',
        angle: 90,
        stops: [
          { offset: 0, color: '#ffffff' },
          { offset: 1, color: '#ffffff' },
        ],
      },
      autoWidth: false,
      autoHeight: false,
      autoFit: true,
      x: 5,
      y: 34,
      width: 90,
      height: 30,
      rotation: 0,
      opacity: 1,
      zIndex: 2,
      locked: false,
      visible: true,
      layerRole: 'lyrics',
      visibleOn: ['prompt'],
    },
  ];
}

function makePromptImageElement(sectionId: string, asset: LocalImageAsset): ImageElement {
  return {
    id: `${sectionId}__prompt_image`,
    type: 'image',
    src: asset.localUrl,
    objectFit: 'fill',
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    rotation: 0,
    opacity: 1,
    zIndex: 1,
    locked: true,
    visible: true,
    layerRole: 'lyrics',
    visibleOn: ['prompt'],
    imageMeta: {
      sourceName: path.basename(asset.sourcePath),
      naturalWidthPx: asset.width || 1920,
      naturalHeightPx: asset.height || 1080,
      assumedDpi: 72,
      hasEmbeddedDpi: false,
    },
  };
}

async function fetchLatestProgram(options: ImportChoirProgramOptions): Promise<ChoirProgramRow> {
  const filters: Record<string, string | number | undefined> = {
    select: 'id,request_id,created_at,updated_at,program_id,title,status,program_payload',
    order: 'created_at.desc',
    limit: 1,
  };

  if (options.requestId) filters.request_id = `eq.${options.requestId}`;
  if (options.programId) filters.program_id = `eq.${options.programId}`;

  let rows: ChoirProgramRow[];
  try {
    rows = await supabaseRest<ChoirProgramRow[]>(`/choir_programs?${buildQuery(filters)}`, {
      method: 'GET',
    });
  } catch {
    rows = (await fetchCloudChoirPrograms(100)).filter((candidate) =>
      matchChoirProgramRow(candidate, options)
    );
  }

  const row = rows[0];
  if (!row) {
    throw new Error('가져올 찬양대 프로그램을 찾지 못했습니다.');
  }
  return row;
}

async function fetchRequestRow(requestId: string): Promise<ChoirRequestRow | null> {
  try {
    const rows = await supabaseRest<ChoirRequestRow[]>(
      `/choir_requests?${buildQuery({
        select: 'id,service_date,service_type,song_title,composer,arranger,lyrics,section_count',
        id: `eq.${requestId}`,
        limit: 1,
      })}`,
      { method: 'GET' },
    );
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

async function fetchImageRows(row: ChoirProgramRow): Promise<ChoirImageRow[]> {
  try {
    const imageRows = await supabaseRest<ChoirImageRow[]>(
      `/choir_generated_images?${buildQuery({
        select: 'section_index,label,bucket,storage_path,width,height,size_bytes,checksum',
        request_id: `eq.${row.request_id}`,
        order: 'section_index.asc',
      })}`,
      { method: 'GET' },
    );

    if (imageRows.length) return imageRows;
  } catch {
    // 현장 Mac의 Supabase 설정이 없거나 이전 프로젝트를 가리켜도
    // 클라우드 프로그램 payload의 가사/디자인으로 프로그램을 만들 수 있다.
  }

  const bucket = row.program_payload.formData?.storageBucket || BUCKET_FALLBACK;
  const imagePaths = row.program_payload.formData?.imagePaths ?? [];
  return imagePaths.map((storagePath, index) => ({
    section_index: index + 1,
    label: `${index + 1}번 섹션`,
    bucket,
    storage_path: storagePath,
    width: 1920,
    height: 1080,
    size_bytes: 0,
    checksum: null,
  }));
}

async function downloadImages(row: ChoirProgramRow, imageRows: ChoirImageRow[], localProgramId: string): Promise<{
  assets: LocalImageAsset[];
  skipped: string[];
}> {
  const assetFolder = safeSegment(localProgramId, 'choir-assets');
  const assetDir = path.join(PUBLIC_ASSET_ROOT, assetFolder);
  await fs.mkdir(assetDir, { recursive: true });

  const assets: LocalImageAsset[] = [];
  const skipped: string[] = [];

  for (const image of imageRows) {
    try {
      const buffer = await downloadStorageObject(image.bucket || BUCKET_FALLBACK, image.storage_path);
      const fileName = `${String(image.section_index).padStart(2, '0')}.png`;
      await fs.writeFile(path.join(assetDir, fileName), buffer);
      assets.push({
        sectionIndex: image.section_index,
        sourcePath: image.storage_path,
        localUrl: `${PUBLIC_ASSET_BASE}/${encodeURIComponent(assetFolder)}/${encodeURIComponent(fileName)}`,
        width: image.width,
        height: image.height,
      });
    } catch (error) {
      skipped.push(`${image.storage_path}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return { assets, skipped };
}

function buildLocalProgram(row: ChoirProgramRow, requestRow: ChoirRequestRow | null, assets: LocalImageAsset[]): SavedProgram {
  const payload = row.program_payload;
  const title = requestRow?.song_title || row.title || payload.item?.title || '찬양대 자막';
  const dateKey = dateKeyFromProgram(row, requestRow);
  const localProgramId = buildHephzibahProgramId(title, dateKey);
  const worshipId = payload.worshipId || `choir-${dateKey}`;
  const worshipName = formatWorshipName(requestRow, payload);
  const sectionTexts = sourceSectionTexts(payload, requestRow);
  const sectionCount = Math.max(sectionTexts.length, assets.length);
  const now = Date.now();

  const program: SavedProgram = {
    id: localProgramId,
    type: 'slide-images',
    worshipId,
    worshipName,
    formData: {
      ...(payload.formData ?? {}),
      generator: 'choir-supabase-import-v1',
      preserveElements: true,
      source: 'unoworship-pro-supabase',
      sourceRequestId: row.request_id,
      sourceProgramId: row.program_id,
      sourceTitle: title,
      promptTemplateName: 'pmt-black-white',
      mainTemplateName: 'white-two-line-left',
      mainTextPolicy: 'two-lines-left-output-broadcast',
      promptPolicy: 'supabase-generated-image-prompt-only',
      importedAt: new Date(now).toISOString(),
      localImageUrls: assets.map((asset) => asset.localUrl),
    },
    item: {
      id: localProgramId,
      title: `헵시바 선교단 - ${title}`,
      promptLayout: 'black-white',
      sections: Array.from({ length: sectionCount }, (_, index) => {
        const sectionIndex = index + 1;
        const sectionId = `${localProgramId}-section-${String(sectionIndex).padStart(3, '0')}`;
        const text = sectionTexts[index] ?? '';
        const asset = assets.find((candidate) => candidate.sectionIndex === sectionIndex);
        const promptElements = asset
          ? [makePromptImageElement(sectionId, asset)]
          : makePromptFallbackElements(sectionId, text);

        return {
          id: sectionId,
          label: String(sectionIndex),
          text,
          colorMark: '#ffffff',
          elements: [
            ...promptElements,
            makeMainTextElement(sectionId, text),
          ],
        };
      }),
    },
    createdAt: now,
    updatedAt: now,
  };

  return program;
}

async function markImported(row: ChoirProgramRow, filePath: string): Promise<void> {
  try {
    await supabaseRest(
      `/choir_programs?${buildQuery({ id: `eq.${row.id}` })}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          imported_at: new Date().toISOString(),
          imported_program_file: path.basename(filePath),
        }),
      },
      );
  } catch {
    // 현장 저장은 성공했으므로 Supabase 상태 업데이트 실패는 가져오기를 막지 않는다.
  }
}

export async function listChoirProgramCandidates(limit = 30): Promise<ChoirProgramCandidate[]> {
  let rows: ChoirProgramRow[];
  try {
    rows = await supabaseRest<ChoirProgramRow[]>(
      `/choir_programs?${buildQuery({
        select: 'id,request_id,created_at,updated_at,program_id,title,status,program_payload',
        order: 'created_at.desc',
        limit: Math.max(1, Math.min(100, Math.floor(limit))),
      })}`,
      { method: 'GET' },
    );
  } catch {
    rows = await fetchCloudChoirPrograms(limit);
  }

  return rows.map((row) => {
    const sections = row.program_payload.item?.sections ?? [];
    const imagePaths = row.program_payload.formData?.imagePaths ?? [];
    return {
      id: row.id,
      requestId: row.request_id,
      programId: row.program_id,
      title: row.title,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      sectionCount: sections.length,
      imageCount: imagePaths.length,
    };
  });
}

export async function importChoirProgramFromSupabase(
  options: ImportChoirProgramOptions = {},
): Promise<ImportChoirProgramResult> {
  const row = await fetchLatestProgram(options);
  const requestRow = await fetchRequestRow(row.request_id);
  const imageRows = await fetchImageRows(row);
  const title = requestRow?.song_title || row.title || row.program_payload.item?.title || '찬양대 자막';
  const localProgramId = buildHephzibahProgramId(title, dateKeyFromProgram(row, requestRow));
  const { assets, skipped } = await downloadImages(row, imageRows, localProgramId);
  const program = buildLocalProgram(row, requestRow, assets);

  await fs.mkdir(DATA_PROGRAMS_DIR, { recursive: true });
  const filePath = path.join(DATA_PROGRAMS_DIR, `${program.id}.json`);
  await fs.writeFile(filePath, `${JSON.stringify(program, null, 2)}\n`, 'utf-8');
  await markImported(row, filePath);

  return {
    program,
    filePath,
    imageCount: assets.length,
    skippedImages: skipped,
    sourceRequestId: row.request_id,
    sourceProgramId: row.program_id,
  };
}
