// 카카오 로그인에서 돌아오는 자리.
//
// Supabase 가 카카오와의 왕복을 끝내고 우리 주소로 code 를 붙여 보낸다.
// 여기서 그 code 를 세션 쿠키로 바꾼다. 이 교환을 하지 않으면 로그인은 됐는데
// 서버가 사용자를 모르는 상태가 된다.
//
// 끝난 뒤 어디로 보낼지는 next 파라미터가 정한다 — 기본은 참여 화면(/onboarding)이다.
// 이미 교회·팀에 들어간 사람은 그 화면이 알아서 홈으로 넘긴다.

import { NextResponse, type NextRequest } from 'next/server';
import { createSessionClient, isAuthConfigured } from '../../../lib/authn/supabaseAuth';

export const runtime = 'nodejs';

/** 바깥 주소로 튕기지 않도록 내부 경로만 허용한다 */
function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return '/onboarding';
  return raw;
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const next = safeNext(searchParams.get('next'));

  /* 카카오 동의 화면에서 취소하면 code 없이 error 만 붙어 돌아온다 */
  const oauthError = searchParams.get('error_description') ?? searchParams.get('error');
  if (oauthError) {
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(oauthError)}`);
  }

  const code = searchParams.get('code');
  if (!code || !isAuthConfigured()) {
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent('로그인을 마치지 못했습니다.')}`);
  }

  const supabase = await createSessionClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(error.message)}`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
