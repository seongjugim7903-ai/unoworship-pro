'use client';

/**
 * /login — UnoWorship 계정 로그인
 *
 * 용도:
 *   1. Electron 앱 기기 인증: 앱이 /login?redirectTo=/auth/device/bridge?... 를 연다
 *   2. 웹 워크스페이스 로그인 (향후 확장)
 *
 * 환경변수 미설정(NEXT_PUBLIC_SUPABASE_*) 시 안내만 표시하고 크래시하지 않는다.
 */

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '../../lib/authn/supabaseBrowser';
import { KAKAO_SCOPES } from '../../lib/authn/kakaoScopes';

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '16px',
    background: '#f8fafc',
    colorScheme: 'light',
    fontFamily: "'Pretendard', 'Apple SD Gothic Neo', sans-serif",
  },
  card: {
    width: '100%',
    maxWidth: '420px',
    background: '#ffffff',
    borderRadius: '16px',
    padding: '32px',
    boxShadow: '0 10px 30px rgba(15, 23, 42, 0.08)',
  },
  title: { fontSize: '22px', fontWeight: 800, color: '#0f172a', textAlign: 'center', margin: 0 },
  subtitle: { fontSize: '13px', color: '#64748b', textAlign: 'center', margin: '8px 0 24px' },
  label: { display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' },
  input: {
    width: '100%',
    boxSizing: 'border-box',
    borderRadius: '10px',
    border: '1px solid #cbd5e1',
    padding: '10px 12px',
    fontSize: '14px',
    color: '#0f172a',
    marginBottom: '14px',
  },
  /* 카카오 공식 색 — 노란 바탕에 검은 글씨. 다른 색을 쓰면 사용자가 못 알아본다 */
  kakaoButton: {
    width: '100%',
    borderRadius: '10px',
    border: 'none',
    background: '#FEE500',
    color: 'rgba(0,0,0,0.85)',
    fontWeight: 700,
    fontSize: '14px',
    padding: '13px 0',
    cursor: 'pointer',
  },
  divider: {
    margin: '18px 0 10px',
    color: '#94a3b8',
    fontSize: '12px',
    textAlign: 'center',
  },
  button: {
    width: '100%',
    borderRadius: '10px',
    border: 'none',
    background: '#4f46e5',
    color: '#ffffff',
    fontWeight: 700,
    fontSize: '14px',
    padding: '11px 0',
    cursor: 'pointer',
  },
  error: {
    borderRadius: '10px',
    background: '#fef2f2',
    color: '#dc2626',
    fontSize: '13px',
    padding: '10px 12px',
    marginBottom: '14px',
  },
  notice: {
    borderRadius: '10px',
    background: '#fffbeb',
    color: '#92400e',
    fontSize: '13px',
    padding: '10px 12px',
    lineHeight: 1.6,
  },
};

function LoginInner() {
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirectTo') || '/';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supabaseAvailable = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  /** fetch 실패 시 원인 특정용 연결 진단 — Supabase 인증 서버 도달 여부를 확인한다 */
  async function diagnoseConnectivity(): Promise<string> {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const results: string[] = [];
    try {
      const res = await fetch(`${supabaseUrl}/auth/v1/health`, {
        headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '' },
        signal: AbortSignal.timeout(7000),
      });
      results.push(`인증 서버 연결: ${res.ok ? '정상' : `응답 ${res.status}`}`);
    } catch (e) {
      results.push(
        `인증 서버 연결 실패 (${(e as Error).name}) — 이 네트워크에서 ${supabaseUrl.replace('https://', '')} 접속이 차단되었을 수 있습니다. ` +
          '공유기/방화벽 설정 또는 다른 네트워크(핸드폰 핫스팟)로 확인해 보세요.'
      );
    }
    try {
      await fetch('/api/auth/device/verify', { method: 'POST', body: '{}', signal: AbortSignal.timeout(7000) });
      results.push('웹 서버 연결: 정상');
    } catch {
      results.push('웹 서버 연결 실패 — 인터넷 연결 자체를 확인해 주세요.');
    }
    return results.join(' · ');
  }

  /* 카카오 로그인 — 대상이 찬양팀원·반주자라 이쪽이 주 경로다.
     돌아올 곳은 우리 앱의 /auth/callback 이고, 거기서 세션 쿠키로 바꾼다. */
  async function handleKakao() {
    setIsLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      if (!supabase) {
        setError('로그인 환경이 아직 설정되지 않았습니다. 관리자에게 문의하세요.');
        return;
      }
      const target = redirectTo.startsWith('/') && !redirectTo.startsWith('//') ? redirectTo : '/onboarding';
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'kakao',
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(target)}`,
          scopes: KAKAO_SCOPES,
        },
      });
      if (oauthError) setError(`카카오 로그인을 시작하지 못했습니다. ${oauthError.message}`);
      /* 성공하면 카카오로 넘어가므로 여기 아래는 실행되지 않는다 */
    } catch (err) {
      setError(err instanceof Error ? err.message : '카카오 로그인을 시작하지 못했습니다.');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      if (!supabase) {
        setError('로그인 환경이 아직 설정되지 않았습니다. 관리자에게 문의하세요.');
        return;
      }
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) {
        if (signInError.message === 'Invalid login credentials') {
          setError('이메일 또는 비밀번호가 올바르지 않습니다.');
        } else if (/fetch/i.test(signInError.message)) {
          const diagnosis = await diagnoseConnectivity();
          setError(`인증 서버에 연결하지 못했습니다. [진단] ${diagnosis}`);
        } else {
          setError(`${signInError.name ?? 'Error'}: ${signInError.message}`);
        }
        return;
      }
      // open-redirect 방지: 내부 경로만 허용
      const target = redirectTo.startsWith('/') && !redirectTo.startsWith('//') ? redirectTo : '/';
      window.location.href = target;
    } catch (err) {
      const detail = err instanceof Error ? `${err.name}: ${err.message}` : '알 수 없는 오류';
      if (err instanceof Error && /fetch/i.test(err.message)) {
        const diagnosis = await diagnoseConnectivity();
        setError(`인증 서버에 연결하지 못했습니다. [진단] ${diagnosis}`);
      } else {
        setError(detail);
      }
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h1 style={styles.title}>UnoWorship 로그인</h1>
        <p style={styles.subtitle}>교회 계정으로 로그인하세요</p>

        {!supabaseAvailable ? (
          <div style={styles.notice}>
            로그인 환경변수(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY)가 아직
            설정되지 않았습니다. Vercel 프로젝트 설정에서 등록해 주세요.
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={handleKakao}
              disabled={isLoading}
              style={{ ...styles.kakaoButton, opacity: isLoading ? 0.6 : 1 }}
            >
              카카오로 로그인
            </button>
            <p style={styles.divider}>또는 이메일로</p>

          <form onSubmit={handleSubmit}>
            <label htmlFor="email" style={styles.label}>이메일</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={isLoading}
              style={styles.input}
              placeholder="you@example.com"
            />

            <label htmlFor="password" style={styles.label}>비밀번호</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={isLoading}
              style={styles.input}
              placeholder="••••••••"
            />

            {error && <div style={styles.error}>{error}</div>}

            <button type="submit" disabled={isLoading} style={{ ...styles.button, opacity: isLoading ? 0.6 : 1 }}>
              {isLoading ? '로그인 중...' : '로그인'}
            </button>
          </form>
          </>
        )}
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginInner />
    </Suspense>
  );
}
