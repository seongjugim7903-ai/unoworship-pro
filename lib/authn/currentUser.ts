import 'server-only';

// 지금 요청을 보낸 로그인 사용자. 서버 전용.
//
// 없으면 null 을 돌려준다 — 던지지 않는다. 아직 로그인 없이 쓰는 화면과
// 현장 맥(UnoLive)의 읽기 호출이 살아 있어야 하고, "로그인 여부"는
// 호출부가 판단할 일이지 여기서 막을 일이 아니다.

import { createSessionClient, isAuthConfigured } from './supabaseAuth';

export async function getSessionUserId(): Promise<string | null> {
  /* 환경변수가 없으면 로그인 자체가 구성되지 않은 배포다 */
  if (!isAuthConfigured()) return null;
  try {
    const supabase = await createSessionClient();
    const { data } = await supabase.auth.getUser();
    return data.user?.id ?? null;
  } catch {
    /* 쿠키를 읽을 수 없는 맥락(정적 렌더 등)에서는 로그인하지 않은 것으로 본다 */
    return null;
  }
}
