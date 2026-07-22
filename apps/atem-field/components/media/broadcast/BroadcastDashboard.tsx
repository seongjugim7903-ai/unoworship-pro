'use client';

/**
 * BroadcastDashboard — /media/broadcast
 *
 * "OBS 대체 · 웹 방송 관제" 공간.
 * 웹 대시보드는 YouTube/RTMP 라이브 송출과 로컬 녹화를 별도로 시작/종료합니다.
 * 예배순서 마킹은 녹화 여부와 분리해 운영하며,
 * 자막·카메라·오디오 믹싱은 UnoLive 데스크탑이 담당합니다.
 *
 * ── 레이아웃 (데스크탑, lg 이상) ────────────────────────
 *   ┌─────────────────────────────────────────────────────┐
 *   │                   인트로 배너 (dismiss)             │
 *   ├──────────┬──────────────────────┬──────────────────┤
 *   │          │  SessionHeader       │                  │
 *   │ Subtitle │  PreviewMonitor      │  Broadcast       │
 *   │ Sections │                      │  Controls        │
 *   │          │                      │                  │
 *   │ ClipMark │                      │  Recording       │
 *   │ erPanel  │                      │  Live            │
 *   │          │                      │  AudioLevels     │
 *   │ (3/12)   │        (5/12)        │  Roster (4/12)   │
 *   ├──────────┴──────────────────────┴──────────────────┤
 *   │                   Incident Log                      │
 *   └─────────────────────────────────────────────────────┘
 * ──────────────────────────────────────────────────────────
 *
 * 권한 모델:
 *   - 접근:          canAccessBroadcast()   (미디어팀 소속)
 *   - 방송 제어:     canControlBroadcast()  (operator/lead + Active Operator)
 *   - 권한 인계:     canLeadBroadcast()     (Lead 등급)
 *   - 수동 노트:     canAccessBroadcast()   (모두 기록 가능)
 */

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useMediaStore } from '@/lib/media/mediaStore';
import { useAuthContext } from '@/lib/auth/AuthProvider';
import SessionHeader from './SessionHeader';
import UserContextBadge from './UserContextBadge';
import PreviewMonitor from './PreviewMonitor';
import BroadcastControls from './BroadcastControls';
import ClipMarkerPanel from './ClipMarkerPanel';
import RecordingPanel from './RecordingPanel';
import LivePanel from './LivePanel';
import RuntimeMonitorTabs from './RuntimeMonitorTabs';
import IncidentLog from './IncidentLog';
import SubtitleStrip from './SubtitleStrip';
import SceneRack from './SceneRack';
import AccessGate from './AccessGate';
import { usePgmCompositorStream } from '@/hooks/broadcast/usePgmCompositorStream';
import { useOperationalEventLogger } from '@/hooks/broadcast/useOperationalEventLogger';

// 인트로 배너 dismiss 저장 키 (버전 suffix 를 두어 카피 변경 시 재노출)
const BANNER_DISMISS_KEY = 'unoMedia.broadcastIntroBanner.dismissed.v2';

export default function BroadcastDashboard() {
  const { hasAccess, isLoading: authLoading } = useAuthContext();
  const canAccess = hasAccess('admin'); // admin 이상만 대시보드 접근
  const syncStatus = useMediaStore((s) => s.session.syncStatus);
  const { stream: compositorStream } = usePgmCompositorStream();
  useOperationalEventLogger(!authLoading && canAccess);

  // ── 인트로 배너 dismiss 상태 ──
  // SSR 가드: 초기 상태는 false(숨김)로 두고, 마운트 후 localStorage 를 읽어
  // 결정합니다. 이렇게 해야 서버/클라이언트 HTML 이 어긋나지 않습니다.
  const [bannerVisible, setBannerVisible] = useState(false);

  useEffect(() => {
    let visible = true;
    try {
      const dismissed = window.localStorage.getItem(BANNER_DISMISS_KEY);
      visible = dismissed !== '1';
    } catch {
      visible = true;
    }
    const timer = setTimeout(() => setBannerVisible(visible), 0);
    return () => clearTimeout(timer);
  }, []);

  const dismissBanner = () => {
    setBannerVisible(false);
    try {
      window.localStorage.setItem(BANNER_DISMISS_KEY, '1');
    } catch {
      /* 개인 정보 보호 모드 등 저장 실패는 무시 */
    }
  };

  const showBannerAgain = () => {
    try {
      window.localStorage.removeItem(BANNER_DISMISS_KEY);
    } catch {
      /* noop */
    }
    setBannerVisible(true);
  };

  if (authLoading) {
    return (
      <main className="flex-1 flex items-center justify-center">
        <p className="text-sm text-gray-400">인증 확인 중...</p>
      </main>
    );
  }

  if (!canAccess) {
    return <AccessGate />;
  }

  return (
    <main className="w-full h-[calc(100vh-3.5rem)] flex flex-col px-6 py-4 overflow-hidden">
      {/* ── OBS-대체 관제 안내 배너 (dismiss 가능) ── */}
      {bannerVisible && (
        <div className="relative mb-3 shrink-0 rounded-lg border border-violet-500/30 bg-violet-500/5 pl-4 pr-10 py-3 flex items-start gap-3">
          <div className="w-7 h-7 rounded-md bg-violet-500/20 border border-violet-500/30 flex items-center justify-center shrink-0 text-violet-300">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <polygon points="10 8 16 12 10 16 10 8" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-bold text-white">
              라이브 송출 관제
            </p>
            <p className="mt-0.5 text-[11px] text-gray-400 leading-relaxed">
              이 대시보드는 방송실에 <span className="text-gray-200 font-semibold">별도 담당자</span>가 있는 교회를 위한 YouTube/RTMP 송출 관제 공간입니다.
              현재 버전은 라이브 송출과 로컬 파일 녹화를 별도로 제어하며, 예배순서 마킹은 녹화 여부와 독립적으로 기록합니다.
            </p>
            <p className="mt-1 text-[10px] text-gray-500 leading-relaxed">
              · 자막·카메라·오디오 믹싱 등 송출 런타임 조작은 <span className="text-gray-300">UnoLive 데스크탑</span>에서 계속 수행합니다.
              원맨 방송이라면 데스크탑만으로 충분합니다.
            </p>
            {syncStatus !== 'connected' && (
              <p className="mt-1.5 text-[11px] text-amber-400">
                ⚠ 데스크탑이 현재 연결되지 않았습니다. 웹에서 방송 제어가 비활성화됩니다.
              </p>
            )}
          </div>

          {/* 닫기 버튼 (우상단) */}
          <button
            onClick={dismissBanner}
            className="absolute top-2 right-2 w-7 h-7 rounded-md flex items-center justify-center text-gray-500 hover:text-white hover:bg-white/5 transition-colors"
            aria-label="인트로 배너 닫기"
            title="배너 닫기"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      )}

      {/* ── 최상단 유틸 바 (라이브러리 진입 + 배너 복원) ── */}
      <div className="mb-3 shrink-0 flex items-end justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <h1 className="text-3xl font-bold tracking-tight text-white lowercase leading-none">
            broadcast
          </h1>
          {syncStatus !== 'connected' && bannerVisible === false && (
            <span className="text-[11px] text-amber-400">· 데스크탑 미연결</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* 로그인 컨텍스트 배지 — 교회·사용자·플랜 */}
          <UserContextBadge />

          {!bannerVisible && (
            <button
              onClick={showBannerAgain}
              className="inline-flex items-center gap-1.5 px-2 h-8 rounded-md text-[11px] text-gray-500 hover:text-gray-200 hover:bg-white/5 transition-colors"
              title="인트로 배너 다시 보기"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="16" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12.01" y2="8" />
              </svg>
              안내 다시 보기
            </button>
          )}
          <Link
            href="/media/broadcast/library"
            className="inline-flex items-center gap-1.5 px-3 h-8 rounded-md bg-violet-600 hover:bg-violet-500 text-white text-[11px] font-bold transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
            </svg>
            방송 라이브러리
          </Link>
        </div>
      </div>

      {/* ── 본문 3 패널 그리드 (좌 22% · 중 나머지 · 우 22%) ──
          `main` 이 `h-[calc(100vh-3.5rem)]` 로 뷰포트에 고정되어 있고,
          이 그리드가 `flex-1 min-h-0` 로 남는 수직 공간을 꽉 채웁니다.
          - 좌측: IncidentLog 가 flex-1 (내부 스크롤)
          - 중앙: 하단 빈 박스가 flex-1
          - 우측: 컨텐츠가 컬럼 높이를 넘기면 컬럼 자체가 세로 스크롤 */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[22%_1fr_22%] gap-4 items-stretch">
        {/* 좌측 (22%): 자막 · 클립 마커 · 이벤트 로그 (flex-1) */}
        <div className="min-w-0 min-h-0 flex flex-col gap-4">
          <SubtitleStrip />
          <ClipMarkerPanel />
          <IncidentLog />
        </div>

        {/* 중앙 (나머지 ≒ 56%): 세션 헤더 + 프리뷰 + 하단 placeholder */}
        <div className="min-w-0 min-h-0 flex flex-col gap-4">
          <SessionHeader />
          <PreviewMonitor />
          {/* Scene Rack: OBS Studio Mode 의 Scene List (카드 그리드) */}
          <SceneRack />
        </div>

        {/* 우측 (22%): 방송 제어 + 런타임 모니터 탭 (필요 시 내부 스크롤) */}
        <div className="min-w-0 min-h-0 flex flex-col gap-4 overflow-y-auto pr-1">
          <BroadcastControls compositorStream={compositorStream} />
          {/* Recording + Live 수평 정렬 (같은 행 높이) */}
          <div className="grid grid-cols-2 gap-4 items-stretch shrink-0">
            <RecordingPanel compositorStream={compositorStream} />
            <LivePanel />
          </div>
          <RuntimeMonitorTabs />
        </div>
      </div>
    </main>
  );
}
