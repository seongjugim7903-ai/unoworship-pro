'use client';

/**
 * TransitionPanel — Scene 전환 효과 컨트롤 패널 (공용)
 *
 * 두 곳에서 동일 컴포넌트로 재사용:
 *   1. /media/broadcast 대시보드 — Standby 모니터 바로 아래 (우측 1/5 컬럼)
 *   2. UnoLive OperatorPanel — 우측 패널, 4분할 카메라 아래 슬롯 중 한 자리
 *
 * 현재는 레이아웃 플레이스홀더 + 기본 UI 뼈대.
 * 다음 단계에서 실제 트랜지션 로직 (Cut/Fade/Slide + duration) 을 연결.
 */

import { useMediaStore, type TransitionType } from '@/lib/media/mediaStore';
import { useStore } from '@/lib/store';

interface TransitionPanelProps {
  /** 'compact' — 좁은 사이드 컬럼용 (대시보드 Standby 밑)
   *  'standard' — 일반 박스 (composer 우측 패널 내부)
   */
  variant?: 'compact' | 'standard';
  /** TAKE/SWAP/LIVE 액션 버튼 표시 여부.
   *  Dashboard StandbyMonitor 는 자체 버튼이 있으므로 false 로 중복 제거.
   *  기본 true.
   */
  showActions?: boolean;
  /** 전환 대상:
   *  'scene'   — Dashboard Scene 전환 (mediaStore.transitionConfig)
   *  'section' — UnoLive 섹션 전환 (composer useStore.sectionTransition)
   *              → /output, /prompt 송출 시 적용
   *  기본 'scene' (기존 동작 유지)
   */
  mode?: 'scene' | 'section';
}

const TRANSITIONS: { id: TransitionType; label: string; icon: string }[] = [
  { id: 'cut',           label: 'Cut',   icon: '●' },
  { id: 'fade',          label: 'Fade',  icon: '◐' },
  { id: 'slide',         label: 'Slide', icon: '▶' },
  { id: 'dip-to-black',  label: 'Dip',   icon: '◼' },
];

const DURATIONS: number[] = [0, 250, 500, 1000];

export default function TransitionPanel({
  variant = 'standard',
  showActions = true,
  mode = 'scene',
}: TransitionPanelProps) {
  // ── 모드별 store 연결 ──
  const sceneConfig = useMediaStore((s) => s.transitionConfig);
  const setSceneConfig = useMediaStore((s) => s.setTransitionConfig);
  const sectionConfig = useStore((s) => s.sectionTransition);
  const setSectionConfig = useStore((s) => s.setSectionTransition);

  const config = mode === 'section' ? sectionConfig : sceneConfig;
  const setConfig = mode === 'section' ? setSectionConfig : setSceneConfig;
  const { type, duration } = config;

  const setType = (t: TransitionType) => setConfig({ type: t });
  const setDuration = (d: number) => setConfig({ duration: d });

  // Scene 전환 액션 (mode='scene' 에서만 의미)
  const standbyId = useMediaStore((s) => s.session.standbySceneId);
  const take = useMediaStore((s) => s.takeStandbyToProgram);
  const swap = useMediaStore((s) => s.swapProgramStandby);
  const returnLive = useMediaStore((s) => s.returnProgramToLive);
  const canControl = useMediaStore((s) => s.canControlBroadcast());

  const handleTake = () => take();

  const compact = variant === 'compact';

  return (
    <div className={`bg-[#141414] rounded-lg border border-[#222] ${compact ? 'p-2' : 'p-3'}`}>
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-2">
        <p className={`font-semibold text-gray-300 ${compact ? 'text-[10px]' : 'text-xs'}`}>
          Transition
        </p>
        <span className={`text-gray-500 font-mono ${compact ? 'text-[9px]' : 'text-[10px]'}`}>
          {type.toUpperCase()} / {duration}ms
        </span>
      </div>

      {/* 타입 선택 */}
      <div className="grid grid-cols-4 gap-1 mb-2">
        {TRANSITIONS.map((t) => (
          <button
            key={t.id}
            onClick={() => setType(t.id)}
            className={`flex flex-col items-center justify-center rounded border transition-colors ${
              compact ? 'py-1 text-[9px]' : 'py-1.5 text-[10px]'
            } ${
              type === t.id
                ? 'bg-violet-600/20 border-violet-500 text-violet-200'
                : 'bg-[#1a1a1a] border-[#333] text-gray-400 hover:border-[#555]'
            }`}
          >
            <span className={compact ? 'text-xs' : 'text-sm'}>{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {/* Duration 선택 */}
      <div className="grid grid-cols-4 gap-1 mb-2">
        {DURATIONS.map((d) => (
          <button
            key={d}
            onClick={() => setDuration(d)}
            disabled={type === 'cut' && d > 0}
            className={`rounded border transition-colors ${
              compact ? 'py-0.5 text-[9px]' : 'py-1 text-[10px]'
            } ${
              duration === d
                ? 'bg-violet-600/20 border-violet-500 text-violet-200'
                : 'bg-[#1a1a1a] border-[#333] text-gray-400 hover:border-[#555]'
            } disabled:opacity-30 disabled:cursor-not-allowed`}
          >
            {d === 0 ? '0' : `${d}ms`}
          </button>
        ))}
      </div>

      {/* 액션 버튼 — showActions=true 일 때만.
          Dashboard 의 StandbyMonitor 는 자체 TAKE/SWAP/LIVE 버튼이 있어 false 로 전달. */}
      {showActions && (
        <div className="flex gap-1">
          <button
            onClick={handleTake}
            disabled={!canControl || !standbyId}
            title="Standby → Program 송출"
            className={`flex-1 rounded font-bold transition-colors ${
              compact ? 'py-1 text-[10px]' : 'py-1.5 text-xs'
            } bg-rose-700 hover:bg-rose-600 text-white disabled:opacity-30 disabled:cursor-not-allowed`}
          >
            TAKE
          </button>
          <button
            onClick={swap}
            disabled={!canControl}
            title="Program ↔ Standby 역할 교체"
            className={`flex-1 rounded font-bold transition-colors ${
              compact ? 'py-1 text-[10px]' : 'py-1.5 text-xs'
            } bg-[#1a1a1a] border border-[#333] text-gray-300 hover:bg-[#252525] disabled:opacity-30 disabled:cursor-not-allowed`}
          >
            SWAP
          </button>
          <button
            onClick={returnLive}
            disabled={!canControl}
            title="실제 카메라 피드로 복귀"
            className={`flex-1 rounded font-bold transition-colors ${
              compact ? 'py-1 text-[10px]' : 'py-1.5 text-xs'
            } bg-[#1a1a1a] border border-[#333] text-gray-300 hover:bg-[#252525] disabled:opacity-30 disabled:cursor-not-allowed`}
          >
            LIVE
          </button>
        </div>
      )}
    </div>
  );
}
