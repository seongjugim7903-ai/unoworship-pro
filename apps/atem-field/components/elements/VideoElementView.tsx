'use client';

/**
 * VideoElementView.tsx
 * 에디터 캔버스 위에 표시되는 영상 요소 (유튜브 iframe 또는 썸네일)
 *
 * - 유튜브: iframe 임베드로 실제 재생 가능
 * - 선택 시: iframe 위에 투명 오버레이 (드래그 가능하도록)
 * - BoundingBox 와 연동 (드래그, 리사이즈, 회전)
 *
 * [FEATURE: YT_STANDBY]
 *   isStandby=true 면 "송출 스탠바이" 시각 표시 + 클릭 시 커밋.
 *   iframe 위에 가려지는 투명 클릭 오버레이(zIndex 상위) 와 노란 글로우 보더,
 *   우상단 "STANDBY" 뱃지를 렌더합니다. 오버레이를 클릭하면
 *   commitYouTubeStandby() 가 호출되어 즉시 송출 + 재생됩니다.
 */

import React, { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import { VideoElement } from '@/lib/canvasTypes';
import { HandleId } from '@/hooks/useCanvasEditor';
import { getEmbedUrl } from '@/lib/youtube';
import { commitYouTubeStandby } from '@/lib/youtubeStandby'; // [FEATURE: YT_STANDBY]
import { useStore } from '@/lib/store';

const CTRL_BTN: React.CSSProperties = {
  width: 24, height: 22,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontSize: 12, lineHeight: 1, color: '#fff',
  background: 'transparent', border: 'none', borderRadius: 4, cursor: 'pointer',
};

interface VideoElementViewProps {
  element: VideoElement;
  isSelected: boolean;
  /** [FEATURE: YT_STANDBY] 송출 스탠바이 상태 (노란 글로우 + 클릭 커밋 오버레이) */
  isStandby?: boolean;
  onPointerDown: (handleId: HandleId) => (e: React.PointerEvent<HTMLDivElement>) => void;
}

export default function VideoElementView({
  element,
  isSelected,
  isStandby = false,
  onPointerDown,
}: VideoElementViewProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  // ── 로컬 영상 제어 (재생/포즈/스탑/삭제) ──
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const { currentSetlistId, activeItemId, activeSectionId, removeElement } = useStore();
  const handleLocalPlay = useCallback(() => {
    localVideoRef.current?.play().catch(() => {});
  }, []);
  const handleLocalPause = useCallback(() => {
    localVideoRef.current?.pause();
  }, []);
  const handleLocalStop = useCallback(() => {
    const v = localVideoRef.current;
    if (v) { v.pause(); v.currentTime = 0; }
  }, []);
  const handleLocalDelete = useCallback(() => {
    if (currentSetlistId && activeItemId && activeSectionId) {
      removeElement(currentSetlistId, activeItemId, activeSectionId, element.id);
    }
  }, [currentSetlistId, activeItemId, activeSectionId, removeElement, element.id]);

  // 유튜브 Player API 메시지 수신
  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      if (e.origin !== 'https://www.youtube.com') return;
      try {
        const data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
        if (data.event === 'onStateChange') {
          // 1 = playing, 2 = paused, 0 = ended
          setIsPlaying(data.info === 1);
        }
      } catch { /* ignore */ }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // iframe 에 postMessage 전송
  const postToPlayer = useCallback((func: string, args?: unknown[]) => {
    iframeRef.current?.contentWindow?.postMessage(
      JSON.stringify({ event: 'command', func, args: args ?? [] }),
      'https://www.youtube.com'
    );
  }, []);

  const isYouTube = !!element.youtubeId;

  // 현재 페이지 origin 으로 embed URL 동적 생성 (저장된 src 대신)
  // Composer 에디터는 모니터링용 프리뷰이므로 항상 음소거한다.
  // 실제 YouTube 오디오는 /output 송출창에서만 나가도록 유지한다.
  const embedSrc = useMemo(() => {
    if (element.youtubeId) return getEmbedUrl(element.youtubeId, { muted: true });
    return element.src;
  }, [element.youtubeId, element.src]);

  return (
    <div
      style={{
        // EditorCanvas의 positioned wrapper가 위치/크기/zIndex를 잡아주므로
        // 여기서는 wrapper 안을 꽉 채움 (wrapper 없이 단독 사용 시에는 absolute 사용)
        position: 'relative',
        width: '100%',
        height: '100%',
        transform: element.rotation ? `rotate(${element.rotation}deg)` : undefined,
        transformOrigin: 'center center',
        opacity: element.opacity,
        display: element.visible ? 'block' : 'none',
        cursor: isSelected ? 'move' : 'pointer',
        pointerEvents: 'all',
        overflow: 'hidden',
        background: '#000',
      }}
      onPointerDown={onPointerDown('move')}
    >
      {isYouTube ? (
        <>
          {/* 유튜브 iframe */}
          <iframe
            ref={iframeRef}
            src={embedSrc}
            width="100%"
            height="100%"
            style={{
              border: 'none',
              display: 'block',
              // 선택 시 드래그 가능. 스탠바이 시엔 오버레이가 위에서 가로채므로 auto 유지.
              pointerEvents: isSelected ? 'none' : 'auto',
            }}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />

          {/* 선택 시 투명 오버레이 — iframe 위에서 드래그 가능하게 */}
          {isSelected && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: 'rgba(59, 130, 246, 0.06)',
                border: '1px solid rgba(59, 130, 246, 0.3)',
                pointerEvents: 'none',
              }}
            />
          )}

          {/* [FEATURE: YT_STANDBY] 송출 스탠바이 오버레이 — 클릭 시 커밋 */}
          {isStandby && (
            <>
              {/* 노란 글로우 보더 — 시각적 표시 (클릭 통과) */}
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  border: '3px solid #facc15',
                  boxShadow:
                    '0 0 0 1px rgba(250, 204, 21, 0.4), 0 0 24px rgba(250, 204, 21, 0.5) inset',
                  pointerEvents: 'none',
                  animation: 'yt-standby-pulse 1.6s ease-in-out infinite',
                }}
              />
              {/* 펄스 애니메이션 정의 — 컴포넌트 내부 <style> 로 격리 */}
              <style>{`
                @keyframes yt-standby-pulse {
                  0%, 100% { box-shadow: 0 0 0 1px rgba(250, 204, 21, 0.4), 0 0 16px rgba(250, 204, 21, 0.35) inset; }
                  50%      { box-shadow: 0 0 0 2px rgba(250, 204, 21, 0.7), 0 0 32px rgba(250, 204, 21, 0.6) inset; }
                }
              `}</style>

              {/* 상단 중앙 "STANDBY" 뱃지 */}
              <div
                style={{
                  position: 'absolute',
                  top: 8,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  padding: '3px 10px',
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: '0.12em',
                  color: '#1a1a1a',
                  background: '#facc15',
                  borderRadius: 3,
                  pointerEvents: 'none',
                  fontFamily: 'system-ui, sans-serif',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
                }}
              >
                SEND STANDBY
              </div>

              {/* 중앙 "클릭하여 송출" 힌트 + 재생 아이콘 */}
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  color: '#fff',
                  pointerEvents: 'none',
                  textShadow: '0 2px 6px rgba(0,0,0,0.8)',
                  fontFamily: 'system-ui, sans-serif',
                }}
              >
                <div
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: '50%',
                    background: 'rgba(250, 204, 21, 0.9)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
                  }}
                >
                  {/* 재생 삼각형 */}
                  <div
                    style={{
                      width: 0,
                      height: 0,
                      marginLeft: 4,
                      borderTop: '12px solid transparent',
                      borderBottom: '12px solid transparent',
                      borderLeft: '18px solid #1a1a1a',
                    }}
                  />
                </div>
                <div style={{ fontSize: 12, fontWeight: 600 }}>
                  클릭 또는 Enter 로 송출
                </div>
              </div>

              {/* 클릭 가로채기 레이어 — iframe 과 다른 오버레이보다 위 */}
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  commitYouTubeStandby();
                }}
                onPointerDown={(e) => {
                  // 드래그/선택 이벤트 전파 차단 — 클릭만 허용
                  e.stopPropagation();
                }}
                style={{
                  position: 'absolute',
                  inset: 0,
                  cursor: 'pointer',
                  background: 'transparent',
                  zIndex: 5,
                }}
                title="클릭하여 송출 및 재생"
              />
            </>
          )}
        </>
      ) : (
        <>
          <video
            ref={localVideoRef}
            src={embedSrc}
            width="100%"
            height="100%"
            autoPlay={false} /* 에디터는 업로드 즉시 재생 안 함 — 아래 컨트롤/송출(출력)에서만 재생 */
            muted
            loop={element.loop}
            playsInline
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              display: 'block',
              pointerEvents: isSelected ? 'none' : 'auto',
            }}
          />

          {/* 재생 · 포즈 · 스탑 · 삭제 컨트롤 (선택 여부와 무관하게 항상 조작 가능) */}
          <div
            onPointerDown={(e) => e.stopPropagation()}
            style={{
              position: 'absolute',
              bottom: 6,
              left: '50%',
              transform: 'translateX(-50%)',
              display: 'flex',
              gap: 4,
              padding: '3px 5px',
              borderRadius: 6,
              background: 'rgba(0,0,0,0.6)',
              pointerEvents: 'auto',
              zIndex: 6,
            }}
          >
            <button title="재생" style={CTRL_BTN}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); handleLocalPlay(); }}>▶</button>
            <button title="일시정지" style={CTRL_BTN}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); handleLocalPause(); }}>⏸</button>
            <button title="정지(처음으로)" style={CTRL_BTN}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); handleLocalStop(); }}>⏹</button>
            <button title="삭제" style={{ ...CTRL_BTN, color: '#fca5a5' }}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); handleLocalDelete(); }}>🗑</button>
          </div>

          {isSelected && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: 'rgba(59, 130, 246, 0.06)',
                border: '1px solid rgba(59, 130, 246, 0.3)',
                pointerEvents: 'none',
              }}
            />
          )}
        </>
      )}
    </div>
  );
}

/** 외부에서 iframe 제어를 위한 유틸 */
export function postYouTubeCommand(iframe: HTMLIFrameElement | null, func: string, args?: unknown[]) {
  iframe?.contentWindow?.postMessage(
    JSON.stringify({ event: 'command', func, args: args ?? [] }),
    'https://www.youtube.com'
  );
}
