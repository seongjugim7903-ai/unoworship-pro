'use client';

/**
 * RecordButton — 녹화 버튼
 *
 * 대기: [● 녹화]       (회색 + 빨간 점)
 * 녹화 중: [■ 00:05:23] (빨간 배경 + 사각형 + 경과시간)
 */

import { useRecording } from '@/hooks/broadcast/useRecording';

export default function RecordButton() {
  const { isAvailable, isRecording, elapsedFormatted, toggle, unavailableReason } = useRecording();

  return (
    <button
      onClick={toggle}
      disabled={!isAvailable}
      title={isAvailable ? (isRecording ? '녹화 종료' : '녹화 시작') : unavailableReason}
      className={`flex items-center gap-1.5 px-3 h-8 rounded-md border text-xs transition-colors ${
        !isAvailable
          ? 'bg-[#171717] border-[#2a2a2a] text-gray-600 cursor-not-allowed'
          : isRecording
          ? 'bg-red-600/90 hover:bg-red-600 border-red-500 text-white'
          : 'bg-[#1a1a1a] hover:bg-[#252525] border-[#333] hover:border-[#444] text-gray-400 hover:text-gray-200'
      }`}
    >
      {isAvailable && isRecording ? (
        <>
          {/* 녹화 중 아이콘: 빨간 사각형 */}
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
            <rect x="2" y="2" width="8" height="8" rx="1" />
          </svg>
          <span className="font-mono tabular-nums">{elapsedFormatted}</span>
        </>
      ) : (
        <>
          {/* 대기 아이콘: 빨간 원 */}
          <svg width="12" height="12" viewBox="0 0 12 12" className={isAvailable ? '' : 'opacity-40'}>
            <circle cx="6" cy="6" r="4" fill="#ef4444" />
          </svg>
          {isAvailable ? '녹화' : '녹화 준비중'}
        </>
      )}
    </button>
  );
}
