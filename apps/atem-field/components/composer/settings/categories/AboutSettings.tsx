'use client';

/**
 * AboutSettings — 정보 (버전, 빌드, 라이선스)
 */

export default function AboutSettings() {
  return (
    <div className="space-y-5">
      {/* 로고/타이틀 */}
      <div className="flex items-center gap-3 pb-4 border-b border-[#1a1a1a]">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-lg shadow-lg">
          U
        </div>
        <div>
          <div className="text-sm font-semibold text-gray-100">UnoLive</div>
          <div className="text-[10px] text-gray-500">
            원맨 방송 교회용 송출 컴포저
          </div>
        </div>
      </div>

      {/* 버전 정보 */}
      <div className="space-y-2 text-[11px]">
        <InfoRow label="버전" value="0.1.0 (Phase 1)" />
        <InfoRow label="빌드" value="dev" />
        <InfoRow label="런타임" value="Next.js 16 · React 19" />
        <InfoRow label="배포" value="Electron (현재) / Web (향후)" />
      </div>

      {/* 링크 */}
      <div className="pt-4 border-t border-[#1a1a1a] space-y-2">
        <div className="text-[11px] font-semibold text-gray-300 mb-2">링크</div>
        <LinkRow label="공식 홈페이지" href="#" />
        <LinkRow label="사용자 가이드" href="#" />
        <LinkRow label="오픈소스 라이선스" href="#" />
      </div>

      {/* 카피라이트 */}
      <div className="pt-4 border-t border-[#1a1a1a] text-[10px] text-gray-600 leading-relaxed">
        © 2025 UnoLive. 교회 방송 지원을 위해 개발되었습니다.
        <br />
        본 소프트웨어는 내부 개발용이며, 외부 의존성(ffmpeg 등)은 번들되어
        제공됩니다.
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-gray-500">{label}</span>
      <span className="text-gray-300 font-mono">{value}</span>
    </div>
  );
}

function LinkRow({ label, href }: { label: string; href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center justify-between text-[11px] text-blue-400 hover:text-blue-300 transition-colors"
    >
      <span>{label}</span>
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
        <polyline points="15 3 21 3 21 9" />
        <line x1="10" y1="14" x2="21" y2="3" />
      </svg>
    </a>
  );
}
