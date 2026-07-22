'use client';

import { useSearchParams, useRouter } from 'next/navigation';

const EMAIL_PROVIDERS: Record<string, { name: string; url: string }> = {
  'gmail.com':       { name: 'Gmail',       url: 'https://mail.google.com' },
  'googlemail.com':  { name: 'Gmail',       url: 'https://mail.google.com' },
  'naver.com':       { name: 'Naver 메일',  url: 'https://mail.naver.com' },
  'daum.net':        { name: 'Daum 메일',   url: 'https://mail.daum.net' },
  'hanmail.net':     { name: 'Daum 메일',   url: 'https://mail.daum.net' },
  'kakao.com':       { name: 'Kakao 메일',  url: 'https://mail.kakao.com' },
  'nate.com':        { name: 'Nate 메일',   url: 'https://mail.nate.com' },
  'outlook.com':     { name: 'Outlook',     url: 'https://outlook.live.com' },
  'hotmail.com':     { name: 'Outlook',     url: 'https://outlook.live.com' },
  'yahoo.com':       { name: 'Yahoo Mail',  url: 'https://mail.yahoo.com' },
  'icloud.com':      { name: 'iCloud Mail', url: 'https://www.icloud.com/mail' },
};

function getEmailProvider(email: string) {
  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain) return null;
  return EMAIL_PROVIDERS[domain] ?? null;
}

export function EmailConfirmBanner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const email = searchParams.get('emailConfirm');
  const verified = searchParams.get('verified') === '1';
  const redirectTo = searchParams.get('redirectTo') || '/signup/church';

  if (verified) {
    return (
      <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
        <p className="text-sm font-semibold text-emerald-900">이메일 인증이 완료되었습니다</p>
        <p className="mt-1 text-sm text-emerald-700">
          로그인 후 교회 워크스페이스 신청을 이어갈 수 있습니다.
        </p>
      </div>
    );
  }

  if (!email) return null;

  const provider = getEmailProvider(email);

  return (
    <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 mb-6">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 text-xl">📧</span>
        <div className="flex-1">
          <p className="text-sm font-semibold text-indigo-900">이메일 인증이 필요합니다</p>
          <p className="mt-1 text-sm text-indigo-700">
            <strong>{email}</strong> 으로 인증 메일을 보냈습니다.
            <br />메일함에서 인증 링크를 클릭한 후 로그인해주세요.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {provider && (
              <a href={provider.url} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors">
                {provider.name} 열기 <span className="text-xs">↗</span>
              </a>
            )}
            <button type="button" onClick={() => router.replace(`/login?redirectTo=${encodeURIComponent(redirectTo)}`)}
              className="inline-flex items-center rounded-lg border border-indigo-300 bg-white px-4 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-50 transition-colors">
              인증 완료했어요
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
