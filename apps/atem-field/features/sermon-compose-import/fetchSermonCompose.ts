// unoworship-pro(클라우드)에 저장된 설교대지와 부속 프로그램을 가져온다. 서버 전용.
//
// 조립은 하지 않는다 — JSON 만 중계한다.
// 프로그램 조립은 반드시 컴포저 브라우저에서 해야 한다(본문 넘침 분할이 화면 측정에 기댐).
// 찬양대 가져오기(features/choir-supabase-import)와 같은 클라우드 주소를 쓴다.

import type { CloudSermonOutline, CloudSubProgram, SermonComposeCandidate } from './types';

const DEFAULT_CLOUD_API_BASE = 'https://unoworship-pro-eight.vercel.app/api';

function cloudApiBase(): string {
  return (process.env.UNOWORSHIP_CLOUD_API_BASE || DEFAULT_CLOUD_API_BASE).replace(/\/+$/, '');
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${cloudApiBase()}${path}`, { cache: 'no-store' });
  const body = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string } & T;
  if (!res.ok || body.ok === false) {
    throw new Error(body.message ?? `클라우드 요청 실패 (${res.status})`);
  }
  return body;
}

/** 같은 예배·같은 날짜의 부속 프로그램을 설교대지에 붙여 준다 */
function matches(outline: CloudSermonOutline, sub: CloudSubProgram): boolean {
  return (
    sub.service_type === outline.service_type &&
    (sub.service_date ?? '') === (outline.service_date ?? '')
  );
}

export async function listSermonComposeCandidates(limit: number): Promise<SermonComposeCandidate[]> {
  /* 기존 /api/sermon-outlines 는 metadata 를 안 주므로 설교대지 화면 전용 라우트를 쓴다. */
  const [outlineRes, subRes] = await Promise.all([
    getJson<{ outlines?: CloudSermonOutline[] }>(`/sermon-compose/outline?limit=${limit}`),
    /* 부속 프로그램은 설교대지보다 많을 수 있어 넉넉히 가져온다. */
    getJson<{ programs?: CloudSubProgram[] }>(`/sermon-compose/sub-program?limit=50`).catch(() => ({
      programs: [] as CloudSubProgram[],
    })),
  ]);

  const outlines = outlineRes.outlines ?? [];
  const subPrograms = subRes.programs ?? [];

  /* 설교대지 화면에서 저장한 것만 다룬다 — 기존 원문 저장 탭의 행에는 파싱 구조가 없다. */
  return outlines
    .filter((outline) => outline.metadata?.savedBy === 'sermon-compose')
    .map((outline) => ({
      outline,
      subPrograms: subPrograms.filter((sub) => matches(outline, sub)),
    }));
}
