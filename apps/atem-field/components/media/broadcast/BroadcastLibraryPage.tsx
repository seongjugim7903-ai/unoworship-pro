'use client';

/**
 * BroadcastLibraryPage — /media/broadcast/library
 *
 * 종료된 방송 세션의 아카이브. 각 세션은 다음 요소로 구성됩니다:
 *   - 메인 녹화 파일 1개 (풀 레코딩)
 *   - 라이브 중 찍어 둔 클립 마커들 (메인 파일에 대한 비파괴 in/out 구간)
 *   - (선택) Canvas 에서 만든 썸네일
 *   - YouTube 업로드 상태
 *
 * Phase 3.5 현재 구현 범위:
 *   - 세션 목록 + 상세 (목 데이터 기반)
 *   - 수동 다운로드 버튼 (Phase 3.8 까지는 데스크탑에서 파일을 내려받고
 *     YouTube에 수동 업로드)
 *   - Canvas 썸네일 작업공간 진입 CTA
 *   - YouTube 자동 업로드 버튼은 "Phase 3.8 예정" 으로 비활성 표시
 *
 * 권한:
 *   - 목록/다운로드: canAccessBroadcast() (미디어팀 전원)
 *   - 삭제/편집:    canLeadBroadcast()    (Lead 만)
 */

import Link from 'next/link';
import { useState } from 'react';
import { useMediaStore, CLIP_KIND_LABEL } from '@/lib/media/mediaStore';
import type { BroadcastRecord, SessionClipMarker } from '@/lib/media/mediaTypes';
import { ConsolePanel, formatBytes } from './_common';
import AccessGate from './AccessGate';

export default function BroadcastLibraryPage() {
  const canAccess = useMediaStore((s) => s.canAccessBroadcast());
  const records = useMediaStore((s) => s.broadcastRecords);
  const [expandedId, setExpandedId] = useState<string | null>(records[0]?.id ?? null);

  if (!canAccess) return <AccessGate />;

  // 최신 먼저
  const sorted = [...records].sort((a, b) => b.startedAt - a.startedAt);

  const totalSessions = sorted.length;
  const totalClips = sorted.reduce((acc, r) => acc + r.clips.length, 0);
  const uploadedCount = sorted.filter((r) => r.youtubeStatus === 'uploaded').length;

  return (
    <main className="w-full px-6 py-6">
      {/* ── 상단 브래드크럼 + 제목 ── */}
      <div className="flex items-center gap-2 text-[11px] text-gray-500 mb-2">
        <Link href="/media/broadcast" className="hover:text-gray-300">
          ← 방송 관제
        </Link>
        <span className="text-gray-700">/</span>
        <span className="text-gray-400">라이브러리</span>
      </div>
      <div className="flex items-end justify-between gap-4 mb-4">
        <div>
          <h1 className="text-2xl font-bold text-white">방송 라이브러리</h1>
          <p className="mt-1 text-[12px] text-gray-400">
            종료된 방송 세션과 그 안에서 마킹한 클립들을 여기서 추출·편집하고 YouTube에 업로드합니다.
          </p>
        </div>
        <Link
          href="/media/canvas"
          className="hidden md:inline-flex items-center gap-1.5 px-3 h-9 rounded bg-violet-600 hover:bg-violet-500 text-white text-[11px] font-bold transition-colors"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
          썸네일 작업공간 (Canvas)
        </Link>
      </div>

      {/* ── 통계 3개 ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <StatCard label="세션 수" value={totalSessions.toString()} hint="이번 분기 종료된 방송" />
        <StatCard label="마킹된 클립" value={totalClips.toString()} hint="설교·찬양·특송 등 섹션 구간" />
        <StatCard
          label="YouTube 업로드 완료"
          value={`${uploadedCount} / ${totalSessions}`}
          hint="Phase 3.8 까지는 수동 업로드"
        />
      </div>

      {/* ── Phase 3.5 업로드 방식 안내 ── */}
      <div className="mb-4 rounded-lg border border-amber-600/30 bg-amber-900/10 px-4 py-3 flex items-start gap-3">
        <div className="w-7 h-7 rounded-md bg-amber-500/20 border border-amber-500/30 flex items-center justify-center shrink-0 text-amber-300">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-bold text-amber-200">
            Phase 3.5 · 수동 업로드 워크플로우
          </p>
          <p className="mt-0.5 text-[11px] text-amber-100/80 leading-relaxed">
            현재 단계에서는 데스크탑에서 메인 녹화 파일·클립 추출본을 내려받아
            YouTube Studio에 직접 업로드합니다. YouTube Data API v3 를 통한
            원클릭 자동 업로드는 <span className="font-semibold text-amber-100">Phase 3.8</span> 에 열립니다.
          </p>
        </div>
      </div>

      {/* ── 세션 리스트 ── */}
      <section className="space-y-3">
        {sorted.map((rec) => (
          <RecordCard
            key={rec.id}
            record={rec}
            expanded={expandedId === rec.id}
            onToggle={() => setExpandedId(expandedId === rec.id ? null : rec.id)}
          />
        ))}
      </section>
    </main>
  );
}

// ─────────────────────────────────────────
// 통계 카드
// ─────────────────────────────────────────
function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <ConsolePanel>
      <p className="text-[9px] font-semibold tracking-wider text-gray-500 uppercase">
        {label}
      </p>
      <p className="mt-1 text-2xl font-bold text-white tabular-nums">{value}</p>
      <p className="mt-0.5 text-[10px] text-gray-500">{hint}</p>
    </ConsolePanel>
  );
}

// ─────────────────────────────────────────
// 세션 카드
// ─────────────────────────────────────────
function RecordCard({
  record,
  expanded,
  onToggle,
}: {
  record: BroadcastRecord;
  expanded: boolean;
  onToggle: () => void;
}) {
  const dur = record.endedAt - record.startedAt;
  const durMin = Math.round(dur / 60_000);
  const startLabel = new Date(record.startedAt).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  });

  const status = YOUTUBE_STATUS_STYLE[record.youtubeStatus];

  return (
    <ConsolePanel padded={false} className="overflow-hidden">
      {/* ── 요약 헤더 ── */}
      <button
        onClick={onToggle}
        className="w-full px-5 py-4 flex items-center gap-4 hover:bg-gray-900/30 transition-colors text-left"
      >
        {/* 썸네일 슬롯 */}
        <div className="w-24 h-14 rounded bg-[#15171e] border border-gray-800 flex items-center justify-center shrink-0 text-gray-600">
          {record.thumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={record.thumbnailUrl} alt="" className="w-full h-full object-cover rounded" />
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
          )}
        </div>

        {/* 타이틀/메타 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-base font-bold text-white truncate">{record.worshipTitle}</h3>
            <span
              className={`px-1.5 py-0.5 rounded border text-[9px] font-bold ${status.color}`}
            >
              {status.label}
            </span>
          </div>
          <p className="mt-0.5 text-[11px] text-gray-500">
            {startLabel} · {durMin}분 · {record.quality} · {formatBytes(record.mainFileSize)}
          </p>
          <p className="mt-0.5 text-[10px] text-gray-600">
            클립 {record.clips.length}개 마킹됨
          </p>
        </div>

        {/* 화살표 */}
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={`text-gray-500 transition-transform ${expanded ? 'rotate-180' : ''}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {/* ── 펼친 상세 ── */}
      {expanded && (
        <div className="border-t border-gray-800 bg-[#0a0c10]/60 px-5 py-4">
          {/* 메인 파일 액션 */}
          <div className="rounded-lg border border-gray-800 bg-[#0d0f14] p-3 mb-4">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex-1 min-w-0">
                <p className="text-[9px] font-semibold tracking-wider text-gray-500 uppercase">
                  메인 녹화 파일
                </p>
                <p className="mt-0.5 text-[11px] text-gray-200 font-mono truncate">
                  {record.mainFilePath}
                </p>
                <p className="mt-0.5 text-[10px] text-gray-500">
                  {formatBytes(record.mainFileSize)} · {record.quality}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  className="px-3 h-9 rounded bg-violet-600 hover:bg-violet-500 text-white text-[11px] font-bold flex items-center gap-1.5 transition-colors"
                  title="데스크탑 UnoLive 에서 이 파일을 여는 방법 안내 (Phase 3.5)"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  다운로드
                </button>
                <button
                  disabled
                  className="px-3 h-9 rounded bg-gray-800 text-gray-500 text-[11px] font-bold flex items-center gap-1.5 cursor-not-allowed"
                  title="YouTube 자동 업로드는 Phase 3.8 예정"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2c-1.7-.46-8.6-.46-8.6-.46s-6.9 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.7.46 8.6.46 8.6.46s6.9 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.33 29 29 0 0 0-.46-5.25z" />
                    <polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02" />
                  </svg>
                  YouTube 업로드
                  <span className="ml-1 text-[8px] text-gray-600">Phase 3.8</span>
                </button>
              </div>
            </div>
          </div>

          {/* 클립 리스트 */}
          {record.clips.length > 0 && (
            <div>
              <p className="text-[9px] font-semibold tracking-wider text-gray-500 uppercase mb-2">
                마킹된 클립 ({record.clips.length})
              </p>
              <ul className="space-y-2">
                {record.clips.map((clip) => (
                  <ClipRow key={clip.id} clip={clip} />
                ))}
              </ul>
            </div>
          )}

          {/* 썸네일 작업 진입 */}
          <div className="mt-4 rounded border border-violet-500/30 bg-violet-900/10 px-3 py-2.5 flex items-center gap-3">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-violet-300 shrink-0">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
            <p className="flex-1 text-[10px] text-violet-200">
              이 세션의 썸네일을 Canvas 에서 디자인하고 업로드할 수 있습니다.
            </p>
            <Link
              href="/media/canvas"
              className="text-[10px] font-bold text-violet-300 hover:text-violet-200 underline"
            >
              Canvas 열기 →
            </Link>
          </div>
        </div>
      )}
    </ConsolePanel>
  );
}

// ─────────────────────────────────────────
// 클립 행
// ─────────────────────────────────────────
function ClipRow({ clip }: { clip: SessionClipMarker }) {
  const dur = clip.endedAt !== null ? clip.endedAt - clip.startedAt : 0;
  const durMin = Math.floor(dur / 60_000);
  const durSec = Math.floor((dur % 60_000) / 1000);
  return (
    <li className="rounded border border-gray-800 bg-[#0d0f14] px-3 py-2 flex items-center gap-3">
      <span className="px-2 py-0.5 rounded border border-violet-500/30 bg-violet-500/10 text-[9px] font-bold text-violet-300 shrink-0">
        {CLIP_KIND_LABEL[clip.kind]}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-semibold text-gray-200 truncate">{clip.label}</p>
        <p className="text-[9px] text-gray-600 tabular-nums">
          {String(durMin).padStart(2, '0')}:{String(durSec).padStart(2, '0')} · 구간 추출 가능
        </p>
      </div>
      <button
        className="px-2 h-7 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 text-[10px] font-bold transition-colors shrink-0"
        title="이 구간만 메인 파일에서 잘라 냅니다 (Phase 3.5: 데스크탑에서 ffmpeg 추출)"
      >
        추출
      </button>
      <button
        disabled
        className="px-2 h-7 rounded bg-gray-800 text-gray-600 text-[10px] font-bold cursor-not-allowed shrink-0"
        title="YouTube 자동 업로드는 Phase 3.8 예정"
      >
        업로드
      </button>
    </li>
  );
}

// ─────────────────────────────────────────
// YouTube 상태 배지 스타일
// ─────────────────────────────────────────
const YOUTUBE_STATUS_STYLE = {
  uploaded:     { label: 'YouTube 업로드됨',       color: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' },
  uploading:    { label: '업로드 중…',             color: 'border-violet-500/40 bg-violet-500/10 text-violet-300' },
  'not-uploaded': { label: '업로드 대기',          color: 'border-gray-600/40 bg-gray-700/20 text-gray-400' },
  failed:       { label: '업로드 실패',            color: 'border-red-500/40 bg-red-500/10 text-red-300' },
} as const;
