'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { signInWithEmail } from '@/lib/auth/actions';

interface LoginFormProps {
  onSuccess?: () => void;
  redirectTo?: string;
}

export function LoginForm({ onSuccess, redirectTo: redirectToProp = '/' }: LoginFormProps) {
  // ?redirectTo=... 쿼리 파라미터가 있으면 prop 보다 우선 (Electron 로그인 창에서 사용)
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirectTo') || redirectToProp;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const result = await signInWithEmail(email, password);
      if (result.error) {
        setError(result.error.message || '로그인에 실패했습니다');
        return;
      }
      if (onSuccess) {
        onSuccess();
      } else {
        window.location.href = redirectTo;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-gray-700">
          이메일
        </label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          disabled={isLoading}
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 disabled:bg-gray-100"
          placeholder="you@example.com"
        />
      </div>

      <div>
        <label htmlFor="password" className="block text-sm font-medium text-gray-700">
          비밀번호
        </label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          disabled={isLoading}
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 disabled:bg-gray-100"
          placeholder="••••••••"
        />
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</div>
      )}

      <button
        type="submit"
        disabled={isLoading}
        className="w-full rounded-lg bg-indigo-600 py-2.5 text-white font-medium hover:bg-indigo-700 disabled:bg-gray-400 transition-colors"
      >
        {isLoading ? '로그인 중...' : '로그인'}
      </button>
    </form>
  );
}
