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
import { getActiveChurchId } from '../../../lib/churchScope';
import type { SheetPage } from '../../../lib/worship-prep/sheetPages';
import {
  isLibrarySheet,
  librarySheetPath,
  listLibrarySheetPaths,
  upsertLibrarySong,
} from '../../../lib/worship-prep/songLibrary';
import { requireLogin } from '../../../lib/authn/requireLogin';

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
  /* 반주자가 실제로 치는 조. 악보는 C인데 A로 부르는 일이 흔해서 songKey 와 나눈다 */
  sungKey: z.string().trim().optional().default(''),
  /* 없으면 매주 다른 속도로 시작한다 */
  tempoBpm: z.coerce.number().int().min(20).max(300).nullable().optional().default(null),
  /* 4/4 · 6/8 · 3/4 — 6/8 을 4/4 로 들어가면 첫 마디에서 무너진다 */
  timeSignature: z.string().trim().max(10).optional().default(''),
  arrangement: z.enum(['full', 'chorus_only', 'chorus_first', 'custom']).default('full'),
  arrangementCustom: z.string().trim().optional().default(''),
  /* 새로 올리는 악보 — 장마다 multipart 키 하나. 브라우저에서 잰 크기·여백이 같이 온다. */
  sheetUploads: z.array(z.object({
    key: z.string().trim().min(1),
    w: z.coerce.number().int().min(0).optional().default(0),
    h: z.coerce.number().int().min(0).optional().default(0),
    crop: z.object({
      l: z.coerce.number().min(0).max(1),
      t: z.coerce.number().min(0).max(1),
      r: z.coerce.number().min(0).max(1),
      b: z.coerce.number().min(0).max(1),
    }).optional(),
  })).optional().default([]),
  /* 라이브러리에서 끌어와 그대로 다시 쓰는 페이지들 */
  sheetPages: z.array(z.object({
    path: z.string().trim().min(1),
    contentType: z.string().trim().optional().default(''),
    w: z.coerce.number().int().min(0).optional(),
    h: z.coerce.number().int().min(0).optional(),
    crop: z.object({
      l: z.coerce.number(), t: z.coerce.number(), r: z.coerce.number(), b: z.coerce.number(),
    }).optional(),
  })).optional().default([]),
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

const SELECT_COLUMNS = 'id,created_at,service_date,service_type,team,song_order,title,song_key,sung_key,tempo_bpm,time_signature,arrangement,arrangement_custom,sheet_bucket,sheet_path,sheet_content_type,sheet_pages';

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

    params.set('church_id', `eq.${await getActiveChurchId()}`);
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
  /* 쓰기는 로그인한 사람만 — 강제 여부는 UNOWORSHIP_REQUIRE_LOGIN 이 정한다 */
  const denied = await requireLogin();
  if (denied) return denied;

  try {
    const formData = await request.formData();
    const rawPayload = formData.get('payload');
    if (typeof rawPayload !== 'string') {
      return jsonError('payload가 없습니다.', 400, 'NO_PAYLOAD');
    }
    const payload = PrepSchema.parse(JSON.parse(rawPayload));
    const teamSegment = sanitizeSegment(payload.team);

    const hasNewSheet = payload.songs.some((song) => song.sheetUploads.some((upload) => formData.get(upload.key) instanceof File));
    if (hasNewSheet) {
      await ensureSupabaseBucket({
        bucket: BUCKET_NAME,
        fileSizeLimit: 10_485_760,
        allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'],
      });
    }

    const churchId = await getActiveChurchId();

    /* 같은 (교회·예배·일자·팀) 셋리스트를 재저장하면 기존 행/악보를 정리하고 새로 넣는다. */
    let deleteFilter = `church_id=eq.${churchId}&service_type=eq.${encodeURIComponent(payload.serviceType)}&team=eq.${encodeURIComponent(payload.team)}`;
    deleteFilter += payload.serviceDate
      ? `&service_date=eq.${payload.serviceDate}`
      : '&service_date=is.null';
    const previous = await supabaseRest<Array<{ sheet_path: string | null }>>(
      `/worship_prep_songs?${deleteFilter}&select=sheet_path`,
      { method: 'GET' },
    );
    /* 지우면 안 되는 악보가 세 종류 있다.
         · 라이브러리 소유(library/…) — 곡에 매인 파일이라 회차를 다시 저장한다고 없어지면 안 된다
         · 라이브러리가 참조 중인 예전 악보 — 옮겨 심은 것은 아직 회차 폴더에 있다
         · 이번 저장이 그대로 다시 쓰는 경로 — 지우고 나서 참조하면 깨진 링크가 된다 */
    const reused = new Set(payload.songs.flatMap((song) => song.sheetPages.map((page) => page.path)));
    const libraryPaths = await listLibrarySheetPaths(churchId).catch(() => new Set<string>());
    const previousSheets = previous
      .map((row) => row.sheet_path)
      .filter((path): path is string => Boolean(path))
      .filter((path) => !isLibrarySheet(path) && !reused.has(path) && !libraryPaths.has(path));
    if (previousSheets.length > 0) {
      await deleteSupabaseObjects({ bucket: BUCKET_NAME, paths: previousSheets }).catch((error) => {
        console.warn('[worship-prep] previous sheet cleanup failed', error);
      });
    }
    await supabaseRest(`/worship_prep_songs?${deleteFilter}`, { method: 'DELETE' });

    const rows = await Promise.all(payload.songs.map(async (song, index) => {
      /* 라이브러리에서 그대로 쓰는 페이지가 먼저, 새로 올린 것이 뒤에 붙는다 */
      const pages: SheetPage[] = song.sheetPages.map((page) => ({ ...page, contentType: page.contentType }));

      for (const upload of song.sheetUploads) {
        const file = formData.get(upload.key);
        if (!(file instanceof File)) continue;
        /* pages 는 아래에서 자라므로 그 길이만으로 번호를 매긴다 —
           따로 센 인덱스를 더하면 01, 03, 05 처럼 튄다 */
        const pageNo = String(pages.length + 1).padStart(2, '0');
        const contentType = file.type in SHEET_EXTENSIONS ? file.type : 'application/pdf';
        const extension = SHEET_EXTENSIONS[contentType] ?? 'pdf';
        /* 악보는 회차가 아니라 곡에 매인다 — 날짜 폴더에 두면 그 주 셋리스트를 다시
           저장할 때 같이 지워지고, 다음 주에 라이브러리에서 끌어와도 파일이 없다. */
        const path = librarySheetPath(teamSegment, `${sanitizeSegment(song.title)}-${pageNo}`, extension);
        await uploadSupabaseObject({
          bucket: BUCKET_NAME,
          path,
          body: Buffer.from(await file.arrayBuffer()),
          contentType,
          upsert: true,
        });
        pages.push({ path, contentType, w: upload.w || undefined, h: upload.h || undefined, crop: upload.crop });
      }

      /* sheet_path 는 1페이지를 가리킨다 — 예전 화면·API 가 그대로 동작한다 */
      const first = pages[0] ?? null;

      return {
        church_id: churchId,
        service_type: payload.serviceType,
        service_date: payload.serviceDate || null,
        team: payload.team,
        song_order: index + 1,
        title: song.title,
        song_key: song.songKey,
        sung_key: song.sungKey,
        tempo_bpm: song.tempoBpm,
        time_signature: song.timeSignature,
        arrangement: song.arrangement,
        arrangement_custom: song.arrangement === 'custom' ? song.arrangementCustom : '',
        sheet_pages: pages,
        sheet_bucket: first ? BUCKET_NAME : null,
        sheet_path: first?.path ?? null,
        sheet_content_type: first?.contentType || null,
        source: payload.source,
        metadata: { appUrl: request.headers.get('origin') ?? null },
      };
    }));

    const inserted = await supabaseRest<Array<{ id: string }>>(
      '/worship_prep_songs',
      { method: 'POST', body: JSON.stringify(rows) },
      { prefer: 'return=representation' },
    );

    /* 곡을 라이브러리에 자동 등록·갱신한다. 따로 등록하는 절차를 두면 아무도 쓰지 않는다.
       실패해도 회차 저장은 이미 끝났으므로 막지 않는다 — 다음 저장 때 다시 들어간다. */
    for (const row of rows) {
      try {
        await upsertLibrarySong({
          churchId,
          team: payload.team,
          title: String(row.title),
          songKey: String(row.song_key ?? ''),
          sungKey: String(row.sung_key ?? ''),
          tempoBpm: (row.tempo_bpm as number | null) ?? null,
          timeSignature: String(row.time_signature ?? ''),
          arrangement: String(row.arrangement ?? 'full'),
          arrangementCustom: String(row.arrangement_custom ?? ''),
          sheetPages: row.sheet_pages as SheetPage[],
          usedAt: payload.serviceDate || null,
        });
      } catch (error) {
        console.warn('[worship-prep] library upsert failed', row.title, error);
      }
    }

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
