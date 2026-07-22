import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { isPrivateLanHost } from './lib/hostRouting';

// 인증 필수 라우트
const PROTECTED_ROUTES = ['/media', '/complete-profile', '/admin', '/signup/church'];

// 디바이스 토큰 우회 허용 라우트
//   Electron 앱이 매 요청마다 X-Device-Token 헤더를 붙임 → 아래 경로만 우회 허용.
//   `/media/broadcast` 대시보드 + 대시보드가 호출하는 내부 API 만 포함.
//   (구독 관리/설정 페이지 등은 기존처럼 Supabase 세션 필요 — 컴포저 PC 에서 접근)
const DEVICE_TOKEN_ALLOWED_PREFIXES = [
  '/media/broadcast',
  '/api/designs',
  '/api/programs',
  '/api/atem',
  '/api/church',
];

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function verifyDeviceTokenFast(token: string): Promise<{ churchId: string | null; userId: string } | null> {
  // 성능을 위해 middleware 내에서는 Supabase REST (Postgrest) 로 직접 조회.
  // createServerClient 를 또 만드는 것보다 fetch 한 번이 가볍고, RLS 우회를 위해 service_role 사용.
  const hash = await sha256Hex(token);

  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/device_tokens?select=user_id,church_id,revoked_at&token_hash=eq.${hash}&limit=1`;

  try {
    const res = await fetch(url, {
      headers: {
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
      },
      // 짧게 cache — 같은 토큰으로 연달아 오는 요청 대응
      next: { revalidate: 10 },
    });
    if (!res.ok) return null;
    const rows = (await res.json()) as Array<{ user_id: string; church_id: string | null; revoked_at: string | null }>;
    if (!rows.length || rows[0].revoked_at) return null;
    return { userId: rows[0].user_id, churchId: rows[0].church_id };
  } catch {
    return null;
  }
}

// 공개 인증 라우트 (이미 로그인된 사용자는 기본적으로 랜딩 홈으로)
const PUBLIC_AUTH_ROUTES = ['/login', '/signup', '/forgot-password'];

// 인증 플로우 라우트 (항상 허용)
const AUTH_FLOW_ROUTES = ['/auth/callback', '/auth/confirm', '/auth/reset-password'];

// 프로필 완성 예외 (이 경로에서는 프로필 미완성 리다이렉트 안 함)
const PROFILE_EXEMPT_ROUTES = ['/complete-profile', '/login', '/signup', '/auth'];

const PUBLIC_MARKETING_ROUTES = new Set(['/', '/company', '/product', '/pricing', '/resources']);

const FIELD_NO_LOGIN_PREFIXES = [
  '/api/programs',
  '/api/designs',
  '/api/atem',
  '/api/church',
  '/api/media/videos/upload',
];

function isFieldNoLoginEnabled() {
  return process.env.NODE_ENV !== 'production' && process.env.UNOLIVE_SOCKET_DEV_BYPASS === '1';
}

function isFieldNoLoginPath(pathname: string) {
  return FIELD_NO_LOGIN_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const isPrivateHost = isPrivateLanHost(request.headers.get('host'));

  if (pathname === '/' && isPrivateHost) {
    const composerUrl = request.nextUrl.clone();
    composerUrl.pathname = '/composer';
    return NextResponse.rewrite(composerUrl);
  }

  // [FIELD MODE]
  // 현장 ATEM 테스트 중에는 Supabase 인증/세션 갱신이 네트워크 상태에 따라
  // 20초 이상 지연되며 /composer, /atem-key 송출 테스트를 막을 수 있다.
  // UNOLIVE_SOCKET_DEV_BYPASS=1 로 실행한 개발/현장 복사본에서는 인증 미들웨어를
  // 전부 우회한다. 원본/프로덕션에서는 이 분기가 동작하지 않는다.
  if (isFieldNoLoginEnabled()) {
    return NextResponse.next({ request });
  }

  if (PUBLIC_MARKETING_ROUTES.has(pathname)) {
    return NextResponse.next({ request });
  }

  if (pathname === '/composer') {
    return NextResponse.next({ request });
  }

  // [FIX: VIDEO] 영상 업로드(POST) + 영상 파일 서빙(GET) 은 Supabase 세션 갱신을 거치면
  //   문제가 생긴다:
  //   - 업로드: setAll → NextResponse.next({ request }) 재생성에서 body 가 깨져
  //     req.formData()/arrayBuffer() 파싱이 흔들림.
  //   - 파일 서빙: <video> 가 range 요청을 수십 개 보내는데 매 요청마다 getUser()
  //     네트워크 조회가 붙어 출력 창에서 로딩이 지연/정지될 수 있음.
  //   업로드 라우트는 자체 requireRequestRole('crew') 인증, 파일 서빙은 공개 라우트라
  //   둘 다 미들웨어를 순수 통과(NextResponse.next())시켜도 안전하다.
  if (pathname.startsWith('/api/media/videos/')) {
    return NextResponse.next();
  }

  if (isFieldNoLoginEnabled() && isFieldNoLoginPath(pathname)) {
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isAuthenticated = !!user;

  // 인증 플로우 라우트는 항상 통과
  if (AUTH_FLOW_ROUTES.some((route) => pathname.startsWith(route))) {
    return supabaseResponse;
  }

  // 보호된 라우트: 미인증 시 /login으로 리다이렉트
  if (PROTECTED_ROUTES.some((route) => pathname.startsWith(route))) {
    if (!isAuthenticated) {
      const allowRuntimeOverlay =
        isPrivateHost &&
        (
          pathname === '/media' ||
          pathname === '/media/broadcast' ||
          pathname === '/media/canvas' ||
          pathname === '/media/fellowship' ||
          pathname === '/media/settings'
        );
      if (allowRuntimeOverlay) {
        return supabaseResponse;
      }

      // ── 디바이스 토큰 우회 ────────────────────────────────────────────
      // Electron 앱이 X-Device-Token 헤더를 붙인 요청이고, 허용된 경로라면
      // Supabase 세션 없이도 통과시킨다. 이 경로에서 호출된 다운스트림은
      // supabaseResponse.headers 의 x-device-church-id 로 테넌트를 식별 가능.
      const deviceToken = request.headers.get('x-device-token');
      const allowDeviceBypass = DEVICE_TOKEN_ALLOWED_PREFIXES.some((p) => pathname.startsWith(p));

      if (deviceToken && allowDeviceBypass) {
        const verified = await verifyDeviceTokenFast(deviceToken);
        if (verified) {
          supabaseResponse.headers.set('x-device-church-id', verified.churchId ?? '');
          supabaseResponse.headers.set('x-device-user-id', verified.userId);
          return supabaseResponse;
        }
      }

      const authUrl = request.nextUrl.clone();
      authUrl.pathname = pathname.startsWith('/signup/church') ? '/signup' : '/login';
      authUrl.search = '';
      authUrl.searchParams.set('redirectTo', `${pathname}${request.nextUrl.search}`);
      return NextResponse.redirect(authUrl);
    }
  }

  // 공개 인증 라우트: 이미 로그인된 사용자는 redirectTo (또는 랜딩 홈) 으로
  if (PUBLIC_AUTH_ROUTES.some((route) => pathname === route)) {
    if (isAuthenticated) {
      // ?redirectTo= 가 있으면 거기로 (Electron 디바이스 브릿지 등).
      //   open-redirect 방지를 위해 절대 URL 은 거부, 내부 경로(/) 만 허용.
      const redirectParam = request.nextUrl.searchParams.get('redirectTo');
      const target = request.nextUrl.clone();
      if (redirectParam && redirectParam.startsWith('/') && !redirectParam.startsWith('//')) {
        // redirectTo 자체에 쿼리스트링이 있을 수 있으므로 URL 로 파싱 재구성
        try {
          const parsed = new URL(redirectParam, request.url);
          target.pathname = parsed.pathname;
          target.search = parsed.search;
        } catch {
          target.pathname = '/';
          target.search = '';
        }
      } else {
        target.pathname = '/';
        target.search = '';
      }
      return NextResponse.redirect(target);
    }
  }

  // 프로필 미완성 체크: 로그인 되었지만 프로필 미완성이면 /complete-profile로
  if (isAuthenticated) {
    const profileCompleted = user.user_metadata?.profile_completed;
    const isExempt = PROFILE_EXEMPT_ROUTES.some((route) => pathname.startsWith(route));

    if (!profileCompleted && !isExempt) {
      const profileUrl = request.nextUrl.clone();
      profileUrl.pathname = '/complete-profile';
      return NextResponse.redirect(profileUrl);
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|json|woff|woff2|ttf|otf)$).*)',
  ],
};
