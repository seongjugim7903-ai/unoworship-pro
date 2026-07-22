'use client';

/**
 * GuestWelcome — 비로그인 방문자 첫 진입 안내
 *
 * /media 를 처음 방문했을 때 짧은 안내 + 상단 좌측 메뉴
 * (회사/제품/프라이싱/리소스)로 유도. 상세 제품 히어로는 /media/product 에.
 */

import Link from 'next/link';

export default function GuestWelcome() {
  return (
    <main className="flex-1 flex items-center justify-center px-6 py-24">
      <div className="max-w-xl text-center">
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-violet-100 border border-violet-200 text-[11px] font-semibold text-violet-700">
          <span className="w-1.5 h-1.5 rounded-full bg-violet-500 animate-pulse" />
          소형 교회 원맨 방송실을 위한 올인원 플랫폼
        </span>

        <h1 className="mt-6 text-3xl md:text-4xl font-extrabold text-gray-900 leading-tight tracking-tight">
          예배는 한 사람이 섬겨도,
          <br />
          <span className="bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-transparent">
            준비는 온 교회가 함께.
          </span>
        </h1>

        <p className="mt-5 text-base text-gray-600 leading-relaxed">
          UnoMedia는 교회 미디어부를 위한 협업 + 입력 + 방송 관제 플랫폼이고,
          <br className="hidden md:inline" />
          UnoLive 데스크탑과 함께 한 사람이 모든 예배 방송을 해낼 수 있게 합니다.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/media/product"
            className="px-5 h-11 flex items-center rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white text-sm font-semibold shadow-lg shadow-violet-500/20 hover:shadow-xl hover:scale-[1.02] transition-all"
          >
            제품 둘러보기
          </Link>
          <Link
            href="/media/pricing"
            className="px-5 h-11 flex items-center rounded-xl bg-white border border-gray-300 text-gray-800 text-sm font-semibold hover:border-violet-400 hover:text-violet-700 transition-colors"
          >
            요금제 보기
          </Link>
        </div>

        <p className="mt-6 text-[11px] text-gray-400">
          이미 교회 미디어부에 소속되어 있으신가요?{' '}
          <span className="text-violet-600 font-semibold">상단 우측 [로그인]</span>
          에서 접속해 주세요.
        </p>
      </div>
    </main>
  );
}
