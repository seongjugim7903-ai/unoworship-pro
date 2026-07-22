import Link from 'next/link';
import {
  ArrowRight,
  BookOpenText,
  Building2,
  CheckCircle2,
  Download,
  ExternalLink,
  MonitorPlay,
  Radio,
} from 'lucide-react';
import { MarketingAuthNav } from './MarketingAuthNav';

const publicNav = [
  { label: '회사', href: '/' },
  { label: '제품', href: '/product' },
  { label: '프라이싱', href: '/pricing' },
  { label: '리소스', href: '/resources' },
];

export function UnoWorshipMarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#f7f8fb] text-slate-950" style={{ colorScheme: 'light' }}>
      <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-5 px-5">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-slate-950 text-[13px] font-black text-white">
              UW
            </span>
            <span className="flex flex-col leading-tight">
              <span className="text-[15px] font-black text-slate-950">UnoWorship</span>
              <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-teal-700">
                Church media OS
              </span>
            </span>
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            {publicNav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-md px-3 py-2 text-[13px] font-bold text-slate-600 hover:bg-slate-100 hover:text-slate-950"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="flex-1" />

          <MarketingAuthNav />
          <Link
            href="/product#download"
            className="inline-flex h-10 items-center gap-2 rounded-md bg-slate-950 px-4 text-[13px] font-black text-white hover:bg-slate-800"
          >
            <Download size={15} />
            다운로드
          </Link>
        </div>
      </header>
      {children}
      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto grid max-w-7xl gap-8 px-5 py-10 md:grid-cols-[1.3fr_0.7fr_0.7fr_0.7fr]">
          <div>
            <div className="flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-md bg-slate-950 text-[12px] font-black text-white">
                UW
              </span>
              <span className="text-sm font-black">UnoWorship</span>
            </div>
            <p className="mt-3 max-w-sm text-[13px] leading-6 text-slate-600">
              교회 방송실을 위한 자막, 송출, 녹화, 예배 자료 운영 시스템입니다.
            </p>
          </div>
          <FooterGroup title="제품" items={['Composer', 'Dashboard', 'Canvas', 'Download']} />
          <FooterGroup title="운영" items={['도입 상담', '요금제', '보안', '장비 가이드']} />
          <FooterGroup title="회사" items={['UnoMedia', '파트너', '문의', '문서']} />
        </div>
      </footer>
    </div>
  );
}

export function UnoWorshipHomePage() {
  return (
    <UnoWorshipMarketingLayout>
      <main>
        <section className="border-b border-slate-200 bg-white">
          <div className="mx-auto grid max-w-7xl items-center gap-10 px-5 py-14 md:grid-cols-[0.92fr_1.08fr] md:py-20">
            <div>
              <h1 className="text-4xl font-black leading-[1.05] tracking-normal text-slate-950 md:text-6xl">
                UnoWorship
              </h1>
              <p className="mt-5 max-w-xl text-lg font-semibold leading-8 text-slate-700 md:text-xl">
                중소형 교회 방송실을 위한 쉬운 자막 제어, 다중 모니터 송출, 라이브와 녹화 운영 도구입니다.
              </p>
              <p className="mt-4 max-w-xl text-[15px] leading-7 text-slate-600">
                고가 스위처 없이도 확장 모니터 기반으로 예배 자막을 안정적으로 운영하고, 향후 ATEM/SDI 환경의 Pro·Premium으로 확장할 수 있게 제품군을 나눕니다.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href="/product"
                  className="inline-flex h-11 items-center gap-2 rounded-md bg-slate-950 px-5 text-sm font-black text-white hover:bg-slate-800"
                >
                  제품 보기
                  <ArrowRight size={16} />
                </Link>
                <Link
                  href="/pricing"
                  className="inline-flex h-11 items-center rounded-md border border-slate-300 bg-white px-5 text-sm font-black text-slate-800 hover:border-slate-500"
                >
                  프라이싱 확인
                </Link>
              </div>
            </div>
            <ProductStageMockup />
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-5 py-12">
          <div className="grid gap-4 md:grid-cols-3">
            <ValueCard
              icon={<MonitorPlay size={21} />}
              title="자막 제어 송출"
              body="강대상 화면과 프롬프트 화면을 분리해 운영하고, 예배 중 전환 지연을 낮춘 캔버스 송출 구조를 유지합니다."
            />
            <ValueCard
              icon={<Radio size={21} />}
              title="라이브·녹화"
              body="브로드캐스트 대시보드에서 PGM 미러, 녹화 파일, 클립 마커, 운영 로그를 한 곳에서 확인합니다."
            />
            <ValueCard
              icon={<Building2 size={21} />}
              title="교회별 워크스페이스"
              body="가입과 결제 후 교회별 운영 공간을 만들고, 구독 상태를 확인해 앱 권한을 제어하는 방향으로 확장합니다."
            />
          </div>
        </section>

        <section className="border-y border-slate-200 bg-white">
          <div className="mx-auto grid max-w-7xl gap-10 px-5 py-14 md:grid-cols-[0.9fr_1.1fr]">
            <div>
              <h2 className="text-3xl font-black tracking-normal text-slate-950">
                운영 구조는 단순하게, 제품 확장은 분명하게
              </h2>
              <p className="mt-4 text-[15px] leading-7 text-slate-600">
                현재 Plus는 저예산 방송실과 확장 모니터 환경에 집중합니다. Pro와 Premium은 ATEM 스위처 SDK, SDI, 멀티 출력, 고급 레이어 제어까지 옮겨갈 수 있도록 모듈화된 기능을 쌓아갑니다.
              </p>
            </div>
            <div className="grid gap-3">
              {[
                ['Plus', '확장 모니터 기반 자막·프롬프트·브로드캐스트 운영'],
                ['Pro', 'ATEM 8입력/4출력급 스위처 연동과 통합 제어'],
                ['Premium', 'SDI/NDI/다중 출력, 고급 레이어, 기관·대형 행사 대응'],
              ].map(([name, body]) => (
                <div key={name} className="rounded-lg border border-slate-200 bg-[#f7f8fb] p-4">
                  <div className="text-sm font-black text-slate-950">{name}</div>
                  <div className="mt-1 text-[13px] leading-6 text-slate-600">{body}</div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
    </UnoWorshipMarketingLayout>
  );
}

export function UnoWorshipProductPage() {
  return (
    <UnoWorshipMarketingLayout>
      <main>
        <PageHero
          title="제품"
          body="UnoWorship는 다운로드가 필요한 자막 제어 송출 앱과 웹 기반 운영 도구를 분리해 안정성과 접근성을 함께 잡습니다."
        />
        <section className="mx-auto grid max-w-7xl gap-4 px-5 pb-14 md:grid-cols-3">
          <ProductCard
            title="Composer"
            label="필수 다운로드"
            body="자막 제어, 섹션 송출, 아웃풋/프롬프트 분리, PGM 확인까지 담당하는 운영자용 핵심 앱입니다."
            items={['실시간 자막 편집', '강대상·프롬프트 송출', '레이어/마스크/PMT 옵션']}
          />
          <ProductCard
            title="Dashboard"
            label="웹/데스크탑"
            body="라이브와 녹화, PGM 상태, 운영 로그, 클립 마커를 확인하는 브로드캐스트 관제 화면입니다."
            items={['PGM 미러', '녹화 파일 관리', '운영 로그/메모']}
          />
          <ProductCard
            title="Canvas"
            label="웹 중심"
            body="예배 자막 디자인, 섹션 디자인, 고정 레이어와 향후 템플릿 자산을 관리하는 디자인 도구입니다."
            items={['교회별 디자인 등록', '섹션/레이어 편집', '프리미엄 기능 이전 가능']}
          />
        </section>
        <section id="download" className="border-t border-slate-200 bg-white">
          <div className="mx-auto max-w-7xl px-5 py-14">
            <div className="grid gap-8 md:grid-cols-[0.8fr_1.2fr]">
              <div>
                <h2 className="text-3xl font-black text-slate-950">다운로드</h2>
                <p className="mt-3 text-[15px] leading-7 text-slate-600">
                  Composer는 방송실 PC에 설치해야 합니다. Dashboard와 Canvas는 웹에서 처리하는 방향을 기본으로 두되, 현장 안정성이 필요한 경우 데스크탑 번들에도 포함합니다.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <DownloadTile os="macOS" detail="Mac mini / Apple Silicon 우선" />
                <DownloadTile os="Windows" detail="Windows 10 이상 송출 노트북 지원" />
              </div>
            </div>
          </div>
        </section>
      </main>
    </UnoWorshipMarketingLayout>
  );
}

export function UnoWorshipPricingPage() {
  const tiers = [
    {
      name: 'Plus',
      plan: 'plus',
      price: '도입형',
      body: '중소형 교회, 확장 모니터 기반 송출, 저예산 방송실에 맞춘 핵심 버전',
      items: ['Composer 필수 다운로드', '자막/프롬프트/녹화', '교회별 워크스페이스'],
    },
    {
      name: 'Pro',
      plan: 'pro',
      price: '상담형',
      body: 'ATEM 스위처 SDK와 카메라/자막 통합 제어가 필요한 교회용 버전',
      items: ['ATEM 연동 예정', '입출력 통합 제어', '운영 자동화'],
    },
    {
      name: 'Premium',
      plan: 'premium',
      price: '프로젝트형',
      body: '기업, 기관, 대학교, 대형 아카데미와 대형 행사에 맞춘 고급 버전',
      items: ['SDI/NDI 고급 출력', '멀티 레이어', '전용 UX/브랜딩'],
    },
  ];

  return (
    <UnoWorshipMarketingLayout>
      <main>
        <PageHero
          title="프라이싱"
          body="구독 결제 후 app.unoworship.kr 워크스페이스 권한을 확인하는 구조로 정리합니다. 초기 가격은 도입 교회 테스트 이후 확정합니다."
        />
        <section className="mx-auto grid max-w-7xl gap-4 px-5 pb-16 md:grid-cols-3">
          {tiers.map((tier) => (
            <div key={tier.name} className="rounded-lg border border-slate-200 bg-white p-5">
              <h2 className="text-xl font-black text-slate-950">{tier.name}</h2>
              <div className="mt-3 text-2xl font-black text-teal-700">{tier.price}</div>
              <p className="mt-3 min-h-20 text-[14px] leading-7 text-slate-600">{tier.body}</p>
              <ul className="mt-5 space-y-2">
                {tier.items.map((item) => (
                  <li key={item} className="flex gap-2 text-[13px] font-semibold text-slate-700">
                    <CheckCircle2 className="mt-0.5 text-teal-700" size={15} />
                    {item}
                  </li>
                ))}
              </ul>
              <Link
                href={`/signup?redirectTo=${encodeURIComponent(`/signup/church?plan=${tier.plan}`)}`}
                className="mt-6 inline-flex h-10 w-full items-center justify-center rounded-md bg-slate-950 px-4 text-sm font-black text-white hover:bg-slate-800"
              >
                교회 가입 신청
              </Link>
            </div>
          ))}
        </section>
      </main>
    </UnoWorshipMarketingLayout>
  );
}

export function UnoWorshipResourcesPage() {
  const resources = [
    ['현장 체크리스트', '해상도, 확장 모니터, SDI 라인, 네트워크 권한을 시연 전에 점검합니다.'],
    ['LAN 접속 가이드', '교회 공유기 환경에서 HOST, 방화벽, 소켓 인증 문제를 빠르게 분리합니다.'],
    ['방송실 운영 가이드', '자막 담당자가 실제 예배 중 확인해야 할 로그, 메모, 녹화 흐름을 정리합니다.'],
    ['제품 로드맵', 'Plus, Pro, Premium으로 이동 가능한 기능과 모듈화 기준을 계속 문서화합니다.'],
  ];

  return (
    <UnoWorshipMarketingLayout>
      <main>
        <PageHero
          title="리소스"
          body="도입 교회가 직접 따라 할 수 있는 장비 준비, 네트워크 진단, 방송실 운영 문서를 공개 자료로 정리합니다."
        />
        <section className="mx-auto grid max-w-7xl gap-4 px-5 pb-16 md:grid-cols-2">
          {resources.map(([title, body]) => (
            <article key={title} className="rounded-lg border border-slate-200 bg-white p-5">
              <BookOpenText className="text-teal-700" size={22} />
              <h2 className="mt-4 text-lg font-black text-slate-950">{title}</h2>
              <p className="mt-2 text-[14px] leading-7 text-slate-600">{body}</p>
              <button className="mt-5 inline-flex items-center gap-2 text-[13px] font-black text-slate-950">
                준비 중
                <ExternalLink size={14} />
              </button>
            </article>
          ))}
        </section>
      </main>
    </UnoWorshipMarketingLayout>
  );
}

function PageHero({ title, body }: { title: string; body: string }) {
  return (
    <section className="mx-auto max-w-7xl px-5 py-14">
      <h1 className="text-4xl font-black tracking-normal text-slate-950 md:text-5xl">{title}</h1>
      <p className="mt-4 max-w-2xl text-[16px] leading-8 text-slate-600">{body}</p>
    </section>
  );
}

function ProductStageMockup() {
  return (
    <div className="rounded-lg border border-slate-300 bg-slate-950 p-3 shadow-2xl shadow-slate-300/70">
      <div className="flex items-center justify-between border-b border-white/10 px-2 pb-3">
        <div className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
        </div>
        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/50">
          Live control surface
        </span>
      </div>
      <div className="grid gap-3 pt-3 lg:grid-cols-[0.58fr_1fr_0.72fr]">
        <div className="space-y-2">
          {['주일낮예배', '찬양', '기도', '설교'].map((item, index) => (
            <div
              key={item}
              className={`rounded-md border p-3 text-[12px] font-black ${
                index === 1
                  ? 'border-teal-400 bg-teal-400/15 text-teal-100'
                  : 'border-white/10 bg-white/5 text-white/65'
              }`}
            >
              {item}
            </div>
          ))}
        </div>
        <div className="min-h-64 rounded-md border border-white/10 bg-[#111827] p-4">
          <div className="h-full rounded-md bg-[linear-gradient(135deg,#0f172a,#173b46_48%,#111827)] p-4">
            <div className="flex h-full flex-col justify-end">
              <div className="rounded-md bg-black/72 p-4">
                <div className="text-2xl font-black leading-tight text-white">주의 은혜라</div>
                <div className="mt-2 text-[13px] font-semibold text-white/70">다음 가사와 프롬프트를 함께 확인</div>
              </div>
            </div>
          </div>
        </div>
        <div className="space-y-3">
          <div className="rounded-md border border-white/10 bg-white/5 p-3">
            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-white/45">PGM</div>
            <div className="mt-2 aspect-video rounded bg-teal-300/80" />
          </div>
          <div className="rounded-md border border-white/10 bg-white/5 p-3">
            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-white/45">Recording</div>
            <div className="mt-2 h-2 rounded bg-white/10">
              <div className="h-2 w-2/3 rounded bg-red-400" />
            </div>
            <div className="mt-2 text-[12px] font-black text-white">1080p60</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ValueCard({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-5">
      <div className="grid h-10 w-10 place-items-center rounded-md bg-teal-50 text-teal-800">{icon}</div>
      <h2 className="mt-4 text-lg font-black text-slate-950">{title}</h2>
      <p className="mt-2 text-[14px] leading-7 text-slate-600">{body}</p>
    </article>
  );
}

function ProductCard({
  title,
  label,
  body,
  items,
}: {
  title: string;
  label: string;
  body: string;
  items: string[];
}) {
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-5">
      <span className="text-[11px] font-black uppercase tracking-[0.18em] text-teal-700">{label}</span>
      <h2 className="mt-3 text-2xl font-black text-slate-950">{title}</h2>
      <p className="mt-3 text-[14px] leading-7 text-slate-600">{body}</p>
      <ul className="mt-5 space-y-2">
        {items.map((item) => (
          <li key={item} className="flex gap-2 text-[13px] font-semibold text-slate-700">
            <CheckCircle2 className="mt-0.5 text-teal-700" size={15} />
            {item}
          </li>
        ))}
      </ul>
    </article>
  );
}

function DownloadTile({ os, detail }: { os: string; detail: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-[#f7f8fb] p-5">
      <Download className="text-teal-700" size={22} />
      <div className="mt-4 text-xl font-black text-slate-950">{os}</div>
      <p className="mt-1 text-[13px] text-slate-600">{detail}</p>
      <button className="mt-5 inline-flex h-10 items-center rounded-md bg-slate-950 px-4 text-[13px] font-black text-white">
        준비 중
      </button>
    </div>
  );
}

function FooterGroup({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h3 className="text-[12px] font-black uppercase tracking-[0.18em] text-slate-500">{title}</h3>
      <ul className="mt-3 space-y-2">
        {items.map((item) => (
          <li key={item} className="text-[13px] font-semibold text-slate-600">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
