import Link from 'next/link';
import { SignUpForm } from '@/components/auth/SignUpForm';

type SignUpPageProps = {
  searchParams: Promise<{ redirectTo?: string | string[] }>;
};

function getRedirectTo(value: string | string[] | undefined): string {
  const redirectTo = Array.isArray(value) ? value[0] : value;
  if (redirectTo && redirectTo.startsWith('/') && !redirectTo.startsWith('//')) {
    return redirectTo;
  }
  return '/';
}

export default async function SignUpPage({ searchParams }: SignUpPageProps) {
  const redirectTo = getRedirectTo((await searchParams).redirectTo);

  return (
    <div
      className="flex min-h-screen items-center justify-center px-4"
      style={{ background: '#f8fafc', colorScheme: 'light' }}
    >
      <div className="w-full max-w-md">
        <div className="rounded-2xl bg-white p-8 shadow-lg">
          <div className="mb-6 text-center">
            <h1 className="text-2xl font-bold text-gray-900">UnoMedia 회원가입</h1>
            <p className="mt-2 text-sm text-gray-600">
              새 계정을 만드세요
            </p>
          </div>

          <SignUpForm redirectTo={redirectTo} />

          <div className="mt-6 text-center text-sm text-gray-600">
            이미 계정이 있으신가요?{' '}
            <Link href="/login" className="font-medium text-indigo-600 hover:text-indigo-500">
              로그인
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
