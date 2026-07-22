'use client';

/**
 * ProgramMirror — 16:9 Program 미러 창의 핵심 렌더러
 *
 * "브로드캐스트 미러 창이 최종 PGM 을 입력 받는다" 를 실제로 구현합니다.
 * 부모(PreviewMonitor)의 16:9 relative 컨테이너 안에 삽입되며,
 * 오버레이(REC, LIVE, 시청자 수, 섹션 라벨, 해상도)는 부모가 담당합니다.
 *
 * 렌더 규칙:
 *   scene 이 undefined         → 라이브 카메라 피드 자리 (Phase 2C+ WebRTC)
 *   scene.kind = image         → <img src={sourceUrl}>
 *   scene.kind = video         → <video autoPlay muted loop>
 *   scene.kind = window        → <iframe> (브라우저/윈도우 캡처)
 *   scene.kind = canvas        → Canvas 페이지 프리뷰 (id 힌트)
 *   scene.kind = countdown     → 라이브 카운트다운 타이머 (scene 전환 시 리셋)
 *   scene.kind = audio-cover   → 커버 이미지 블러 + Audio Playing 표시
 *   scene.kind = camera        → 서브 카메라 플레이스홀더
 *   scene.kind = black         → 검정
 *
 * sourceUrl 이 비어 있으면 accentColor 그라데이션 + 아이콘 + 라벨 폴백.
 */

import { useEffect, useState } from 'react';
import { SCENE_KIND_ICON, useMediaStore } from '@/lib/media/mediaStore';
import type { SceneCard } from '@/lib/media/mediaTypes';
import type { ActiveTransition } from '@/lib/media/mediaStore';
import BroadcastFeedMirror from './BroadcastFeedMirror';

interface ProgramMirrorProps {
  scene: SceneCard | undefined;
}

export default function ProgramMirror({ scene }: ProgramMirrorProps) {
  const activeTransition = useMediaStore((s) => s.activeTransition);

  // 전환 중: 두 씬을 동시에 렌더하면서 fromScene 은 나가고 toScene 이 들어옴
  //   - fromScene / toScene 이 null 이면 그 자리는 BroadcastFeed (카메라) 로 해석
  //   - CSS transition 기반 부드러운 애니메이션
  if (activeTransition) {
    return (
      <>
        <BroadcastFeedMirror />
        <TransitionLayer transition={activeTransition} />
      </>
    );
  }

  // 정적 상태 (전환 중 아님)
  return (
    <>
      <BroadcastFeedMirror />
      {scene && (
        <div className="absolute inset-0 bg-black" style={{ zIndex: 50 }}>
          <SceneOverlay scene={scene} />
        </div>
      )}
    </>
  );
}

// ─────────────────────────────────────────
// [FEATURE: TRANSITIONS] 전환 레이어 — fromScene → toScene 애니메이션
//   CSS @keyframes 기반: mount 시 자동 재생, setState rAF 트릭 불필요
// ─────────────────────────────────────────
function TransitionLayer({ transition }: { transition: ActiveTransition }) {
  const scenes = useMediaStore((s) => s.session.scenes);
  const fromScene = transition.fromSceneId
    ? scenes.find((s) => s.id === transition.fromSceneId)
    : undefined;
  const toScene = transition.toSceneId
    ? scenes.find((s) => s.id === transition.toSceneId)
    : undefined;

  const { type, duration, startedAt } = transition;
  const id = `t${startedAt}`;
  const easing = 'cubic-bezier(0.4, 0, 0.2, 1)';

  // 타입별 out/in 키프레임 생성
  //   fade          : out = opacity 1→0, in = opacity 0→1 (동시 교차)
  //   slide         : out = translateX 0→-100%, in = translateX 100%→0
  //   dip-to-black  : out = opacity 1→0 at 50%, 이후 정지  /
  //                   in  = opacity 0 유지 후 50%→100% 에 0→1
  //                   → 0~50% 까지는 out 페이드, 50~100% 에는 in 페이드
  //                   → 중간에 둘 다 투명 → z=49 의 검정 배경 노출
  let outKeyframe: string;
  let inKeyframe: string;

  if (type === 'dip-to-black') {
    outKeyframe = `@keyframes ${id}-out {
      0%   { opacity: 1 }
      50%  { opacity: 0 }
      100% { opacity: 0 }
    }`;
    inKeyframe = `@keyframes ${id}-in {
      0%   { opacity: 0 }
      50%  { opacity: 0 }
      100% { opacity: 1 }
    }`;
  } else if (type === 'slide') {
    outKeyframe = `@keyframes ${id}-out {
      from { transform: translateX(0) }
      to   { transform: translateX(-100%) }
    }`;
    inKeyframe = `@keyframes ${id}-in {
      from { transform: translateX(100%) }
      to   { transform: translateX(0) }
    }`;
  } else {
    // fade (기본)
    outKeyframe = `@keyframes ${id}-out {
      from { opacity: 1 }
      to   { opacity: 0 }
    }`;
    inKeyframe = `@keyframes ${id}-in {
      from { opacity: 0 }
      to   { opacity: 1 }
    }`;
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `${outKeyframe} ${inKeyframe}` }} />

      {/* z=49: dip-to-black 중간 구간에 노출되는 검정 배경
            (slide/fade 에선 scene 이 전체를 덮으므로 영향 없음) */}
      <div
        className="absolute inset-0 bg-black"
        style={{ zIndex: 49 }}
        aria-hidden
      />

      {/* fromScene — null 이면 렌더 안 함 (뒤의 BroadcastFeed 가 그대로 보임) */}
      {fromScene && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 50,
            animation: `${id}-out ${duration}ms ${easing} forwards`,
          }}
          className="bg-black"
        >
          <SceneOverlay scene={fromScene} />
        </div>
      )}

      {/* toScene — null 이면 렌더 안 함 */}
      {toScene && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 51,
            animation: `${id}-in ${duration}ms ${easing} forwards`,
          }}
          className="bg-black"
        >
          <SceneOverlay scene={toScene} />
        </div>
      )}
    </>
  );
}

// ─────────────────────────────────────────
// Scene override 오버레이 디스패처
// ─────────────────────────────────────────
function SceneOverlay({ scene }: { scene: SceneCard }) {
  switch (scene.kind) {
    case 'image':
      return <ImageSource scene={scene} />;
    case 'video':
      return <VideoSource scene={scene} />;
    case 'window':
      return <BrowserSource scene={scene} />;
    case 'canvas':
      return <CanvasSource scene={scene} />;
    case 'countdown':
      return <CountdownSource scene={scene} />;
    case 'audio-cover':
      return <AudioCoverSource scene={scene} />;
    case 'camera':
      return <SubCameraPlaceholder scene={scene} />;
    case 'black':
      return <BlackSource />;
    default:
      return <FallbackSource scene={scene} />;
  }
}

// ─────────────────────────────────────────
// 이미지 소스
// ─────────────────────────────────────────
function ImageSource({ scene }: { scene: SceneCard }) {
  if (!scene.sourceUrl) return <FallbackSource scene={scene} />;
  return (
    <>
      <div className="absolute inset-0 bg-black" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={scene.sourceUrl}
        alt={scene.label}
        className="absolute inset-0 w-full h-full object-contain"
      />
    </>
  );
}

// ─────────────────────────────────────────
// 영상 소스 — autoplay muted loop
// ─────────────────────────────────────────
function VideoSource({ scene }: { scene: SceneCard }) {
  if (!scene.sourceUrl) return <FallbackSource scene={scene} />;
  return (
    <>
      <div className="absolute inset-0 bg-black" />
      <video
        key={scene.id + scene.sourceUrl}
        src={scene.sourceUrl}
        autoPlay
        muted
        loop
        playsInline
        className="absolute inset-0 w-full h-full object-contain"
      />
    </>
  );
}

// ─────────────────────────────────────────
// 브라우저 (window) 소스 — iframe
// ─────────────────────────────────────────
function BrowserSource({ scene }: { scene: SceneCard }) {
  if (!scene.sourceUrl) return <FallbackSource scene={scene} />;
  return (
    <iframe
      key={scene.id + scene.sourceUrl}
      src={scene.sourceUrl}
      title={scene.label}
      sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
      className="absolute inset-0 w-full h-full border-0 bg-white"
    />
  );
}

// ─────────────────────────────────────────
// 캔버스 소스 — Phase 2C+ 실제 페이지 로드
// ─────────────────────────────────────────
function CanvasSource({ scene }: { scene: SceneCard }) {
  const bg = scene.accentColor ?? '#0ea5e9';
  return (
    <>
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background: `linear-gradient(135deg, ${bg}dd 0%, ${bg}66 50%, #0a0c10ee 100%)`,
        }}
      />
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
        <span className="text-7xl leading-none drop-shadow-lg">📖</span>
        <p className="text-[15px] font-bold text-white drop-shadow">
          {scene.label}
        </p>
        {scene.canvasPageId && (
          <p className="text-[9px] font-mono text-white/60 tracking-wider">
            canvas:{scene.canvasPageId}
          </p>
        )}
      </div>
    </>
  );
}

// ─────────────────────────────────────────
// 카운트다운 — scene.id 변경 시 타이머 리셋
// ─────────────────────────────────────────
function CountdownSource({ scene }: { scene: SceneCard }) {
  const total = scene.durationSec ?? 0;
  const [remaining, setRemaining] = useState(total);

  // scene 이 바뀌거나 durationSec 가 바뀌면 리셋
  useEffect(() => {
    setRemaining(total);
    if (total <= 0) return;
    const interval = setInterval(() => {
      setRemaining((r) => Math.max(0, r - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [scene.id, total]);

  const m = Math.floor(remaining / 60);
  const s = remaining % 60;
  const isDone = remaining === 0;

  const bg = scene.accentColor ?? '#8b5cf6';

  return (
    <>
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background: `radial-gradient(circle at center, ${bg}aa 0%, ${bg}33 45%, #000000 100%)`,
        }}
      />
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <p className="text-[10px] font-bold tracking-[0.3em] text-white/70 uppercase mb-3">
          {scene.label}
        </p>
        <span
          className={`text-7xl md:text-8xl font-bold tabular-nums drop-shadow-2xl ${
            isDone ? 'text-rose-400 animate-pulse' : 'text-white'
          }`}
        >
          {String(m).padStart(2, '0')}:{String(s).padStart(2, '0')}
        </span>
        {isDone && (
          <p className="mt-3 text-[11px] font-bold tracking-widest text-rose-300 uppercase">
            · Time&apos;s Up ·
          </p>
        )}
      </div>
    </>
  );
}

// ─────────────────────────────────────────
// 오디오 + 커버 이미지 — 블러 + Audio Playing 표시
// ─────────────────────────────────────────
function AudioCoverSource({ scene }: { scene: SceneCard }) {
  const bg = scene.accentColor ?? '#ec4899';
  return (
    <>
      {scene.sourceUrl ? (
        <>
          <div className="absolute inset-0 bg-black" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={scene.sourceUrl}
            alt={scene.label}
            className="absolute inset-0 w-full h-full object-cover"
          />
        </>
      ) : (
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(135deg, ${bg}dd 0%, ${bg}44 100%)`,
          }}
        />
      )}
      {/* 블러 오버레이 */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-md" />
      {/* 중앙 컨텐츠 */}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
        <span className="text-6xl leading-none">🎵</span>
        <p className="text-[14px] font-bold text-white drop-shadow">
          {scene.label}
        </p>
        <span className="mt-2 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/10 border border-white/20">
          <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
          <span className="text-[9px] font-bold text-white uppercase tracking-wider">
            Audio Playing
          </span>
        </span>
      </div>
    </>
  );
}

// ─────────────────────────────────────────
// 서브 카메라 (Phase 2C+ 실제 디바이스)
// ─────────────────────────────────────────
function SubCameraPlaceholder({ scene }: { scene: SceneCard }) {
  return (
    <>
      <div className="absolute inset-0 bg-gray-900" />
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
        <span className="text-6xl">📷</span>
        <p className="text-[13px] font-bold text-white">{scene.label}</p>
        <p className="text-[9px] text-gray-500 tracking-wider uppercase">
          Sub camera · Phase 2C+
        </p>
      </div>
    </>
  );
}

// ─────────────────────────────────────────
// 검정
// ─────────────────────────────────────────
function BlackSource() {
  return (
    <>
      <div className="absolute inset-0 bg-black" />
      <div className="absolute inset-x-0 bottom-6 flex items-center justify-center">
        <span className="text-[9px] font-bold tracking-[0.3em] text-gray-700 uppercase">
          · Broadcast Paused ·
        </span>
      </div>
    </>
  );
}

// ─────────────────────────────────────────
// 소스 URL 이 없는 경우의 공통 폴백
// ─────────────────────────────────────────
function FallbackSource({ scene }: { scene: SceneCard }) {
  const bg = scene.accentColor ?? '#1f2937';
  return (
    <>
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background: `linear-gradient(135deg, ${bg}cc 0%, ${bg}44 50%, #0a0c10ee 100%)`,
        }}
      />
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-gray-200">
        <span className="text-7xl leading-none drop-shadow-lg">
          {SCENE_KIND_ICON[scene.kind]}
        </span>
        <p className="text-[14px] font-bold text-white drop-shadow">
          {scene.label}
        </p>
        <p className="text-[9px] text-gray-400 tracking-wider uppercase">
          소스 미설정
        </p>
      </div>
    </>
  );
}
