import { Suspense } from 'react';
import Link from 'next/link';
import { LoginForm } from '@/components/auth/LoginForm';
import { EmailConfirmBanner } from '@/components/auth/EmailConfirmBanner';

export default function AuthPage() {
  return (
    <div
      className="flex min-h-screen items-center justify-center px-4"
      style={{ background: '#f8fafc', colorScheme: 'light' }}
    >
      <div className="w-full max-w-md">
        <div className="rounded-2xl bg-white p-8 shadow-lg">
          <Suspense>
            <EmailConfirmBanner />
          </Suspense>

          <div className="mb-6 text-center">
            <h1 className="text-2xl font-bold text-gray-900">UnoMedia 로그인</h1>
            <p className="mt-2 text-sm text-gray-600">
              미디어부 협업 공간에 로그인하세요
            </p>
          </div>

          <Suspense>
            <LoginForm redirectTo="/" />
          </Suspense>

          <div className="mt-6 text-center text-sm text-gray-600">
            계정이 없으신가요?{' '}
            <Link href="/signup" className="font-medium text-indigo-600 hover:text-indigo-500">
              회원가입
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
