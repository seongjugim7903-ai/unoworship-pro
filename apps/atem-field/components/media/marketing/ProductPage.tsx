'use client';

/**
 * ProductPage — /media/product
 *
 * UnoMedia + UnoLive 제품 랜딩 (이전 GuestHero 본체).
 * 좌측 내비 "제품" 항목의 대상 페이지.
 */

export default function ProductPage() {
  return (
    <main className="flex-1">
      {/* 히어로 */}
      <section className="relative overflow-hidden bg-gradient-to-br from-violet-50 via-white to-indigo-50 border-b border-gray-200">
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.04] pointer-events-none"
          style={{
            backgroundImage:
              'radial-gradient(circle at 1px 1px, #7c3aed 1px, transparent 0)',
            backgroundSize: '24px 24px',
          }}
        />
        <div className="relative max-w-[1200px] mx-auto px-6 py-20 md:py-28 text-center">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-violet-100 border border-violet-200 text-[11px] font-semibold text-violet-700">
            <span className="w-1.5 h-1.5 rounded-full bg-violet-500 animate-pulse" />
            UnoMedia + UnoLive · 올인원 교회 방송 플랫폼
          </span>

          <h1 className="mt-6 text-4xl md:text-5xl font-extrabold text-gray-900 leading-tight tracking-tight">
            예배는 한 사람이 섬겨도,
            <br />
            <span className="bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-transparent">
              준비는 온 교회가 함께.
            </span>
          </h1>
          <p className="mt-6 text-base md:text-lg text-gray-600 max-w-2xl mx-auto leading-relaxed">
            주보 · 찬양콘티 · 설교 자료는 교인이 웹에서 함께 준비하고,
            <br className="hidden md:inline" />
            자막 · 녹화 · 라이브 송출은 <span className="font-semibold text-gray-800">UnoLive 데스크탑</span>이 책임지는
            <br className="hidden md:inline" />
            <span className="font-semibold text-gray-800">웹 + 데스크탑 하이브리드</span> 교회 방송 플랫폼입니다.
          </p>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <a
              href="#download"
              className="px-6 h-12 flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white text-sm font-semibold shadow-lg shadow-violet-500/20 hover:shadow-xl hover:scale-[1.02] transition-all"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              UnoLive 데스크탑 다운로드
            </a>
            <a
              href="/media/pricing"
              className="px-6 h-12 flex items-center rounded-xl bg-white border border-gray-300 text-gray-800 text-sm font-semibold hover:border-violet-400 hover:text-violet-700 transition-colors"
            >
              요금제 보기
            </a>
          </div>

          <p className="mt-4 text-[11px] text-gray-500">
            macOS 12+ · Windows 10+ · 30–300명 규모 소형 교회 대상
          </p>
        </div>
      </section>

      {/* 3컬럼 가치제안 */}
      <section className="max-w-[1200px] mx-auto px-6 py-16">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <ValuePillar
            color="from-violet-500 to-purple-600"
            title="교인 입력 포털"
            body="주보 · 찬양콘티 · 설교 자료를 담당자가 웹에서 직접 업로드. 방송실은 이미 준비된 데이터만 받습니다."
            bullets={['찬양콘티 위저드', '악보 자동 변조', '설교 원고 공유']}
          />
          <ValuePillar
            color="from-indigo-500 to-blue-600"
            title="원맨 방송 엔진"
            body="단 한 사람이 자막, 영상, 오디오, 송출까지 제어. ATEM Mini 연동부터 웹 오디오 콘솔까지."
            bullets={['자막 오퍼레이터', '녹화 · 유튜브 라이브', '오디오 콘솔 (Phase 2)']}
          />
          <ValuePillar
            color="from-emerald-500 to-teal-600"
            title="자막협조 지휘체계"
            body="자막 요청, 공지, 실시간 팀 채팅으로 흩어진 봉사자들을 한 자리로 모읍니다."
            bullets={['부서 트리 + 역할', '실시간 협업 채팅', '예배별 진행 현황']}
          />
        </div>
      </section>

      {/* 웹 vs 데스크탑 역할 분담 */}
      <section className="bg-gradient-to-b from-white to-gray-50 border-y border-gray-200">
        <div className="max-w-[1200px] mx-auto px-6 py-16">
          <div className="text-center mb-10">
            <p className="text-[11px] font-semibold tracking-widest text-violet-600 uppercase">
              두 개의 얼굴, 하나의 플랫폼
            </p>
            <h2 className="mt-2 text-3xl font-bold text-gray-900">
              웹은 함께 준비하고, 데스크탑은 혼자 송출합니다.
            </h2>
            <p className="mt-3 text-sm text-gray-600 max-w-2xl mx-auto">
              실시간 자막 송출은 단 1프레임의 지연도 허용하지 않기 때문에,
              UnoLive 본체는 브라우저가 아닌 <span className="font-semibold">데스크탑 앱(Electron)</span>으로만 제공합니다.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* 웹 */}
            <div className="rounded-2xl border border-violet-200 bg-white p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                    <line x1="8" y1="21" x2="16" y2="21" />
                    <line x1="12" y1="17" x2="12" y2="21" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">UnoMedia 웹</h3>
                  <p className="text-[11px] text-gray-500">어디서나 브라우저 접속</p>
                </div>
              </div>
              <p className="text-sm text-gray-600 leading-relaxed mb-4">
                찬양콘티, 주보, 설교 자료를 여럿이 함께 준비하고 모니터링합니다.
                방송실 밖에서 벌어지는 일은 전부 웹이 책임집니다.
              </p>
              <ul className="space-y-2 text-[12px] text-gray-700">
                {[
                  '자막협조 · 공지 · 팀 채팅',
                  '주보 · 찬양콘티 · 설교 원고 입력',
                  '캔버스 에디터 (멀티유저 협업)',
                  '녹화/라이브 모니터링 대시보드',
                  '멤버 · 교회 · 권한 관리',
                ].map((i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="w-1 h-1 rounded-full bg-violet-500 mt-2 shrink-0" />
                    {i}
                  </li>
                ))}
              </ul>
            </div>

            {/* 데스크탑 */}
            <div className="rounded-2xl border-2 border-gray-900 bg-gray-900 text-white p-6 relative overflow-hidden">
              <div
                aria-hidden
                className="absolute -top-16 -right-16 w-40 h-40 rounded-full bg-violet-500/20 blur-3xl pointer-events-none"
              />
              <div className="flex items-center gap-3 mb-4 relative">
                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-rose-500 to-red-600 flex items-center justify-center text-white">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                    <line x1="2" y1="20" x2="22" y2="20" />
                    <circle cx="12" cy="10" r="2" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-bold">UnoLive 데스크탑</h3>
                  <p className="text-[11px] text-gray-400">Electron · macOS · Windows</p>
                </div>
              </div>
              <p className="text-sm text-gray-300 leading-relaxed mb-4 relative">
                자막, 영상, 오디오를 1프레임 단위로 제어하고 방송실 프로젝터 ·
                YouTube 라이브로 송출합니다. 웹에서 준비한 데이터를 그대로 받아 씁니다.
              </p>
              <ul className="space-y-2 text-[12px] text-gray-300 relative">
                {[
                  '자막 오퍼레이터 (실시간 섹션 전환)',
                  '녹화 엔진 (1080p60 / 720p60)',
                  'YouTube 라이브 · Custom RTMP',
                  'NDI · HDMI 출력',
                  '카메라 · 오디오 인터페이스 제어',
                  '오프라인 상태에서도 송출 가능',
                ].map((i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="w-1 h-1 rounded-full bg-rose-400 mt-2 shrink-0" />
                    {i}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* 다운로드 섹션 */}
      <section id="download" className="bg-white scroll-mt-16">
        <div className="max-w-[1200px] mx-auto px-6 py-16 text-center">
          <p className="text-[11px] font-semibold tracking-widest text-violet-600 uppercase">
            UnoLive Desktop
          </p>
          <h2 className="mt-2 text-3xl font-bold text-gray-900">
            방송실 컴퓨터에 UnoLive 를 설치하세요.
          </h2>
          <p className="mt-3 text-sm text-gray-600 max-w-xl mx-auto">
            설치 후 교회 계정으로 로그인하면 웹에서 준비한 모든 자료가 자동으로 연결됩니다.
          </p>

          <div className="mt-10 grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-3xl mx-auto">
            <DownloadButton
              os="macOS"
              subtitle="Apple Silicon · Intel"
              icon={
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
                </svg>
              }
            />
            <DownloadButton
              os="Windows"
              subtitle="Windows 10 · 11"
              icon={
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M3 5.5L10 4.5v7H3v-6zM11 4.35L21 3v8.5H11v-7.15zM3 12.5h7v7L3 18.5v-6zM11 12.5h10V21l-10-1.35V12.5z" />
                </svg>
              }
            />
            <DownloadButton
              os="Linux"
              subtitle=".AppImage · .deb"
              icon={
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2c1.1 0 2 .9 2 2 0 .7-.4 1.3-1 1.7.8.5 1.5 1.4 1.8 2.4.4 1.3 1.4 2.3 2.6 2.8.7.3 1.2 1 1.3 1.8.3 2.4.2 4.9-.5 7.3-.3 1.1-1.3 1.8-2.4 1.8H8.2c-1.1 0-2.1-.7-2.4-1.8-.7-2.4-.8-4.9-.5-7.3.1-.8.6-1.5 1.3-1.8 1.2-.5 2.2-1.5 2.6-2.8.3-1 1-1.9 1.8-2.4-.6-.4-1-1-1-1.7 0-1.1.9-2 2-2z" />
                </svg>
              }
              disabled
            />
          </div>

          <p className="mt-6 text-[11px] text-gray-500">
            라이선스 키는 요금제 가입 후 이메일로 발송됩니다 ·
            <a href="/media/pricing" className="ml-1 text-violet-600 hover:text-violet-700 font-semibold">
              요금제 보기
            </a>
          </p>
        </div>
      </section>

      {/* 번들 제안 */}
      <section className="bg-gray-900 text-white">
        <div className="max-w-[1200px] mx-auto px-6 py-16 grid grid-cols-1 md:grid-cols-2 gap-10 items-center">
          <div>
            <p className="text-[11px] font-semibold tracking-widest text-violet-400 uppercase">
              UnoMedia Bundle
            </p>
            <h2 className="mt-2 text-3xl font-bold">
              소프트웨어부터 하드웨어까지,
              <br />
              <span className="text-violet-300">한 번의 설치로 완료.</span>
            </h2>
            <p className="mt-4 text-sm text-gray-300 leading-relaxed">
              Mac mini · 스위처 · 카메라 · 음향장비 · UnoLive 라이선스를
              교회 규모에 맞춰 번들로 구성해 드립니다. 설치와 리허설까지
              방문 지원.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              {['Mac mini', 'ATEM Mini Pro', 'Sony ZV-E10', 'Scarlett 2i2', 'SM58'].map(
                (tag) => (
                  <span
                    key={tag}
                    className="px-3 py-1 rounded-full bg-white/10 border border-white/20 text-[11px] font-medium"
                  >
                    {tag}
                  </span>
                )
              )}
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
            <p className="text-[11px] font-semibold tracking-widest text-violet-300 uppercase">
              견적 예시
            </p>
            <ul className="mt-4 space-y-3 text-sm">
              <BundleRow label="Starter (30명 규모)" price="~280만원" />
              <BundleRow label="Standard (100명 규모)" price="~520만원" />
              <BundleRow label="Pro (300명 규모)" price="~980만원" />
            </ul>
            <button className="mt-6 w-full h-11 rounded-lg bg-violet-500 hover:bg-violet-400 text-white text-sm font-semibold transition-colors">
              상담 문의하기
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}

function ValuePillar({
  color,
  title,
  body,
  bullets,
}: {
  color: string;
  title: string;
  body: string;
  bullets: string[];
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 hover:shadow-lg hover:-translate-y-0.5 transition-all">
      <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${color} shadow-sm mb-4`} />
      <h3 className="text-lg font-bold text-gray-900">{title}</h3>
      <p className="mt-2 text-sm text-gray-600 leading-relaxed">{body}</p>
      <ul className="mt-4 space-y-1.5">
        {bullets.map((b) => (
          <li key={b} className="flex items-center gap-2 text-[12px] text-gray-600">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="text-violet-500">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            {b}
          </li>
        ))}
      </ul>
    </div>
  );
}

function BundleRow({ label, price }: { label: string; price: string }) {
  return (
    <li className="flex items-center justify-between pb-3 border-b border-white/10 last:border-0">
      <span className="text-gray-300">{label}</span>
      <span className="font-bold text-white">{price}</span>
    </li>
  );
}

function DownloadButton({
  os,
  subtitle,
  icon,
  disabled,
}: {
  os: string;
  subtitle: string;
  icon: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      disabled={disabled}
      className={`group relative rounded-2xl border p-6 transition-all ${
        disabled
          ? 'border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed'
          : 'border-gray-300 bg-white hover:border-violet-400 hover:shadow-lg hover:-translate-y-0.5 text-gray-900'
      }`}
    >
      <div className={`mx-auto mb-3 w-12 h-12 flex items-center justify-center rounded-xl ${
        disabled
          ? 'bg-gray-200 text-gray-400'
          : 'bg-gradient-to-br from-gray-800 to-gray-900 text-white group-hover:scale-110 transition-transform'
      }`}>
        {icon}
      </div>
      <p className="text-sm font-bold">{os}</p>
      <p className="mt-0.5 text-[10px] text-gray-500">{subtitle}</p>
      <p className={`mt-3 text-[11px] font-semibold ${disabled ? 'text-gray-400' : 'text-violet-600'}`}>
        {disabled ? '준비 중' : '다운로드 →'}
      </p>
    </button>
  );
}
