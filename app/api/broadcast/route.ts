// 방송실 — 한 예배(예배종류+일자)의 모든 팀 자료를 한 번에 모아 준다. 읽기 전용.
//   설교대지 + 주보 + 준비찬양(전 팀) + 찬양대 자막.
// 각 소스는 이미 GET 라우트가 있지만 화면마다 필터가 달라, 방송실용으로 한 번에 묶는다.

import { NextResponse } from 'next/server';
import { SupabaseServerConfigError, supabaseRest } from '../../../lib/supabase/server';
import { getActiveChurchId } from '../../../lib/churchScope';
import { toWeekStart } from '../../../lib/weekStart';

export const runtime = 'nodejs';

function jsonError(message: string, status: number, code = 'BROADCAST_FAILED') {
  return NextResponse.json({ ok: false, code, message }, { status });
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const serviceType = (url.searchParams.get('serviceType') || '주일낮예배').trim();
    const date = (url.searchParams.get('date') || '').trim();

    const churchId = await getActiveChurchId();
    const cid = `church_id=eq.${churchId}`;
    const svc = `service_type=eq.${encodeURIComponent(serviceType)}`;
    const dateFilter = date ? `service_date=eq.${date}` : 'service_date=is.null';

    const [sermonRows, worshipSongs, choirRequests, bulletinRows] = await Promise.all([
      supabaseRest<Array<Record<string, unknown>>>(
        `/sermon_outlines?select=id,service_date,service_type,content,hymn,metadata&${cid}&${svc}&${dateFilter}&order=created_at.desc&limit=1`,
        { method: 'GET' },
      ).catch(() => []),
      supabaseRest<Array<Record<string, unknown>>>(
        `/worship_prep_songs?select=id,team,song_order,title,song_key,sung_key,arrangement,arrangement_custom,sheet_path,sheet_pages&${cid}&${svc}&${dateFilter}&order=team.asc,song_order.asc`,
        { method: 'GET' },
      ).catch(() => []),
      supabaseRest<Array<Record<string, unknown>>>(
        `/choir_requests?select=id,song_title,composer,arranger,section_count&${cid}&${svc}&${dateFilter}&order=updated_at.desc`,
        { method: 'GET' },
      ).catch(() => []),
      date
        ? supabaseRest<Array<Record<string, unknown>>>(
          `/weekly_bulletins?select=id,week_start,content&${cid}&week_start=eq.${toWeekStart(date)}&limit=1`,
          { method: 'GET' },
        ).catch(() => [])
        : Promise.resolve([] as Array<Record<string, unknown>>),
    ]);

    return NextResponse.json({
      ok: true,
      service: { serviceType, date },
      sermon: sermonRows[0] ?? null,
      bulletin: bulletinRows[0] ?? null,
      worshipSongs,
      choirRequests,
    });
  } catch (error) {
    console.error('[broadcast] aggregate failed', error);
    if (error instanceof SupabaseServerConfigError) {
      return jsonError(error.message, 503, error.code);
    }
    const message = error instanceof Error ? error.message : '방송실 자료를 불러오지 못했습니다.';
    return jsonError(message, 500);
  }
}
