'use client';

/**
 * PricingPage — /media/pricing
 *
 * 3티어 요금제 + 하드웨어 번들 업세일.
 * 실제 결제/Stripe 연결은 Phase 3.
 */

const TIERS = [
  {
    id: 'starter',
    name: 'Starter',
    price: '무료',
    period: '',
    description: '교회 방송실 1명 오퍼레이터 + 자막협조 10명까지',
    highlight: false,
    features: [
      '자막협조 (요청 · 공지 · 채팅)',
      '찬양콘티 · 주보 입력',
      'UnoLive 데스크탑 (녹화)',
      '720p 유튜브 라이브 1채널',
      '교회 로고 워터마크',
      '커뮤니티 지원',
    ],
    cta: '무료로 시작',
  },
  {
    id: 'standard',
    name: 'Standard',
    price: '₩39,000',
    period: '/월',
    description: '소형 교회 표준 · 30~150명 규모',
    highlight: true,
    features: [
      'Starter 전체 포함',
      '1080p 60fps 라이브',
      '자막협조 무제한',
      '멤버 최대 30명',
      '자막 템플릿 라이브러리',
      '찬양 DB · 악보 변조',
      '이메일 지원',
    ],
    cta: '표준 플랜 시작',
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '₩89,000',
    period: '/월',
    description: '중형 교회 · 150~500명 규모',
    highlight: false,
    features: [
      'Standard 전체 포함',
      '멀티 카메라 (ATEM 연동)',
      '오디오 콘솔 (Phase 2)',
      '멤버 무제한',
      '멀티 캠퍼스 지원',
      '화이트 라벨 브랜딩',
      '우선 전화 지원',
      'CCLI/KCMA 자동 보고',
    ],
    cta: 'Pro 문의',
  },
];

export default function PricingPage() {
  return (
    <main className="flex-1">
      {/* 헤더 */}
      <section className="px-6 py-16 text-center bg-gradient-to-b from-violet-50/50 to-white">
        <p className="text-[11px] font-semibold tracking-widest text-violet-600 uppercase">
          Pricing
        </p>
        <h1 className="mt-2 text-4xl md:text-5xl font-extrabold text-gray-900">
          교회 규모에 맞는 요금제
        </h1>
        <p className="mt-4 text-base text-gray-600 max-w-xl mx-auto">
          Starter는 영구 무료입니다. 하드웨어 번들 구매 시 Pro 플랜 1년 무료 제공.
        </p>
      </section>

      {/* 3개 티어 */}
      <section className="max-w-[1200px] mx-auto px-6 pb-16">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {TIERS.map((tier) => (
            <div
              key={tier.id}
              className={`relative rounded-2xl border p-6 transition-all ${
                tier.highlight
                  ? 'border-violet-300 bg-gradient-to-b from-white to-violet-50/40 shadow-xl shadow-violet-200/30 md:-translate-y-2'
                  : 'border-gray-200 bg-white hover:shadow-md'
              }`}
            >
              {tier.highlight && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-violet-600 text-white text-[10px] font-bold tracking-wider shadow">
                  MOST POPULAR
                </span>
              )}

              <h3 className="text-lg font-bold text-gray-900">{tier.name}</h3>
              <p className="mt-1 text-[12px] text-gray-500 min-h-[2.5em]">
                {tier.description}
              </p>

              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-3xl font-extrabold text-gray-900">
                  {tier.price}
                </span>
                {tier.period && (
                  <span className="text-sm text-gray-500">{tier.period}</span>
                )}
              </div>

              <button
                className={`mt-5 w-full h-11 rounded-xl text-sm font-semibold transition-colors ${
                  tier.highlight
                    ? 'bg-violet-600 hover:bg-violet-500 text-white'
                    : 'bg-gray-100 hover:bg-gray-200 text-gray-800'
                }`}
              >
                {tier.cta}
              </button>

              <ul className="mt-6 space-y-2.5">
                {tier.features.map((f) => (
                  <li
                    key={f}
                    className="flex items-start gap-2 text-[12px] text-gray-700"
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      className="text-violet-500 mt-0.5 shrink-0"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* 하단 FAQ 한 문단 */}
        <div className="mt-16 text-center">
          <h3 className="text-xl font-bold text-gray-900">문의가 있으신가요?</h3>
          <p className="mt-2 text-sm text-gray-600">
            교회 규모 · 기존 장비 · 예배 형태를 공유해 주시면 최적 구성을 제안해 드립니다.
          </p>
          <button className="mt-5 px-6 h-11 rounded-xl border border-gray-300 bg-white text-gray-800 text-sm font-semibold hover:border-violet-400 hover:text-violet-700 transition-colors">
            상담 요청하기
          </button>
        </div>
      </section>
    </main>
  );
}
