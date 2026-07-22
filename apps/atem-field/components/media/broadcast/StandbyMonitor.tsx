'use client';

/**
 * StandbyMonitor — Program 옆 1/5 박스
 *
 * OBS Studio Mode 의 Preview (on-deck) 에 해당.
 * "지금 Take 를 누르면 Program 에 덮어씌워질" Scene 카드 프리뷰 + CTA.
 *
 * Phase 2B.1: UI 셸 (실제 비디오 프레임 대신 accentColor + 아이콘 플레이스홀더)
 */

import { useMediaStore, SCENE_KIND_ICON, SCENE_KIND_LABEL } from '@/lib/media/mediaStore';
import type { SceneCard } from '@/lib/media/mediaTypes';
import TransitionPanel from '@/components/scenes/TransitionPanel';

export default function StandbyMonitor() {
  const standby = useMediaStore((s) => s.getStandbyScene());
  const program = useMediaStore((s) => s.getProgramScene());
  const canControl = useMediaStore((s) => s.canControlBroadcast());
  const take = useMediaStore((s) => s.takeStandbyToProgram);
  const swap = useMediaStore((s) => s.swapProgramStandby);
  const returnLive = useMediaStore((s) => s.returnProgramToLive);
  const loadToStandby = useMediaStore((s) => s.loadSceneToStandby);

  const onProgram = program !== undefined;
  const hasStandby = standby !== undefined;
  const canTake = canControl && hasStandby && standby.id !== program?.id;

  return (
    <div className="flex flex-col gap-2 h-full min-h-0">
      {/* ── 타이틀 바 ── */}
      <div className="flex items-center justify-between px-0.5">
        <span className="text-[9px] font-bold tracking-wider text-gray-500 uppercase">
          Standby
        </span>
        {hasStandby && (
          <button
            type="button"
            onClick={() => loadToStandby(null)}
            disabled={!canControl}
            className="text-[9px] font-bold text-gray-500 hover:text-rose-300 disabled:opacity-40 disabled:cursor-not-allowed"
            title="대기 비우기"
          >
            비우기
          </button>
        )}
      </div>

      {/* ── 16:9 대기 썸네일 ── */}
      <SceneThumbnail scene={standby} />

      {/* ── NEW: Transition 선택 (타입 + 지속시간만, 액션 버튼 없음) ── */}
      <TransitionPanel variant="compact" showActions={false} />

      {/* ── 액션 버튼들 (기존) ── */}
      <div className="flex flex-col gap-1.5">
        {/* Take (main CTA) */}
        <button
          type="button"
          onClick={take}
          disabled={!canTake}
          className="h-9 rounded-md bg-rose-600 hover:bg-rose-500 disabled:bg-gray-800 disabled:text-gray-600 disabled:cursor-not-allowed text-white text-[11px] font-bold transition-colors flex items-center justify-center gap-1.5"
          title="Standby 를 Program 으로 송출 교체"
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="9 18 15 12 9 6" />
          </svg>
          TAKE
        </button>

        {/* Swap + Return to Live */}
        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={swap}
            disabled={!canControl || (!hasStandby && !onProgram)}
            className="h-7 rounded bg-gray-800 hover:bg-gray-700 disabled:bg-gray-900 disabled:text-gray-700 disabled:cursor-not-allowed text-gray-300 text-[9px] font-bold transition-colors"
            title="Program ↔ Standby 역할 교체"
          >
            SWAP
          </button>
          <button
            type="button"
            onClick={returnLive}
            disabled={!canControl || !onProgram}
            className="h-7 rounded bg-gray-800 hover:bg-gray-700 disabled:bg-gray-900 disabled:text-gray-700 disabled:cursor-not-allowed text-gray-300 text-[9px] font-bold transition-colors"
            title="Program 을 실제 카메라 피드로 복귀"
          >
            LIVE ↺
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────
// 16:9 썸네일 플레이스홀더
// ─────────────────────────────────────────
function SceneThumbnail({ scene }: { scene: SceneCard | undefined }) {
  if (!scene) {
    return (
      <div
        className="relative w-full rounded-md border border-dashed border-gray-800 bg-[#0a0c10]/60 flex items-center justify-center"
        style={{ aspectRatio: '16 / 9' }}
      >
        <p className="text-[9px] text-gray-600 px-2 text-center leading-snug">
          Scene 카드를
          <br />
          Rack 에서 선택
        </p>
      </div>
    );
  }

  const icon = SCENE_KIND_ICON[scene.kind];
  const kindLabel = SCENE_KIND_LABEL[scene.kind];
  const bg = scene.accentColor ?? '#1f2937';

  return (
    <div
      className="relative w-full rounded-md overflow-hidden border border-violet-500/30"
      style={{ aspectRatio: '16 / 9' }}
    >
      {/* 배경 그라데이션 (accent → black) */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background: `linear-gradient(135deg, ${bg}55 0%, ${bg}22 50%, #0a0c1080 100%)`,
        }}
      />

      {/* 카드 아이콘 */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl leading-none">{icon}</span>
        <p className="mt-1 text-[9px] font-bold tracking-wider text-gray-300 uppercase">
          {kindLabel}
        </p>
      </div>

      {/* 좌상 라벨 */}
      <div className="absolute top-1 left-1 right-1">
        <p className="text-[9px] font-bold text-white/95 truncate leading-tight drop-shadow">
          {scene.label}
        </p>
      </div>

      {/* 우상 PREVIEW 배지 */}
      <div className="absolute top-1 right-1 px-1 py-0.5 rounded bg-violet-600/90 border border-violet-400/40">
        <span className="text-[7px] font-bold tracking-wider text-white uppercase">
          PVW
        </span>
      </div>
    </div>
  );
}
