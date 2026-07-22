'use client';

/**
 * LiveButton — 라이브 송출 버튼
 *
 * 대기 (idle/error): [🔴 라이브]      회색 + 빨간 원
 * 연결 중 (connecting): [⏳ 연결중...]  노란 배경
 * 라이브 (live): [● LIVE 00:15:23]   빨간 펄스 + 경과시간
 */

import { useLiveStream } from '@/hooks/broadcast/useLiveStream';
import LiveSetupModal from './LiveSetupModal';

export default function LiveButton() {
  const {
    liveStatus,
    isLive,
    isConnecting,
    elapsedFormatted,
    isModalOpen,
    closeModal,
    handleButtonClick,
  } = useLiveStream();

  // 에러 상태 표시
  const hasError = liveStatus === 'error';

  return (
    <>
      <button
        onClick={handleButtonClick}
        title={
          isLive ? '라이브 송출 종료' :
          isConnecting ? '연결 중...' :
          hasError ? '오류 — 다시 시도' :
          '라이브 송출 시작'
        }
        disabled={isConnecting}
        className={`flex items-center gap-1.5 px-3 h-8 rounded-md border text-xs transition-colors ${
          isLive
            ? 'bg-red-600/90 hover:bg-red-700 border-red-500 text-white'
            : isConnecting
            ? 'bg-yellow-600/30 border-yellow-500 text-yellow-300 cursor-wait'
            : hasError
            ? 'bg-red-900/30 hover:bg-red-900/50 border-red-700 text-red-300'
            : 'bg-[#1a1a1a] hover:bg-[#252525] border-[#333] hover:border-[#444] text-gray-400 hover:text-gray-200'
        }`}
      >
        {isLive ? (
          <>
            {/* 펄스 애니메이션 점 */}
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-white" />
            </span>
            <span className="font-bold tracking-wider">LIVE</span>
            <span className="font-mono tabular-nums text-[10px] opacity-80">
              {elapsedFormatted}
            </span>
          </>
        ) : isConnecting ? (
          <>
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              className="animate-spin"
            >
              <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
              <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
            </svg>
            연결중
          </>
        ) : (
          <>
            {/* 빨간 원 (YouTube 로고 느낌) */}
            <svg width="12" height="12" viewBox="0 0 12 12">
              <circle cx="6" cy="6" r="5" fill="#ef4444" />
            </svg>
            라이브
          </>
        )}
      </button>

      {/* 라이브 설정 모달 */}
      <LiveSetupModal isOpen={isModalOpen} onClose={closeModal} />
    </>
  );
}
