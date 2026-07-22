'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signUpWithEmail } from '@/lib/auth/actions';

interface SignUpFormProps {
  onSuccess?: () => void;
  redirectTo?: string;
}

export function SignUpForm({ onSuccess, redirectTo = '/' }: SignUpFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError('비밀번호가 일치하지 않습니다');
      return;
    }
    if (password.length < 6) {
      setError('비밀번호는 최소 6자 이상이어야 합니다');
      return;
    }

    setIsLoading(true);

    try {
      const result = await signUpWithEmail(email, password, undefined, redirectTo);
      if (result.error) {
        setError(result.error.message || '회원가입에 실패했습니다');
        return;
      }
      setSuccess(true);
      onSuccess?.();
      router.push(`/login?emailConfirm=${encodeURIComponent(email)}&redirectTo=${encodeURIComponent(redirectTo)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다');
    } finally {
      setIsLoading(false);
    }
  }

  if (success) {
    return (
      <div className="rounded-lg bg-green-50 p-4">
        <p className="text-sm text-green-600">
          회원가입이 완료되었습니다! 이메일을 확인하여 계정을 활성화하세요.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="signup-email" className="block text-sm font-medium text-gray-700">이메일</label>
        <input id="signup-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
          required disabled={isLoading}
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 disabled:bg-gray-100"
          placeholder="you@example.com" />
      </div>
      <div>
        <label htmlFor="signup-password" className="block text-sm font-medium text-gray-700">비밀번호</label>
        <input id="signup-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
          required disabled={isLoading}
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 disabled:bg-gray-100"
          placeholder="••••••••" />
        <p className="mt-1 text-xs text-gray-500">최소 6자 이상</p>
      </div>
      <div>
        <label htmlFor="signup-confirm" className="block text-sm font-medium text-gray-700">비밀번호 확인</label>
        <input id="signup-confirm" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
          required disabled={isLoading}
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 disabled:bg-gray-100"
          placeholder="••••••••" />
      </div>
      {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</div>}
      <button type="submit" disabled={isLoading}
        className="w-full rounded-lg bg-indigo-600 py-2.5 text-white font-medium hover:bg-indigo-700 disabled:bg-gray-400 transition-colors">
        {isLoading ? '회원가입 중...' : '회원가입'}
      </button>
    </form>
  );
}
