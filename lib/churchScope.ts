/**
 * lib/churchScope.ts
 * 입력 웹 API 의 교회 범위(멀티테넌트) 헬퍼
 *
 * 로그인한 사용자의 소속 교회를 쓴다. 소속을 못 찾거나 로그인하지 않았으면
 * 기본 교회(UNOWORSHIP_DEFAULT_CHURCH_SLUG, 기본 'ulju')로 떨어진다.
 *
 * 폴백을 남겨 둔 이유 — 아직 로그인을 강제하지 않는 화면이 있고, 현장 맥(UnoLive)이
 * 로그인 없이 읽기 API 를 부른다. 폴백을 지금 걷으면 그 둘이 한꺼번에 멈춘다.
 * 카카오 로그인과 인증 강제가 붙은 뒤에 걷는다
 * (docs/features/auth-church-scope/checklist.md).
 *
 * 요청마다 새로 판단한다 — 예전에는 모듈 수준 변수에 캐시했는데, 그러면 한 인스턴스가
 * 여러 교회의 요청을 받을 때 먼저 온 교회로 굳는다. 같은 요청 안의 중복 조회는
 * React cache 가 막아 준다.
 *
 * 전제: supabase/migrations/202607230001_multitenant_church_scope.sql 적용.
 */

import { cache } from 'react';
import { supabaseRest } from './supabase/server';
import { getSessionUserId } from './authn/currentUser';

export interface ActiveChurch {
  id: string;
  name: string;
}

interface ChurchRow {
  id: string;
  name: string;
}

function fallbackSlug(): string {
  return (process.env.UNOWORSHIP_DEFAULT_CHURCH_SLUG || 'ulju').trim();
}

async function findBySlug(slug: string): Promise<ActiveChurch> {
  const rows = await supabaseRest<ChurchRow[]>(
    `/churches?select=id,name&slug=eq.${encodeURIComponent(slug)}&limit=1`,
    { method: 'GET' },
  );
  if (!rows?.length) {
    throw new Error(
      `기본 교회(slug=${slug})를 찾을 수 없습니다. ` +
        '멀티테넌트 마이그레이션(202607230001)을 먼저 적용해 주세요.',
    );
  }
  return { id: rows[0].id, name: rows[0].name };
}

/**
 * 로그인 사용자의 소속 교회.
 * church_members 를 먼저 보고, 없으면 profiles.church_id 를 본다.
 * 어느 쪽도 없으면 null — 호출부가 기본 교회로 떨어진다.
 */
async function findForUser(userId: string): Promise<ActiveChurch | null> {
  try {
    const members = await supabaseRest<Array<{ churches: ChurchRow | null }>>(
      `/church_members?select=churches(id,name)&user_id=eq.${userId}&limit=1`,
      { method: 'GET' },
    );
    const joined = members?.[0]?.churches;
    if (joined) return { id: joined.id, name: joined.name };

    const profiles = await supabaseRest<Array<{ churches: ChurchRow | null }>>(
      `/profiles?select=churches(id,name)&id=eq.${userId}&limit=1`,
      { method: 'GET' },
    );
    const own = profiles?.[0]?.churches;
    if (own) return { id: own.id, name: own.name };
  } catch (error) {
    /* 소속 조회가 깨져도 화면이 멈추면 안 된다 — 기본 교회로 떨어뜨린다 */
    console.warn('[church-scope] member lookup failed', error);
  }
  return null;
}

/** 같은 요청 안에서는 한 번만 조회한다 */
const resolveActiveChurch = cache(async (): Promise<ActiveChurch> => {
  const userId = await getSessionUserId();
  if (userId) {
    const found = await findForUser(userId);
    if (found) return found;
  }
  return findBySlug(fallbackSlug());
});

export async function getActiveChurch(): Promise<ActiveChurch> {
  return resolveActiveChurch();
}

export async function getActiveChurchId(): Promise<string> {
  return (await resolveActiveChurch()).id;
}

/**
 * 교회 표시명 — 설교자 자막의 소속 슬롯 등에 쓴다.
 * 교회마다 다른 값이므로 코드에 박아 두지 않고 churches 레코드에서 읽는다.
 */
export async function getActiveChurchName(): Promise<string> {
  return (await resolveActiveChurch()).name;
}

/** PostgREST 필터 조각: `church_id=eq.<id>` */
export async function churchFilter(): Promise<string> {
  return `church_id=eq.${await getActiveChurchId()}`;
}
