'use client';

/**
 * SectionTransitionOverlay
 * [FEATURE: SECTION_TRANSITION]
 *
 * 섹션 송출 전환 시 "이전 프레임의 스냅샷" 을 위에 얹어
 * CSS 키프레임으로 Fade / Slide / Dip 애니메이션을 재생.
 * 애니메이션 종료 후 onComplete 콜백으로 자기 자신을 정리.
 *
 * 사용처:
 *   - OutputCanvas (강대상)
 *   - PromptCanvas (중층)
 *   - BroadcastFeedMirror (대시보드 미러)
 *
 * 동작 순서:
 *   1. 송출 직전: 이전 화면을 캡처 → snapshot prop 으로 전달
 *   2. 수신자는 canvas 에 새 프레임을 즉시 렌더
 *   3. 이 컴포넌트가 snapshot 을 canvas 위에 overlay 하면서 페이드아웃
 *   4. duration 후 onComplete → 부모가 state 를 null 로 → 언마운트
 */

import { useCallback, useEffect, useMemo, useRef } from 'react';

export type SectionTransitionType = 'fade' | 'slide' | 'dip-to-black';
export type SectionTransitionSnapshot = string | HTMLCanvasElement;

interface Props {
  snapshot: SectionTransitionSnapshot; // data URL 또는 이전 화면 canvas
  type: SectionTransitionType;
  duration: number;           // ms
  /** 애니메이션이 끝난 뒤 호출됨 (자동 정리용) */
  onComplete: () => void;
  /** 스냅샷이 없을 때 대체 배경 (dip 효과 보강) */
  keyframesId?: string;
}

export default function SectionTransitionOverlay({
  snapshot,
  type,
  duration,
  onComplete,
  keyframesId,
}: Props) {
  // 유니크 키프레임 ID (동시에 여러 전환 방지)
  const id = useMemo(
    () => keyframesId ?? `sec-t${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    [keyframesId],
  );

  // 타입별 키프레임
  const keyframeCSS = useMemo(() => {
    if (type === 'fade') {
      return `@keyframes ${id} {
        from { opacity: 1 }
        to   { opacity: 0 }
      }`;
    }
    if (type === 'slide') {
      return `@keyframes ${id} {
        from { transform: translateX(0) }
        to   { transform: translateX(-100%) }
      }`;
    }
    // dip-to-black — 전반부 fade out, 후반부 유지 (0 으로) → 검정 배경 노출
    return `@keyframes ${id} {
      0%   { opacity: 1 }
      50%  { opacity: 0 }
      100% { opacity: 0 }
    }`;
  }, [type, id]);

  // 지속시간 + 여유 50ms 후 자기 자신 정리
  //   onComplete 가 부모에서 인라인 arrow 로 전달되면 매 렌더마다 새 함수.
  //   이를 deps 에 넣으면 타이머가 무한 리셋 → 절대 끝나지 않음.
  //   ref 로 최신 참조를 유지하고 deps 는 duration 만 사용.
  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  });

  useEffect(() => {
    const timer = setTimeout(() => onCompleteRef.current(), duration + 50);
    return () => clearTimeout(timer);
  }, [duration]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const usesCanvasSnapshot = typeof snapshot !== 'string';

  const drawCanvasSnapshot = useCallback((canvas: HTMLCanvasElement | null) => {
    canvasRef.current = canvas;
    if (!canvas || typeof snapshot === 'string') return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.width = snapshot.width;
    canvas.height = snapshot.height;
    ctx.drawImage(snapshot, 0, 0);
  }, [snapshot]);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: keyframeCSS }} />

      {/* dip-to-black 시 뒤에 검정 배경 (애니메이션 중반에 노출) */}
      {type === 'dip-to-black' && (
        <div
          className="absolute inset-0 bg-black pointer-events-none"
          style={{ zIndex: 90 }}
          aria-hidden
        />
      )}

      {/* 이전 화면 스냅샷 overlay — 애니메이션 종료 후 사라짐 */}
      {usesCanvasSnapshot ? (
        <canvas
          ref={drawCanvasSnapshot}
          className="absolute inset-0 pointer-events-none bg-black"
          style={{
            zIndex: 91,
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            display: 'block',
            animation: `${id} ${duration}ms cubic-bezier(0.4, 0, 0.2, 1) forwards`,
          }}
          aria-hidden
        />
      ) : (
        <div
          className="absolute inset-0 pointer-events-none bg-black"
          style={{
            zIndex: 91,
            backgroundImage: `url(${snapshot})`,
            backgroundSize: 'contain',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
            animation: `${id} ${duration}ms cubic-bezier(0.4, 0, 0.2, 1) forwards`,
          }}
          aria-hidden
        />
      )}
    </>
  );
}
