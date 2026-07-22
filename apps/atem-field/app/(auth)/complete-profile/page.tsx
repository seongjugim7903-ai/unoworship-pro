'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { updateProfile } from '@/lib/auth/actions';

export default function CompleteProfilePage() {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (!fullName.trim()) {
      setError('이름을 입력해주세요');
      return;
    }

    setIsLoading(true);

    try {
      const result = await updateProfile({
        full_name: fullName.trim(),
        phone: phone.trim(),
      });

      if (result.error) {
        setError(result.error.message);
        return;
      }

      // 프로필 완성 후 랜딩 홈으로 이동 (새로고침으로 세션 갱신)
      window.location.href = '/';
    } catch {
      setError('오류가 발생했습니다. 다시 시도해주세요.');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div
      className="flex min-h-screen items-center justify-center px-4"
      style={{ background: '#f8fafc', colorScheme: 'light' }}
    >
      <div className="w-full max-w-md">
        <div className="rounded-2xl bg-white p-8 shadow-lg">
          <div className="mb-6 text-center">
            <span className="text-4xl">👋</span>
            <h1 className="mt-3 text-2xl font-bold text-gray-900">환영합니다!</h1>
            <p className="mt-2 text-sm text-gray-600">
              사역 협력을 위해 성함과 연락처를 기입해주세요
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="fullName" className="block text-sm font-medium text-gray-700">
                이름 <span className="text-red-500">*</span>
              </label>
              <input
                id="fullName"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                disabled={isLoading}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 disabled:bg-gray-100"
                placeholder="홍길동"
              />
            </div>

            <div>
              <label htmlFor="phone" className="block text-sm font-medium text-gray-700">
                연락처
              </label>
              <input
                id="phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={isLoading}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 disabled:bg-gray-100"
                placeholder="010-1234-5678"
              />
              <p className="mt-1 text-xs text-gray-500">팀 소통 및 긴급 연락용</p>
            </div>

            {error && (
              <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full rounded-lg bg-indigo-600 py-2.5 text-white font-medium hover:bg-indigo-700 disabled:bg-gray-400 transition-colors"
            >
              {isLoading ? '저장 중...' : '시작하기'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
