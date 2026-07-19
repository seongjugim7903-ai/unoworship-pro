import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildChoirProgramPayload, parseLyricSections } from '../../../lib/choirProgramPayload';
import {
  ensureSupabaseBucket,
  SupabaseServerConfigError,
  supabaseRest,
  uploadSupabaseObject,
} from '../../../lib/supabase/server';

export const runtime = 'nodejs';

const BUCKET_NAME = 'choir-generated-images';

const ChoirRequestSchema = z.object({
  serviceType: z.string().trim().min(1).default('주일낮예배'),
  serviceDate: z.string().trim().optional().default(''),
  songTitle: z.string().trim().min(1, '곡명을 입력해 주세요.'),
  composer: z.string().trim().optional().default(''),
  arranger: z.string().trim().optional().default(''),
  lyrics: z.string().trim().min(1, '가사를 입력해 주세요.'),
  note: z.string().trim().optional().default(''),
  source: z.string().trim().optional().default('unoworship-pro'),
});

interface ChoirRequestRow {
  id: string;
}

interface GeneratedImageRow {
  id: string;
  storage_path: string;
  section_index: number;
}

function formatStorageDate(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return new Date().toISOString().slice(0, 10);
}

function sanitizePathSegment(value: string) {
  const asciiSlug = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);

  if (asciiSlug) return asciiSlug;

  const digest = createHash('sha1').update(value).digest('hex').slice(0, 12);
  return `choir-${digest}`;
}

async function readPayload(formData: FormData) {
  const rawPayload = formData.get('payload');
  if (typeof rawPayload !== 'string') {
    throw new Error('payload가 없습니다.');
  }

  return ChoirRequestSchema.parse(JSON.parse(rawPayload));
}

function getImageFiles(formData: FormData) {
  return [...formData.entries()]
    .filter(([key, value]) => key.startsWith('image-') && value instanceof File)
    .sort(([left], [right]) => left.localeCompare(right, 'ko-KR', { numeric: true }))
    .map(([, value]) => value as File);
}

function jsonError(message: string, status: number, code = 'CHOIR_REQUEST_SAVE_FAILED') {
  return NextResponse.json({ ok: false, code, message }, { status });
}

function clampLimit(value: string | null) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 20;
  return Math.max(1, Math.min(50, Math.floor(parsed)));
}

function normalizeSearch(value: string | null) {
  return String(value ?? '')
    .trim()
    .replace(/[(),]/g, ' ')
    .replace(/\*/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, 80);
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const limit = clampLimit(url.searchParams.get('limit'));
    const search = normalizeSearch(url.searchParams.get('search'));
    const params = new URLSearchParams({
      select: 'id,created_at,updated_at,service_date,service_type,song_title,composer,arranger,lyrics,note,section_count,status',
      order: 'updated_at.desc',
      limit: String(limit),
    });

    if (search) {
      const pattern = `*${search}*`;
      params.set('or', `(song_title.ilike.${pattern},composer.ilike.${pattern},arranger.ilike.${pattern})`);
    }

    const rows = await supabaseRest(
      `/choir_requests?${params.toString()}`,
      { method: 'GET' },
    );

    return NextResponse.json({ ok: true, requests: rows });
  } catch (error) {
    console.error('[choir-requests] list failed', error);

    if (error instanceof SupabaseServerConfigError) {
      return jsonError(error.message, 503, error.code);
    }

    const message = error instanceof Error ? error.message : '지난 찬양대 요청을 불러오지 못했습니다.';
    return jsonError(message, 500, 'CHOIR_REQUEST_LIST_FAILED');
  }
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const payload = await readPayload(formData);
    const imageFiles = getImageFiles(formData);
    const sections = parseLyricSections(payload.lyrics);
    const sectionCount = sections.length || imageFiles.length;

    const [requestRow] = await supabaseRest<ChoirRequestRow[]>(
      '/choir_requests',
      {
        method: 'POST',
        body: JSON.stringify({
          service_date: payload.serviceDate || null,
          service_type: payload.serviceType,
          song_title: payload.songTitle,
          composer: payload.composer,
          arranger: payload.arranger,
          lyrics: payload.lyrics,
          note: payload.note,
          section_count: sectionCount,
          source: payload.source,
          status: imageFiles.length > 0 ? 'rendered' : 'text_saved',
          metadata: {
            appUrl: request.headers.get('origin') ?? null,
            savedBy: 'choir-request-page',
          },
        }),
      },
      { prefer: 'return=representation' },
    );

    const dateSegment = formatStorageDate(payload.serviceDate);
    const titleSegment = sanitizePathSegment(payload.songTitle);
    const imageRows: GeneratedImageRow[] = [];
    const imagePaths: string[] = [];

    if (imageFiles.length > 0) {
      await ensureSupabaseBucket({
        bucket: BUCKET_NAME,
        fileSizeLimit: 10_485_760,
        allowedMimeTypes: ['image/png', 'image/webp'],
      });
    }

    for (let index = 0; index < imageFiles.length; index += 1) {
      const file = imageFiles[index];
      const buffer = Buffer.from(await file.arrayBuffer());
      const checksum = createHash('sha256').update(buffer).digest('hex');
      const sectionIndex = index + 1;
      const contentType = file.type === 'image/webp' ? 'image/webp' : 'image/png';
      const extension = contentType === 'image/webp' ? 'webp' : 'png';
      const storagePath = [
        'choir',
        dateSegment,
        titleSegment,
        requestRow.id,
        `${String(sectionIndex).padStart(2, '0')}.${extension}`,
      ].join('/');

      await uploadSupabaseObject({
        bucket: BUCKET_NAME,
        path: storagePath,
        body: buffer,
        contentType,
        upsert: true,
      });

      imagePaths.push(storagePath);
      const [imageRow] = await supabaseRest<GeneratedImageRow[]>(
        '/choir_generated_images',
        {
          method: 'POST',
          body: JSON.stringify({
            request_id: requestRow.id,
            section_index: sectionIndex,
            label: `${sectionIndex}번 섹션`,
            bucket: BUCKET_NAME,
            storage_path: storagePath,
            content_type: contentType,
            size_bytes: buffer.byteLength,
            width: 1920,
            height: 1080,
            checksum,
            metadata: {
              originalFileName: file.name,
            },
          }),
        },
        { prefer: 'return=representation' },
      );
      imageRows.push(imageRow);
    }

    const programPayload = buildChoirProgramPayload({
      ...payload,
      requestId: requestRow.id,
      imagePaths,
      source: 'unoworship-pro-supabase',
    });

    await supabaseRest(
      '/choir_programs',
      {
        method: 'POST',
        body: JSON.stringify({
          request_id: requestRow.id,
          program_id: programPayload.id,
          title: payload.songTitle,
          program_payload: programPayload,
          status: 'ready',
        }),
      },
      { prefer: 'return=representation' },
    );

    return NextResponse.json({
      ok: true,
      requestId: requestRow.id,
      programId: programPayload.id,
      sectionCount,
      imageCount: imageRows.length,
      imagePaths,
    });
  } catch (error) {
    console.error('[choir-requests] save failed', error);

    if (error instanceof SupabaseServerConfigError) {
      return jsonError(error.message, 503, error.code);
    }

    if (error instanceof z.ZodError) {
      return jsonError(error.issues[0]?.message ?? '입력값을 확인해 주세요.', 400, 'INVALID_CHOIR_REQUEST');
    }

    const message = error instanceof Error ? error.message : '찬양대 요청 저장 중 오류가 발생했습니다.';
    return jsonError(message, 500);
  }
}
