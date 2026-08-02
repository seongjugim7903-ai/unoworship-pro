/**
 * lib/churchScope.ts
 * 입력 웹 API 의 교회 범위(멀티테넌트) 헬퍼
 *
 * 현재 입력 웹은 로그인 없이 쓰는 단일 교회 운영 단계다.
 * 그래서 "기본 교회"(UNOWORSHIP_DEFAULT_CHURCH_SLUG, 기본 'ulju')를 서버에서
 * 결정해 모든 저장·조회를 그 교회 범위로 강제한다.
 * 교회 등록·로그인 흐름이 붙으면 이 헬퍼가 세션의 church_id 를 읽는 방식으로
 * 확장된다 (docs/UNOWORSHIP_ONBOARDING_DEVICE_AUTH_PLAN_2026-07-23.md §5).
 *
 * 전제: supabase/migrations/202607230001_multitenant_church_scope.sql 적용.
 */

import { supabaseRest } from './supabase/server';

let cached: { slug: string; id: string; name: string } | null = null;

async function loadActiveChurch(): Promise<{ id: string; name: string }> {
  const slug = (process.env.UNOWORSHIP_DEFAULT_CHURCH_SLUG || 'ulju').trim();
  if (cached && cached.slug === slug) return { id: cached.id, name: cached.name };

  const rows = await supabaseRest<Array<{ id: string; name: string }>>(
    `/churches?select=id,name&slug=eq.${encodeURIComponent(slug)}&limit=1`,
    { method: 'GET' },
  );
  if (!rows?.length) {
    throw new Error(
      `기본 교회(slug=${slug})를 찾을 수 없습니다. ` +
        '멀티테넌트 마이그레이션(202607230001)을 먼저 적용해 주세요.',
    );
  }
  cached = { slug, id: rows[0].id, name: rows[0].name };
  return { id: rows[0].id, name: rows[0].name };
}

export async function getActiveChurchId(): Promise<string> {
  return (await loadActiveChurch()).id;
}

/**
 * 교회 표시명 — 설교자 자막의 소속 슬롯 등에 쓴다.
 * 교회마다 다른 값이므로 코드에 박아 두지 않고 churches 레코드에서 읽는다.
 */
export async function getActiveChurchName(): Promise<string> {
  return (await loadActiveChurch()).name;
}

/** PostgREST 필터 조각: `church_id=eq.<id>` */
export async function churchFilter(): Promise<string> {
  return `church_id=eq.${await getActiveChurchId()}`;
}
