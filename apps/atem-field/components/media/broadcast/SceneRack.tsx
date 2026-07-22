'use client';

/**
 * SceneRack — BroadcastDashboard 하단 미들패널
 *
 * OBS Studio 의 Scene List 에 해당.
 * 준비된 송출 카드(이미지·영상·카메라·캔버스·카운트다운·검은 화면 등)를
 * 그리드로 나열하고, 클릭 한 번으로 Standby 에 로드합니다.
 *
 * Phase 2B.2: 사용자 카드 추가/삭제
 *   - 기본 5장 (builtin) + 사용자 추가 카드
 *   - 마지막 카드 뒤에 항상 "+ 추가" 버튼 한 장이 따라붙음
 *   - 전체가 5장보다 적으면 빈 대시 박스로 패딩해 시각적 균형 유지
 *   - 각 카드 호버 시 우상 ×(삭제) 아이콘 노출 (builtin 은 숨김)
 *
 * 상호작용:
 *   ─ 기본 클릭     → loadSceneToStandby(sceneId)   (PVW 슬롯에 로드)
 *   ─ 더블클릭      → emergencyCutToScene(sceneId)  (Program 즉시 컷)
 *   ─ 🔒 아이콘     → 잠금 토글 (리드만)
 *   ─ × 아이콘      → removeScene (builtin 은 숨김)
 *   ─ + 버튼        → AddSceneModal 오픈
 */

import { useState } from 'react';
import { useMediaStore, SCENE_KIND_ICON, SCENE_KIND_LABEL } from '@/lib/media/mediaStore';
import type { SceneCard } from '@/lib/media/mediaTypes';
import { ConsolePanel } from './_common';
import AddSceneModal from './AddSceneModal';

// 빈 슬롯 패딩 기준 (5 + add 버튼 = 최소 6칸)
const MIN_VISIBLE_SLOTS = 6;

export default function SceneRack() {
  const scenes = useMediaStore((s) => s.session.scenes);
  const programId = useMediaStore((s) => s.session.programSceneId);
  const standbyId = useMediaStore((s) => s.session.standbySceneId);
  const canControl = useMediaStore((s) => s.canControlBroadcast());
  const canLead = useMediaStore((s) => s.canLeadBroadcast());

  const loadToStandby = useMediaStore((s) => s.loadSceneToStandby);
  const cutToScene = useMediaStore((s) => s.emergencyCutToScene);
  const toggleLock = useMediaStore((s) => s.toggleSceneLock);
  const removeScene = useMediaStore((s) => s.removeScene);

  const [modalOpen, setModalOpen] = useState(false);

  // 빈 슬롯 수: 최소 6칸(5 + add) 유지. scenes + 1(add) 가 이보다 적으면 대시 박스로 패딩.
  const paddingSlotCount = Math.max(0, MIN_VISIBLE_SLOTS - (scenes.length + 1));

  return (
    <>
      <ConsolePanel
        title="Scene Rack"
        hint="클릭 → 대기 로드 · 더블클릭 → 즉시 컷 · + 버튼으로 추가"
        padded={false}
        className="flex flex-col flex-1 min-h-0"
      >
        <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-4">
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-2">
            {/* 기존 Scene 카드들 */}
            {scenes.map((scene) => (
              <SceneCardView
                key={scene.id}
                scene={scene}
                onProgram={scene.id === programId}
                onStandby={scene.id === standbyId}
                disabled={!canControl}
                canLead={canLead}
                canControl={canControl}
                onLoad={() => loadToStandby(scene.id)}
                onCut={() => cutToScene(scene.id)}
                onToggleLock={() => toggleLock(scene.id)}
                onRemove={() => {
                  if (scene.builtin) return;
                  if (
                    window.confirm(
                      `"${scene.label}" Scene 카드를 삭제하시겠습니까?\n(기본 5개 카드는 삭제할 수 없습니다)`
                    )
                  ) {
                    removeScene(scene.id);
                  }
                }}
              />
            ))}

            {/* 트레일링 + 추가 버튼 */}
            <AddSceneSlot disabled={!canControl} onClick={() => setModalOpen(true)} />

            {/* 패딩용 빈 대시 박스 */}
            {Array.from({ length: paddingSlotCount }).map((_, i) => (
              <EmptyDashSlot key={`pad-${i}`} />
            ))}
          </div>
        </div>
      </ConsolePanel>

      <AddSceneModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  );
}

// ─────────────────────────────────────────
// Scene 카드 (16:9 썸네일 + 상태 보더 + 삭제 버튼)
// ─────────────────────────────────────────
function SceneCardView({
  scene,
  onProgram,
  onStandby,
  disabled,
  canLead,
  canControl,
  onLoad,
  onCut,
  onToggleLock,
  onRemove,
}: {
  scene: SceneCard;
  onProgram: boolean;
  onStandby: boolean;
  disabled: boolean;
  canLead: boolean;
  canControl: boolean;
  onLoad: () => void;
  onCut: () => void;
  onToggleLock: () => void;
  onRemove: () => void;
}) {
  const icon = SCENE_KIND_ICON[scene.kind];
  const kindLabel = SCENE_KIND_LABEL[scene.kind];
  const bg = scene.accentColor ?? '#1f2937';

  // 상태 보더: PGM 이 PVW 보다 우선
  const borderClass = onProgram
    ? 'border-rose-500 ring-1 ring-rose-500/40'
    : onStandby
    ? 'border-violet-500 ring-1 ring-violet-500/40'
    : 'border-gray-800 hover:border-gray-600';

  const canDelete = canControl && !scene.builtin;

  return (
    <div
      className={`group relative rounded-md overflow-hidden border ${borderClass} transition-colors`}
      style={{ aspectRatio: '16 / 9' }}
    >
      {/* 메인 버튼 (클릭 → 로드 / 더블클릭 → 컷) */}
      <button
        type="button"
        onClick={onLoad}
        onDoubleClick={onCut}
        disabled={disabled || scene.locked}
        className="absolute inset-0 text-left disabled:opacity-50 disabled:cursor-not-allowed"
        title={
          scene.locked
            ? `${scene.label} (잠금)`
            : `${scene.label} — 클릭: 대기로 · 더블클릭: 즉시 컷`
        }
      >
        {/* 배경 그라데이션 */}
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background: `linear-gradient(135deg, ${bg}66 0%, ${bg}22 55%, #0a0c1099 100%)`,
          }}
        />

        {/* 중앙 아이콘 */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-2xl leading-none opacity-90">{icon}</span>
          <p className="mt-0.5 text-[8px] font-bold tracking-wider text-gray-300/80 uppercase">
            {kindLabel}
          </p>
        </div>
      </button>

      {/* 좌상: 라벨 (pointer-events-none 로 버튼 클릭 방해 X) */}
      <div className="absolute top-1 left-1 right-10 pointer-events-none">
        <p className="text-[9px] font-bold text-white/95 truncate leading-tight drop-shadow">
          {scene.label}
        </p>
      </div>

      {/* 우상: 삭제 + 잠금 아이콘 그룹 */}
      <div className="absolute top-1 right-1 flex items-center gap-0.5">
        {/* 잠금 토글 */}
        {(scene.locked || canLead) && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (canLead) onToggleLock();
            }}
            onDoubleClick={(e) => e.stopPropagation()}
            disabled={!canLead}
            className={`w-4 h-4 rounded flex items-center justify-center text-[9px] ${
              scene.locked
                ? 'bg-amber-600/80 text-white'
                : 'bg-black/40 text-gray-400 opacity-0 group-hover:opacity-100'
            } ${canLead ? 'hover:brightness-125 cursor-pointer' : 'cursor-default'} transition-opacity disabled:cursor-default`}
            title={scene.locked ? (canLead ? '잠금 해제' : '잠금됨') : '잠금'}
          >
            {scene.locked ? '🔒' : '🔓'}
          </button>
        )}

        {/* 삭제 (builtin 은 숨김) */}
        {canDelete && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            onDoubleClick={(e) => e.stopPropagation()}
            className="w-4 h-4 rounded bg-black/50 hover:bg-rose-600 text-gray-300 hover:text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all"
            title="Scene 삭제"
          >
            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </div>

      {/* 좌하: 상태 배지 */}
      {(onProgram || onStandby) && (
        <div className="absolute bottom-1 left-1 flex gap-1 pointer-events-none">
          {onProgram && (
            <span className="px-1 py-0.5 rounded bg-rose-600/95 text-[7px] font-bold tracking-wider text-white uppercase">
              PGM
            </span>
          )}
          {onStandby && !onProgram && (
            <span className="px-1 py-0.5 rounded bg-violet-600/95 text-[7px] font-bold tracking-wider text-white uppercase">
              PVW
            </span>
          )}
        </div>
      )}

      {/* 우하: 메모 */}
      {scene.note && (
        <div className="absolute bottom-1 right-1 max-w-[70%] pointer-events-none">
          <p className="text-[7px] text-gray-300/80 truncate text-right">
            {scene.note}
          </p>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────
// + 추가 슬롯
// ─────────────────────────────────────────
function AddSceneSlot({ disabled, onClick }: { disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-md border-2 border-dashed border-gray-700 hover:border-violet-500/70 hover:bg-violet-500/5 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-gray-700 disabled:hover:bg-transparent flex flex-col items-center justify-center gap-1 text-gray-500 hover:text-violet-300 transition-colors"
      style={{ aspectRatio: '16 / 9' }}
      title="Scene 추가"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
        <line x1="12" y1="5" x2="12" y2="19" />
        <line x1="5" y1="12" x2="19" y2="12" />
      </svg>
      <span className="text-[9px] font-bold tracking-wider uppercase">추가하기</span>
    </button>
  );
}

// ─────────────────────────────────────────
// 빈 대시 슬롯 (패딩용)
// ─────────────────────────────────────────
function EmptyDashSlot() {
  return (
    <div
      className="rounded-md border border-dashed border-gray-800/60 bg-[#0a0c10]/30"
      style={{ aspectRatio: '16 / 9' }}
    />
  );
}
