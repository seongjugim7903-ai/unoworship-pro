// 준비찬양 곡 라이브러리 API — 검색·수정·삭제.
//
// 등록은 여기서 하지 않는다. 준비찬양을 저장할 때 자동으로 들어간다
// (/api/worship-prep). 따로 등록하는 절차를 두면 아무도 쓰지 않기 때문이다.
// 여기 POST 는 이미 있는 곡의 값을 고치는 용도다.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { SupabaseServerConfigError } from '../../../lib/supabase/server';
import { getActiveChurchId } from '../../../lib/churchScope';
import {
  deleteLibrarySong,
  listLibrarySongs,
  upsertLibrarySong,
} from '../../../lib/worship-prep/songLibrary';

export const runtime = 'nodejs';

const EditSchema = z.object({
  team: z.string().trim().min(1),
  title: z.string().trim().min(1, '찬양 제목을 입력해 주세요.'),
  songKey: z.string().trim().optional().default(''),
  sungKey: z.string().trim().optional().default(''),
  tempoBpm: z.coerce.number().int().min(20).max(300).nullable().optional().default(null),
  timeSignature: z.string().trim().max(10).optional().default(''),
  arrangement: z.enum(['chorus_only', 'chorus_first', 'custom']).default('chorus_first'),
  arrangementCustom: z.string().trim().optional().default(''),
});

function jsonError(message: string, status: number, code = 'WORSHIP_SONG_FAILED') {
  return NextResponse.json({ ok: false, code, message }, { status });
}

function clampLimit(value: string | null) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 40;
  return Math.max(1, Math.min(100, Math.floor(parsed)));
}

/* PostgREST ilike 패턴을 깨뜨리는 문자를 털어낸다 — worship-prep 의 normalizeSearch 와 같은 규칙 */
function normalizeSearch(value: string | null) {
  return String(value ?? '').trim().replace(/[(),*]/g, ' ').replace(/\s+/g, ' ').slice(0, 60);
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const songs = await listLibrarySongs({
      churchId: await getActiveChurchId(),
      /* 팀을 지정하지 않으면 교회 전체에서 찾는다 — 다른 팀 곡도 끌어다 쓴다 */
      team: url.searchParams.get('team')?.trim() || undefined,
      search: normalizeSearch(url.searchParams.get('search')) || undefined,
      limit: clampLimit(url.searchParams.get('limit')),
    });
    return NextResponse.json({ ok: true, songs });
  } catch (error) {
    console.error('[worship-songs] list failed', error);
    if (error instanceof SupabaseServerConfigError) return jsonError(error.message, 503, error.code);
    return jsonError('곡 라이브러리를 불러오지 못했습니다.', 500, 'WORSHIP_SONG_LIST_FAILED');
  }
}

export async function POST(request: Request) {
  try {
    const body = EditSchema.parse(await request.json());
    await upsertLibrarySong({
      churchId: await getActiveChurchId(),
      team: body.team,
      title: body.title,
      songKey: body.songKey,
      sungKey: body.sungKey,
      tempoBpm: body.tempoBpm,
      timeSignature: body.timeSignature,
      arrangement: body.arrangement,
      arrangementCustom: body.arrangement === 'custom' ? body.arrangementCustom : '',
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[worship-songs] save failed', error);
    if (error instanceof SupabaseServerConfigError) return jsonError(error.message, 503, error.code);
    if (error instanceof z.ZodError) {
      return jsonError(error.issues[0]?.message ?? '입력값을 확인해 주세요.', 400, 'INVALID_WORSHIP_SONG');
    }
    return jsonError('곡을 저장하지 못했습니다.', 500);
  }
}

export async function DELETE(request: Request) {
  try {
    const id = new URL(request.url).searchParams.get('id')?.trim();
    if (!id) return jsonError('id가 없습니다.', 400, 'NO_ID');
    /* 라이브러리에서만 뺀다 — 지난 주에 무엇을 불렀는지는 그대로 남는다 */
    await deleteLibrarySong(await getActiveChurchId(), id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[worship-songs] delete failed', error);
    if (error instanceof SupabaseServerConfigError) return jsonError(error.message, 503, error.code);
    return jsonError('곡을 삭제하지 못했습니다.', 500, 'WORSHIP_SONG_DELETE_FAILED');
  }
}
