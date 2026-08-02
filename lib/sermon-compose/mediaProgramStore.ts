// 참고자료 프로그램 저장·조회 — 서버 전용. Route Handler 에서만 부른다.
// 사진과 유튜브가 같은 테이블(sermon_media_programs)을 쓰므로 저장 경로를 여기 한 곳에 모은다.

import { supabaseRest } from '../supabase/server';
import { getActiveChurchId } from '../churchScope';
import {
  defaultMediaProgramTitle,
  type MediaImageItem,
  type MediaProgramKind,
  type MediaYoutubeItem,
} from './mediaProgram';

interface InsertInput {
  /* 사진은 Storage 업로드 경로를 만들 때 id 가 먼저 필요해서 호출부가 정해 넘긴다. */
  id: string;
  kind: MediaProgramKind;
  churchId: string;
  serviceType: string;
  serviceDate: string;
  title: string;
  items: MediaImageItem[] | MediaYoutubeItem[];
  originHeader: string | null;
}

interface ProgramRow {
  id: string;
}

export async function insertMediaProgram(input: InsertInput): Promise<{ id: string; title: string }> {
  const title =
    input.title.trim() ||
    defaultMediaProgramTitle(input.serviceDate, input.serviceType, input.kind);

  const [row] = await supabaseRest<ProgramRow[]>(
    '/sermon_media_programs',
    {
      method: 'POST',
      body: JSON.stringify({
        id: input.id,
        church_id: input.churchId,
        kind: input.kind,
        service_type: input.serviceType,
        service_date: input.serviceDate || null,
        title,
        items: input.items,
        status: 'saved',
        metadata: { savedBy: 'sermon-compose', appUrl: input.originHeader },
      }),
    },
    { prefer: 'return=representation' },
  );

  return { id: row?.id ?? input.id, title };
}

export async function listMediaPrograms(limit: number, kind?: MediaProgramKind) {
  const params = new URLSearchParams({
    select: 'id,created_at,updated_at,kind,service_date,service_type,title,items,status',
    order: 'service_date.desc.nullslast,created_at.desc',
    limit: String(limit),
    church_id: `eq.${await getActiveChurchId()}`,
  });
  if (kind) params.set('kind', `eq.${kind}`);

  return supabaseRest(`/sermon_media_programs?${params.toString()}`, { method: 'GET' });
}
