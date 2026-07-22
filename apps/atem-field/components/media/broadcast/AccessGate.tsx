'use client';

/**
 * AccessGate — 대시보드 접근 불가 시 안내
 *
 * Supabase auth role 기반:
 *   - admin / superadmin → 통과 (이 컴포넌트 렌더 안 됨)
 *   - member / crew → 접근 불가 안내
 *   - guest (미로그인) → 로그인 유도
 */

import Link from 'next/link';
import { useAuthContext } from '@/lib/auth/AuthProvider';
import { ROLE_LABEL } from '@/lib/auth/types';

export default function AccessGate() {
  const { isAuthenticated, role } = useAuthContext();

  return (
    <main className="flex-1 flex items-center justify-center px-6 py-24">
      <div className="max-w-lg text-center rounded-2xl border border-gray-200 bg-white p-10 shadow-sm">
        <div className="w-16 h-16 mx-auto rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 mb-4">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>
        <h2 className="text-lg font-bold text-gray-900">접근 권한이 없습니다</h2>
        <p className="mt-2 text-sm text-gray-600 leading-relaxed">
          {!isAuthenticated ? (
            '대시보드에 접근하려면 먼저 로그인해 주세요.'
          ) : (
            <>
              대시보드는 <strong>관리자</strong> 이상만 접근할 수 있습니다.
              <br />
              현재 등급: <span className="font-semibold text-violet-600">{ROLE_LABEL[role]}</span>
              <br />
              <span className="text-gray-400 text-xs mt-1 inline-block">
                관리자에게 등급 변경을 요청하세요.
              </span>
            </>
          )}
        </p>
        <div className="mt-6 flex items-center justify-center gap-2">
          {!isAuthenticated ? (
            <Link
              href="/login"
              className="px-4 h-10 flex items-center rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-[12px] font-semibold transition-colors"
            >
              로그인
            </Link>
          ) : (
            <>
              <Link
                href="/media"
                className="px-4 h-10 flex items-center rounded-lg border border-gray-300 bg-white text-[12px] font-semibold text-gray-700 hover:border-violet-400 hover:text-violet-700 transition-colors"
              >
                워크스페이스로
              </Link>
              <Link
                href="/media/product"
                className="px-4 h-10 flex items-center rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-[12px] font-semibold transition-colors"
              >
                제품 안내 보기
              </Link>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
