'use client';

import { useState } from 'react';
import Link from 'next/link';
import { resetPassword } from '@/lib/auth/actions';

const EMAIL_PROVIDERS: Record<string, { name: string; url: string }> = {
  'gmail.com':      { name: 'Gmail',      url: 'https://mail.google.com' },
  'googlemail.com': { name: 'Gmail',      url: 'https://mail.google.com' },
  'naver.com':      { name: 'Naver 메일', url: 'https://mail.naver.com' },
  'daum.net':       { name: 'Daum 메일',  url: 'https://mail.daum.net' },
  'hanmail.net':    { name: 'Daum 메일',  url: 'https://mail.daum.net' },
  'kakao.com':      { name: 'Kakao 메일', url: 'https://mail.kakao.com' },
  'outlook.com':    { name: 'Outlook',    url: 'https://outlook.live.com' },
  'hotmail.com':    { name: 'Outlook',    url: 'https://outlook.live.com' },
  'yahoo.com':      { name: 'Yahoo Mail', url: 'https://mail.yahoo.com' },
  'icloud.com':     { name: 'iCloud Mail',url: 'https://www.icloud.com/mail' },
};

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const domain = email.split('@')[1]?.toLowerCase();
  const provider = domain ? EMAIL_PROVIDERS[domain] ?? null : null;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const result = await resetPassword(email);
      if (result.error) {
        setError(result.error.message);
        return;
      }
      setSent(true);
    } catch {
      setError('오류가 발생했습니다. 다시 시도해주세요.');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4"
      style={{ background: '#f8fafc', colorScheme: 'light' }}>
      <div className="w-full max-w-md">
        <div className="rounded-2xl bg-white p-8 shadow-lg">
          <div className="mb-6 text-center">
            <h1 className="text-2xl font-bold text-gray-900">비밀번호 찾기</h1>
            <p className="mt-2 text-sm text-gray-600">
              가입한 이메일로 비밀번호 재설정 링크를 보내드립니다
            </p>
          </div>

          {sent ? (
            <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 text-xl">📧</span>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-indigo-900">이메일을 확인하세요</p>
                  <p className="mt-1 text-sm text-indigo-700">
                    <strong>{email}</strong> 으로 비밀번호 재설정 링크를 보냈습니다.
                    <br />메일함에서 링크를 클릭하여 새 비밀번호를 설정하세요.
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {provider && (
                      <a href={provider.url} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors">
                        {provider.name} 열기 <span className="text-xs">↗</span>
                      </a>
                    )}
                    <Link href="/login"
                      className="inline-flex items-center rounded-lg border border-indigo-300 bg-white px-4 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-50 transition-colors">
                      로그인으로 돌아가기
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700">이메일</label>
                <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  required disabled={isLoading}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 disabled:bg-gray-100"
                  placeholder="you@example.com" />
              </div>
              {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</div>}
              <button type="submit" disabled={isLoading}
                className="w-full rounded-lg bg-indigo-600 py-2.5 text-white font-medium hover:bg-indigo-700 disabled:bg-gray-400 transition-colors">
                {isLoading ? '전송 중...' : '비밀번호 재설정 이메일 보내기'}
              </button>
            </form>
          )}

          <div className="mt-6 text-center text-sm text-gray-600">
            <Link href="/login" className="font-medium text-indigo-600 hover:text-indigo-500">
              로그인으로 돌아가기
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
