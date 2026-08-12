// 로그인하지 않으면 아무 화면도 열리지 않는다.
//
// 구독 제품이고 다루는 것이 교회 내부 자료(설교 원고·주보·악보)라 전면으로 닫는다.
// 로그인 벽은 처음 한 번뿐이다 — 세션은 오래 유지되고, 아이패드에 앱으로 설치하면
// 그대로 남는다. 매 예배마다 겪는 일이 아니다.
//
// 열어 두는 곳
//   /login /onboarding /auth/*   로그인·참여 자체를 하는 곳이라 닫으면 들어올 수 없다
//   /api/*                       라우트마다 자기 규칙이 있다. 여기서 막으면 현장 맥(UnoLive)의
//                                읽기 호출이 끊긴다
//   아이콘·매니페스트·sw.js       PWA 가 로그인 전에 읽는다
//
// 세션 판정은 쿠키 유무만 본다. 만료된 쿠키로 통과할 수 있지만 그때는 화면이 열린 뒤
// API 가 막는다 — 미들웨어에서 매 요청 인증 서버를 부르면 모든 페이지가 그만큼 느려진다.

import { NextResponse, type NextRequest } from 'next/server';

const OPEN_PATHS = [
  '/login',
  '/onboarding',
  /* 초대 링크 — 로그인 전에 눌러 들어오는 자리라 열어 둬야 한다 */
  '/join',
  '/auth',
  '/api',
  '/icons',
  '/manifest.webmanifest',
  '/sw.js',
];

/** Supabase 세션 쿠키 — 이름이 sb-<프로젝트ref>-auth-token 이고 길면 .0 .1 로 쪼개진다 */
const SESSION_COOKIE = /^sb-.+-auth-token(\.\d+)?$/;

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (OPEN_PATHS.some((open) => pathname === open || pathname.startsWith(`${open}/`))) {
    const passed = NextResponse.next();
    /* 초대 링크는 동적 라우트(/join/[code])라 Next 가 no-store 를 붙인다.
       그런데 브라우저는 no-store 로 내려온 페이지에는 앱 설치를 제안하지 않는다 —
       같은 폰에서 홈(/)에서는 설치창이 뜨는데 초대 화면에서만 안 뜨던 원인이 이것이었다.
       내용은 여전히 매 요청 새로 만든다. 캐시에 담아 두지 말라는 표시만 뗀다. */
    if (pathname.startsWith('/join')) {
      passed.headers.set('Cache-Control', 'public, max-age=0, must-revalidate');
    }
    return passed;
  }

  const hasSession = request.cookies.getAll().some((cookie) => SESSION_COOKIE.test(cookie.name));
  if (hasSession) return NextResponse.next();

  /* 로그인 화면이 아니라 참여 화면으로 보낸다 — 거기가 하나뿐인 입구이고,
     로그인만 하고 참여를 안 한 사람도 같은 자리에서 이어서 처리된다. */
  const url = request.nextUrl.clone();
  url.pathname = '/onboarding';
  url.search = '';
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
