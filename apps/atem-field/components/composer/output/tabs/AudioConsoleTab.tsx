'use client';

/**
 * AudioConsoleTab — 웹 오디오 콘솔 (Phase 2 플레이스홀더)
 *
 * 원맨 방송실용 최소 오디오 믹싱 인터페이스.
 * 현재는 UI 자리만 마련해두고, UnoLive 본체 디자인 완료 후 실제 엔진 구현 예정.
 *
 * 향후 구현 영역:
 *  - Web Audio API 기반 채널 스트립 (Mic / System / BGM / Line In)
 *  - 실시간 VU 미터 (AnalyserNode + Canvas)
 *  - 3밴드 EQ (BiquadFilterNode) + 컴프레서 (DynamicsCompressorNode)
 *  - 마스터 버스 + 리미터
 *  - 시닉 스냅샷 (찬양/설교/기도 프리셋 자동 전환)
 *
 * 하드웨어 전제: USB 오디오 인터페이스 (Focusrite Scarlett 2i2 권장) + XLR 마이크
 */

export default function AudioConsoleTab() {
  return (
    <div className="flex flex-col h-full bg-[#0d0d0d] overflow-hidden">
      {/* 헤더 */}
      <div className="flex-shrink-0 px-4 py-3 border-b border-[#222222]">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-200">오디오 콘솔</h3>
            <p className="text-[10px] text-gray-500 mt-0.5">
              원맨 방송실용 웹 오디오 믹서
            </p>
          </div>
          <span className="px-2 py-0.5 rounded-full bg-yellow-900/30 border border-yellow-900/50 text-[9px] font-medium text-yellow-400">
            PHASE 2
          </span>
        </div>
      </div>

      {/* 콘텐츠: 준비 중 안내 */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-8 overflow-y-auto">
        {/* 아이콘 */}
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500/20 to-purple-600/20 border border-blue-500/20 flex items-center justify-center mb-4">
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className="text-blue-400"
          >
            <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
            <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
          </svg>
        </div>

        {/* 타이틀 */}
        <h4 className="text-[13px] font-semibold text-gray-200 mb-2 text-center">
          오디오 콘솔 준비 중
        </h4>
        <p className="text-[11px] text-gray-500 text-center max-w-[240px] leading-relaxed mb-5">
          UnoLive 본체 디자인 완료 후 Web Audio API 기반 웹 콘솔이
          이곳에 탑재됩니다.
        </p>

        {/* 예정 기능 목록 */}
        <div className="w-full max-w-[260px] rounded-lg border border-[#222222] bg-[#0a0a0a] overflow-hidden">
          <div className="px-3 py-2 border-b border-[#1a1a1a] bg-[#0c0c0c]">
            <span className="text-[10px] font-semibold text-gray-400">
              예정 기능
            </span>
          </div>
          <ul className="divide-y divide-[#1a1a1a]">
            <FeatureItem label="채널 스트립 (Mic / System / BGM)" />
            <FeatureItem label="실시간 VU 미터" />
            <FeatureItem label="3밴드 EQ + 컴프레서" />
            <FeatureItem label="마스터 버스 + 리미터" />
            <FeatureItem label="시닉 스냅샷 (예배 단계별 프리셋)" />
          </ul>
        </div>

        {/* 하드웨어 가이드 */}
        <div className="mt-5 w-full max-w-[260px] rounded-lg border border-blue-900/30 bg-blue-900/10 px-3 py-2.5">
          <div className="flex items-start gap-2">
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="flex-shrink-0 mt-0.5 text-blue-400"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
            <p className="text-[10px] text-blue-200/80 leading-relaxed">
              권장 하드웨어: Focusrite Scarlett 2i2 (또는 동급 USB 인터페이스) +
              Shure SM58. 기존 교회 믹서가 있다면 라인 아웃 경유만으로 충분합니다.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function FeatureItem({ label }: { label: string }) {
  return (
    <li className="flex items-center gap-2 px-3 py-2 text-[10px] text-gray-400">
      <svg
        width="10"
        height="10"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-gray-600"
      >
        <polyline points="9 11 12 14 22 4" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </svg>
      <span>{label}</span>
    </li>
  );
}
