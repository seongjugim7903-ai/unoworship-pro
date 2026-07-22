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

let cached: { slug: string; id: string } | null = null;

export async function getActiveChurchId(): Promise<string> {
  const slug = (process.env.UNOWORSHIP_DEFAULT_CHURCH_SLUG || 'ulju').trim();
  if (cached && cached.slug === slug) return cached.id;

  const rows = await supabaseRest<Array<{ id: string }>>(
    `/churches?select=id&slug=eq.${encodeURIComponent(slug)}&limit=1`,
    { method: 'GET' },
  );
  if (!rows?.length) {
    throw new Error(
      `기본 교회(slug=${slug})를 찾을 수 없습니다. ` +
        '멀티테넌트 마이그레이션(202607230001)을 먼저 적용해 주세요.',
    );
  }
  cached = { slug, id: rows[0].id };
  return rows[0].id;
}

/** PostgREST 필터 조각: `church_id=eq.<id>` */
export async function churchFilter(): Promise<string> {
  return `church_id=eq.${await getActiveChurchId()}`;
}
