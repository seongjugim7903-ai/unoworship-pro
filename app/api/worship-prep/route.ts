import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  deleteSupabaseObjects,
  ensureSupabaseBucket,
  SupabaseServerConfigError,
  supabaseRest,
  uploadSupabaseObject,
} from '../../../lib/supabase/server';

export const runtime = 'nodejs';

const BUCKET_NAME = 'worship-sheets';
const SHEET_EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

const SongSchema = z.object({
  title: z.string().trim().min(1, '찬양 제목을 입력해 주세요.'),
  songKey: z.string().trim().optional().default(''),
  arrangement: z.enum(['chorus_only', 'chorus_first', 'custom']).default('chorus_first'),
  arrangementCustom: z.string().trim().optional().default(''),
  /* 새 악보 파일이 있으면 이 키로 multipart에 함께 온다. */
  sheetKey: z.string().trim().optional(),
  /* 기존 악보를 그대로 재사용할 때의 경로. */
  sheetPath: z.string().trim().optional(),
  sheetContentType: z.string().trim().optional(),
});

const PrepSchema = z.object({
  serviceType: z.string().trim().min(1).default('주일낮예배'),
  serviceDate: z.string().trim().optional().default(''),
  team: z.string().trim().min(1).default('주일1부'),
  songs: z.array(SongSchema).min(1, '곡을 하나 이상 입력해 주세요.'),
  source: z.string().trim().optional().default('unoworship-pro'),
});

function jsonError(message: string, status: number, code = 'WORSHIP_PREP_SAVE_FAILED') {
  return NextResponse.json({ ok: false, code, message }, { status });
}

function clampLimit(value: string | null) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 40;
  return Math.max(1, Math.min(100, Math.floor(parsed)));
}

function formatDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : new Date().toISOString().slice(0, 10);
}

function sanitizeSegment(value: string) {
  const slug = value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  if (slug) return slug;
  return `s-${createHash('sha1').update(value).digest('hex').slice(0, 10)}`;
}

const SELECT_COLUMNS = 'id,created_at,service_date,service_type,team,song_order,title,song_key,arrangement,arrangement_custom,sheet_bucket,sheet_path,sheet_content_type';

function normalizeSearch(value: string | null) {
  return String(value ?? '').trim().replace(/[(),*]/g, ' ').replace(/\s+/g, ' ').slice(0, 60);
}

/* 검색 결과는 제목 라이브러리로 쓰이므로 제목 중복은 최신 1건만 남긴다. */
function dedupeByTitle(rows: Array<Record<string, unknown>>) {
  const seen = new Set<string>();
  const result: Array<Record<string, unknown>> = [];
  for (const row of rows) {
    const key = String(row.title ?? '').trim();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(row);
  }
  return result;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const limit = clampLimit(url.searchParams.get('limit'));
    const team = url.searchParams.get('team')?.trim();
    const search = normalizeSearch(url.searchParams.get('search'));
    const params = new URLSearchParams({ select: SELECT_COLUMNS, limit: String(limit) });

    if (search) {
      // 제목 검색 — 팀 무관 전체 라이브러리에서, 최신순.
      params.set('title', `ilike.*${search}*`);
      params.set('order', 'created_at.desc');
    } else {
      params.set('order', 'service_date.desc.nullslast,team.asc,song_order.asc');
      if (team) params.set('team', `eq.${team}`);
    }

    const rows = await supabaseRest<Array<Record<string, unknown>>>(`/worship_prep_songs?${params.toString()}`, { method: 'GET' });
    return NextResponse.json({ ok: true, songs: search ? dedupeByTitle(rows) : rows });
  } catch (error) {
    console.error('[worship-prep] list failed', error);
    if (error instanceof SupabaseServerConfigError) {
      return jsonError(error.message, 503, error.code);
    }
    const message = error instanceof Error ? error.message : '준비찬양 목록을 불러오지 못했습니다.';
    return jsonError(message, 500, 'WORSHIP_PREP_LIST_FAILED');
  }
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const rawPayload = formData.get('payload');
    if (typeof rawPayload !== 'string') {
      return jsonError('payload가 없습니다.', 400, 'NO_PAYLOAD');
    }
    const payload = PrepSchema.parse(JSON.parse(rawPayload));
    const dateSegment = formatDate(payload.serviceDate);
    const teamSegment = sanitizeSegment(payload.team);

    const hasNewSheet = payload.songs.some((song) => song.sheetKey && formData.get(song.sheetKey) instanceof File);
    if (hasNewSheet) {
      await ensureSupabaseBucket({
        bucket: BUCKET_NAME,
        fileSizeLimit: 10_485_760,
        allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'],
      });
    }

    /* 같은 (예배·일자·팀) 셋리스트를 재저장하면 기존 행/악보를 정리하고 새로 넣는다. */
    let deleteFilter = `service_type=eq.${encodeURIComponent(payload.serviceType)}&team=eq.${encodeURIComponent(payload.team)}`;
    deleteFilter += payload.serviceDate
      ? `&service_date=eq.${payload.serviceDate}`
      : '&service_date=is.null';
    const previous = await supabaseRest<Array<{ sheet_path: string | null }>>(
      `/worship_prep_songs?${deleteFilter}&select=sheet_path`,
      { method: 'GET' },
    );
    const previousSheets = previous.map((row) => row.sheet_path).filter((path): path is string => Boolean(path));
    if (previousSheets.length > 0) {
      await deleteSupabaseObjects({ bucket: BUCKET_NAME, paths: previousSheets }).catch((error) => {
        console.warn('[worship-prep] previous sheet cleanup failed', error);
      });
    }
    await supabaseRest(`/worship_prep_songs?${deleteFilter}`, { method: 'DELETE' });

    const rows = await Promise.all(payload.songs.map(async (song, index) => {
      let sheetPath = song.sheetPath ?? null;
      let sheetContentType = song.sheetContentType ?? null;

      const sheetFile = song.sheetKey ? formData.get(song.sheetKey) : null;
      if (sheetFile instanceof File) {
        const contentType = sheetFile.type in SHEET_EXTENSIONS ? sheetFile.type : 'application/pdf';
        const extension = SHEET_EXTENSIONS[contentType] ?? 'pdf';
        const path = [
          'worship',
          teamSegment,
          dateSegment,
          `${String(index + 1).padStart(2, '0')}-${sanitizeSegment(song.title)}.${extension}`,
        ].join('/');
        await uploadSupabaseObject({
          bucket: BUCKET_NAME,
          path,
          body: Buffer.from(await sheetFile.arrayBuffer()),
          contentType,
          upsert: true,
        });
        sheetPath = path;
        sheetContentType = contentType;
      }

      return {
        service_type: payload.serviceType,
        service_date: payload.serviceDate || null,
        team: payload.team,
        song_order: index + 1,
        title: song.title,
        song_key: song.songKey,
        arrangement: song.arrangement,
        arrangement_custom: song.arrangement === 'custom' ? song.arrangementCustom : '',
        sheet_bucket: sheetPath ? BUCKET_NAME : null,
        sheet_path: sheetPath,
        sheet_content_type: sheetContentType,
        source: payload.source,
        metadata: { appUrl: request.headers.get('origin') ?? null },
      };
    }));

    const inserted = await supabaseRest<Array<{ id: string }>>(
      '/worship_prep_songs',
      { method: 'POST', body: JSON.stringify(rows) },
      { prefer: 'return=representation' },
    );

    return NextResponse.json({ ok: true, songCount: inserted.length });
  } catch (error) {
    console.error('[worship-prep] save failed', error);
    if (error instanceof SupabaseServerConfigError) {
      return jsonError(error.message, 503, error.code);
    }
    if (error instanceof z.ZodError) {
      return jsonError(error.issues[0]?.message ?? '입력값을 확인해 주세요.', 400, 'INVALID_WORSHIP_PREP');
    }
    const message = error instanceof Error ? error.message : '준비찬양 저장 중 오류가 발생했습니다.';
    return jsonError(message, 500);
  }
}
