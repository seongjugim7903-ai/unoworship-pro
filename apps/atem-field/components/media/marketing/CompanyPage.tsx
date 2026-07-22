'use client';

/**
 * CompanyPage — /media/company
 *
 * 회사 소개 · 미션 · 타겟 · 연락처.
 * Phase 2A 셸 — 텍스트 위주.
 */

export default function CompanyPage() {
  return (
    <main className="flex-1">
      <section className="max-w-[960px] mx-auto px-6 py-20">
        <p className="text-[11px] font-semibold tracking-widest text-violet-600 uppercase">
          Our Mission
        </p>
        <h1 className="mt-2 text-4xl md:text-5xl font-extrabold text-gray-900 leading-tight">
          작은 교회일수록
          <br />
          좋은 방송이 필요합니다.
        </h1>
        <p className="mt-6 text-lg text-gray-600 leading-relaxed">
          UnoMedia는 30~300명 규모의 소형 교회가 외부 방송 업체 없이도
          전문가 수준의 예배 송출을 해낼 수 있도록, 하드웨어와 소프트웨어,
          그리고 협업 공간까지 한 번에 제공하는 올인원 플랫폼입니다.
        </p>

        <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-6">
          <Pillar
            title="원맨 운영의 친구"
            body="방송 담당자 한 명이 설교부터 찬양, 자막, 송출까지 감당할 수 있도록 UI의 모든 결정을 '최소 클릭, 최대 안전'에 맞춥니다."
          />
          <Pillar
            title="입력은 전 교회가"
            body="주보, 찬양콘티, 설교 원고를 각 담당자가 웹에서 직접 올립니다. 방송실은 이미 준비된 콘텐츠만 받아 송출합니다."
          />
          <Pillar
            title="세계로 확장"
            body="한국어를 시작으로 다국어 자막 · 글로벌 예배 송출 · 해외 선교지를 위한 오프라인 폴백까지. UnoLive는 세계 지역 교회의 표준을 목표합니다."
          />
        </div>

        <div className="mt-20 rounded-2xl border border-gray-200 bg-white p-8">
          <h3 className="text-lg font-bold text-gray-900">연락처</h3>
          <dl className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-600">
            <div>
              <dt className="text-[10px] font-semibold tracking-wide text-gray-400 uppercase">
                이메일
              </dt>
              <dd className="mt-1 font-medium text-gray-900">hello@unomedia.kr</dd>
            </div>
            <div>
              <dt className="text-[10px] font-semibold tracking-wide text-gray-400 uppercase">
                전화
              </dt>
              <dd className="mt-1 font-medium text-gray-900">1833-0000</dd>
            </div>
            <div>
              <dt className="text-[10px] font-semibold tracking-wide text-gray-400 uppercase">
                주소
              </dt>
              <dd className="mt-1">대한민국 서울 (상세 주소 예정)</dd>
            </div>
            <div>
              <dt className="text-[10px] font-semibold tracking-wide text-gray-400 uppercase">
                사업자
              </dt>
              <dd className="mt-1">UnoStack · 사업자 번호 예정</dd>
            </div>
          </dl>
        </div>
      </section>
    </main>
  );
}

function Pillar({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <h3 className="text-base font-bold text-gray-900">{title}</h3>
      <p className="mt-2 text-[13px] text-gray-600 leading-relaxed">{body}</p>
    </div>
  );
}
