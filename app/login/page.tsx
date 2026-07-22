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
        setError(
          signInError.message === 'Invalid login credentials'
            ? '이메일 또는 비밀번호가 올바르지 않습니다.'
            : signInError.message
        );
        return;
      }
      // open-redirect 방지: 내부 경로만 허용
      const target = redirectTo.startsWith('/') && !redirectTo.startsWith('//') ? redirectTo : '/';
      window.location.href = target;
    } catch (err) {
      setError(err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.');
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
