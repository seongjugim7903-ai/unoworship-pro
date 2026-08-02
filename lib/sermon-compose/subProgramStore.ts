// 부속 프로그램 저장·조회 — 서버 전용. Route Handler 에서만 부른다.
// 네 종류(사진·유튜브·찬송가·찬양)가 같은 테이블(sermon_sub_programs)을 쓰므로
// 저장 경로를 여기 한 곳에 모은다.

import { supabaseRest } from '../supabase/server';
import { getActiveChurchId } from '../churchScope';
import {
  defaultSubProgramTitle,
  type SubProgramItem,
  type SubProgramKind,
} from './subProgram';

interface InsertInput {
  /* 사진은 Storage 업로드 경로를 만들 때 id 가 먼저 필요해서 호출부가 정해 넘긴다. */
  id: string;
  kind: SubProgramKind;
  churchId: string;
  serviceType: string;
  serviceDate: string;
  title: string;
  items: SubProgramItem[];
  originHeader: string | null;
}

interface ProgramRow {
  id: string;
}

export interface SavedSubProgram {
  id: string;
  kind: SubProgramKind;
  title: string;
  itemCount: number;
}

export async function insertSubProgram(input: InsertInput): Promise<SavedSubProgram> {
  const title =
    input.title.trim() || defaultSubProgramTitle(input.serviceDate, input.serviceType, input.kind);

  const [row] = await supabaseRest<ProgramRow[]>(
    '/sermon_sub_programs',
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

  return { id: row?.id ?? input.id, kind: input.kind, title, itemCount: input.items.length };
}

export async function listSubPrograms(limit: number, kind?: SubProgramKind) {
  const params = new URLSearchParams({
    select: 'id,created_at,updated_at,kind,service_date,service_type,title,items,status',
    order: 'service_date.desc.nullslast,created_at.desc',
    limit: String(limit),
    church_id: `eq.${await getActiveChurchId()}`,
  });
  if (kind) params.set('kind', `eq.${kind}`);

  return supabaseRest(`/sermon_sub_programs?${params.toString()}`, { method: 'GET' });
}
