// 준비찬양 곡 라이브러리 — 서버 전용. Route Handler 에서만 부른다.
//
// 왜 회차 기록과 나누는가
//   worship_prep_songs 는 '그 주에 무엇을 불렀는가'라는 기록이다. 라이브러리에서 곡을
//   빼는 것과 이력을 지우는 것은 다른 일이므로 테이블을 나눴다.
//
// 악보의 주인은 라이브러리다
//   악보를 회차 폴더(worship/{팀}/{날짜}/…)에 두면, 그 주 셋리스트를 다시 저장할 때
//   같이 지워진다. 곡에 붙어 다녀야 하므로 library/{팀}/{제목} 아래에 둔다.

import { supabaseRest } from '../supabase/server';
import type { SheetPage } from './sheetPages';

export const SHEET_BUCKET = 'worship-sheets';

/** 악보 저장 경로 — 곡에 매인다. 회차를 다시 저장해도 지워지지 않는다 */
export function librarySheetPath(teamSegment: string, titleSegment: string, extension: string): string {
  return `library/${teamSegment}/${titleSegment}.${extension}`;
}

/** 라이브러리가 소유한 악보인지 — 회차 정리에서 지우면 안 되는 것들 */
export function isLibrarySheet(path: string | null | undefined): boolean {
  return Boolean(path && path.startsWith('library/'));
}

export interface LibrarySong {
  id: string;
  team: string;
  title: string;
  song_key: string;
  sung_key: string;
  tempo_bpm: number | null;
  time_signature: string;
  arrangement: string;
  arrangement_custom: string;
  sheet_bucket: string | null;
  sheet_path: string | null;
  sheet_content_type: string | null;
  sheet_pages: SheetPage[];
  last_used_at: string | null;
}

export const LIBRARY_COLUMNS =
  'id,team,title,song_key,sung_key,tempo_bpm,time_signature,arrangement,arrangement_custom,sheet_bucket,sheet_path,sheet_content_type,sheet_pages,last_used_at';

export interface UpsertSongInput {
  churchId: string;
  team: string;
  title: string;
  songKey?: string;
  sungKey?: string;
  tempoBpm?: number | null;
  timeSignature?: string;
  arrangement?: string;
  arrangementCustom?: string;
  /** 악보 페이지들. 넘기지 않으면 기존 악보를 그대로 둔다 */
  sheetPages?: SheetPage[];
  /** 준비찬양 저장으로 들어온 경우 그 예배 날짜 — 최근에 쓴 곡을 앞에 보여주기 위해 남긴다 */
  usedAt?: string | null;
}

/**
 * 같은 (교회·팀·제목)이면 갱신하고, 없으면 등록한다.
 *
 * 악보를 비우는 수단으로 쓰지 않는다 — sheetPath 를 넘기지 않으면 기존 악보를 그대로 둔다.
 * 준비찬양 저장은 악보 없이도 들어오므로(제목만 적는 경우), 그때 기존 악보가 날아가면 안 된다.
 */
export async function upsertLibrarySong(input: UpsertSongInput): Promise<void> {
  const row: Record<string, unknown> = {
    church_id: input.churchId,
    team: input.team,
    title: input.title,
    song_key: input.songKey ?? '',
    sung_key: input.sungKey ?? '',
    tempo_bpm: input.tempoBpm ?? null,
    time_signature: input.timeSignature ?? '',
    arrangement: input.arrangement ?? 'full',
    arrangement_custom: input.arrangementCustom ?? '',
    last_used_at: input.usedAt || null,
  };
  if (input.sheetPages && input.sheetPages.length > 0) {
    const first = input.sheetPages[0];
    row.sheet_pages = input.sheetPages;
    row.sheet_bucket = SHEET_BUCKET;
    row.sheet_path = first.path;
    row.sheet_content_type = first.contentType || null;
  }

  await supabaseRest(
    '/worship_song_library?on_conflict=church_id,team,title',
    { method: 'POST', body: JSON.stringify(row) },
    { prefer: 'resolution=merge-duplicates,return=minimal' },
  );
}

export async function listLibrarySongs(opts: {
  churchId: string;
  team?: string;
  search?: string;
  limit: number;
}): Promise<LibrarySong[]> {
  const params = new URLSearchParams({
    select: LIBRARY_COLUMNS,
    church_id: `eq.${opts.churchId}`,
    limit: String(opts.limit),
    /* 최근에 쓴 곡이 앞에 온다. 한 번도 안 쓴 곡은 뒤로 */
    order: 'last_used_at.desc.nullslast,title.asc',
  });
  if (opts.team) params.set('team', `eq.${opts.team}`);
  if (opts.search) params.set('title', `ilike.*${opts.search}*`);

  return supabaseRest<LibrarySong[]>(`/worship_song_library?${params.toString()}`, { method: 'GET' });
}

/**
 * 라이브러리가 지금 참조 중인 악보 경로들.
 *
 * 회차 정리에서 이 경로를 지우면 안 된다. 새로 올린 악보는 library/ 아래라 경로만 봐도
 * 걸러지지만, 옮겨 심은 예전 악보는 회차 폴더(worship/{팀}/{날짜}/…)에 그대로 있다.
 * 그것까지 막으려면 실제 참조를 봐야 한다.
 */
export async function listLibrarySheetPaths(churchId: string): Promise<Set<string>> {
  const rows = await supabaseRest<Array<{ sheet_path: string | null; sheet_pages: SheetPage[] | null }>>(
    `/worship_song_library?select=sheet_path,sheet_pages&church_id=eq.${churchId}`,
    { method: 'GET' },
  );
  const paths = new Set<string>();
  for (const row of rows) {
    if (row.sheet_path) paths.add(row.sheet_path);
    for (const page of row.sheet_pages ?? []) if (page?.path) paths.add(page.path);
  }
  return paths;
}

/** 라이브러리에서만 뺀다. 회차 기록(worship_prep_songs)은 건드리지 않는다 */
export async function deleteLibrarySong(churchId: string, id: string): Promise<void> {
  await supabaseRest(
    `/worship_song_library?church_id=eq.${churchId}&id=eq.${id}`,
    { method: 'DELETE' },
  );
}
