import 'server-only';

// 쓰기 라우트의 로그인 강제.
//
// 왜 스위치를 두는가
//   지금 이 제품을 쓰는 분들은 로그인하지 않고 저장하고 있다. 카카오 로그인이 붙기
//   전에 강제를 켜면 그 순간 아무도 저장할 수 없다 — 주중에 켜지면 그 주 예배가 막힌다.
//   그래서 코드는 미리 넣어 두고 환경변수로 켠다. 켜고 끄는 데 배포가 필요 없으니
//   문제가 생기면 즉시 되돌릴 수 있다.
//
//   UNOWORSHIP_REQUIRE_LOGIN=1  이면 로그인 없이는 쓰기가 막힌다. 기본은 꺼짐.
//
// 읽기는 막지 않는다
//   현장 맥(UnoLive)이 로그인 없이 읽기 API 를 부른다. 디바이스 토큰 연결은 따로 잡는다
//   (docs/features/auth-church-scope/checklist.md).

import { NextResponse } from 'next/server';
import { getSessionUserId } from './currentUser';

export function isLoginRequired(): boolean {
  return process.env.UNOWORSHIP_REQUIRE_LOGIN === '1';
}

/**
 * 막아야 하면 401 응답을, 통과시켜도 되면 null 을 돌려준다.
 *
 *   const denied = await requireLogin();
 *   if (denied) return denied;
 */
export async function requireLogin(): Promise<NextResponse | null> {
  if (!isLoginRequired()) return null;

  const userId = await getSessionUserId();
  if (userId) return null;

  return NextResponse.json(
    {
      ok: false,
      code: 'LOGIN_REQUIRED',
      message: '로그인이 필요합니다. 카카오로 로그인한 뒤 다시 저장해 주세요.',
    },
    { status: 401 },
  );
}
