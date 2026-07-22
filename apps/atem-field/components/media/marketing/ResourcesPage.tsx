'use client';

/**
 * ResourcesPage — /media/resources
 *
 * "그 외" — 블로그 / 도움말 / 케이스 스터디 / 튜토리얼 허브.
 * Phase 2A 셸.
 */

import Link from 'next/link';

const RESOURCES = [
  {
    kind: '가이드',
    title: 'UnoLive 데스크탑 첫 설치',
    body: 'Mac mini에 UnoLive를 설치하고 첫 예배 방송을 준비하는 10분 가이드.',
    href: '#',
    color: 'from-violet-500 to-purple-600',
  },
  {
    kind: '튜토리얼',
    title: '찬양콘티 위저드 사용법',
    body: '찬양팀장이 30분 만에 주일 콘티를 확정하고 방송실로 전달하는 워크플로.',
    href: '#',
    color: 'from-indigo-500 to-blue-600',
  },
  {
    kind: '케이스 스터디',
    title: '은혜교회 (180명) 적용기',
    body: '기존 외주 방송에서 UnoMedia 전환 후 월 120만원 절감 + 봉사자 만족도 개선.',
    href: '#',
    color: 'from-emerald-500 to-teal-600',
  },
  {
    kind: '블로그',
    title: '원맨 방송실을 위한 오디오 셋업',
    body: 'Focusrite Scarlett 2i2 + SM58 조합으로 150만원 이하에 깔끔한 예배 오디오를.',
    href: '#',
    color: 'from-amber-500 to-orange-600',
  },
  {
    kind: '도움말',
    title: 'YouTube 라이브 스트림 키 연결',
    body: '유튜브 스트림 키 발급부터 UnoLive 설정까지 단계별 스크린샷 가이드.',
    href: '#',
    color: 'from-rose-500 to-red-600',
  },
  {
    kind: '크리에이터',
    title: '교회 봉사자에서 개인 크리에이터로',
    body: '교회 방송을 섬기던 분들이 개인 채널 · 소규모 모임 · 가정예배까지 확장한 사례.',
    href: '#',
    color: 'from-sky-500 to-cyan-600',
  },
];

export default function ResourcesPage() {
  return (
    <main className="flex-1">
      <section className="max-w-[1200px] mx-auto px-6 py-16">
        <p className="text-[11px] font-semibold tracking-widest text-violet-600 uppercase">
          Resources
        </p>
        <h1 className="mt-2 text-3xl md:text-4xl font-extrabold text-gray-900">
          가이드 · 튜토리얼 · 사례 · 블로그
        </h1>
        <p className="mt-2 text-sm text-gray-600 max-w-xl">
          UnoMedia를 더 잘 쓰기 위한 문서들. 정기적으로 업데이트됩니다.
        </p>

        <div className="mt-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {RESOURCES.map((r) => (
            <Link
              key={r.title}
              href={r.href}
              className="group rounded-2xl border border-gray-200 bg-white p-5 hover:shadow-lg hover:-translate-y-0.5 transition-all"
            >
              <div
                className={`w-10 h-10 rounded-lg bg-gradient-to-br ${r.color} shadow-sm mb-4`}
              />
              <span className="text-[10px] font-semibold tracking-wide text-violet-600 uppercase">
                {r.kind}
              </span>
              <h3 className="mt-1 text-base font-bold text-gray-900 group-hover:text-violet-700 transition-colors">
                {r.title}
              </h3>
              <p className="mt-1.5 text-[12px] text-gray-600 leading-relaxed">
                {r.body}
              </p>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
