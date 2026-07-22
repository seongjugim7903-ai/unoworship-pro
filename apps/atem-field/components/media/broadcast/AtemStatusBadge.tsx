'use client';

/**
 * AtemStatusBadge — ATEM 스위처 상태를 Program 미러 창 구석에 표시
 *
 * [FEATURE: BROADCAST_VIEWER]
 *
 * 표시 항목:
 *   - 연결 상태 (disconnected / connecting / connected / error) → 색상 점
 *   - IP 주소 (연결 중/됨 일 때)
 *   - DSK on/off 상태 (연결됨 + DSK on 일 때만 "DSK" 배지)
 *
 * 참고: ATEM 개별 카메라 영상 입력은 하드웨어(HDMI/NDI 캡처) 의존 기능이라
 *       이 컴포넌트는 **상태만** 노출합니다. 실제 카메라 썸네일 프리뷰는 Phase 2C+ 에서
 *       캡처 카드/NDI 스트림 수신을 붙여 확장합니다.
 */

import { useAtemStatus } from '@/hooks/useAtemStatus';

export default function AtemStatusBadge() {
  const { status, error } = useAtemStatus();

  // API 자체가 죽어 있으면 숨김 (노이즈 최소화)
  if (error && !status) return null;
  if (!status) return null;

  const { state, ip, dskOnAir, lastSubtitle } = status;

  const { dotClass, labelClass, label } = resolveStyles(state);

  return (
    <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-black/60 backdrop-blur-sm border border-white/10 pointer-events-none">
      <span className={`w-2 h-2 rounded-full ${dotClass}`} />
      <div className="flex flex-col leading-tight">
        <span className={`text-[9px] font-bold tracking-wider uppercase ${labelClass}`}>
          ATEM · {label}
        </span>
        {ip && state !== 'disconnected' && (
          <span className="text-[9px] font-mono text-gray-400 tabular-nums">{ip}</span>
        )}
      </div>

      {state === 'connected' && dskOnAir && (
        <span
          className="ml-1 px-1.5 py-[1px] rounded bg-amber-500/80 border border-amber-300/50 text-[8px] font-bold tracking-wider text-white uppercase"
          title={lastSubtitle ?? 'Downstream Keyer ON'}
        >
          DSK
        </span>
      )}
    </div>
  );
}

// ─────────────────────────────────────────
// 상태별 색상/라벨 헬퍼
// ─────────────────────────────────────────
function resolveStyles(state: string): {
  dotClass: string;
  labelClass: string;
  label: string;
} {
  switch (state) {
    case 'connected':
      return {
        dotClass: 'bg-emerald-400 animate-pulse',
        labelClass: 'text-emerald-300',
        label: 'Connected',
      };
    case 'connecting':
      return {
        dotClass: 'bg-amber-400 animate-pulse',
        labelClass: 'text-amber-300',
        label: 'Connecting',
      };
    case 'error':
      return {
        dotClass: 'bg-rose-500',
        labelClass: 'text-rose-300',
        label: 'Error',
      };
    default:
      return {
        dotClass: 'bg-gray-600',
        labelClass: 'text-gray-400',
        label: 'Offline',
      };
  }
}
