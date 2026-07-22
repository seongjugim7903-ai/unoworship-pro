'use client';

/**
 * components/video/VideoControlBar.tsx
 * 선택된 영상 요소의 재생 컨트롤 바 + 시크바
 *
 * ★ React Hooks 규칙: 모든 훅은 early return 전에 선언
 */

import { useCallback, useState, useEffect, useRef } from 'react';
import { useStore } from '@/lib/store';
import { VideoElement } from '@/lib/canvasTypes';
import { undoManager } from '@/lib/undoManager';
import { getThumbnailUrl } from '@/lib/youtube';
import { getSocket } from '@/lib/socketClient';
import { SOCKET_EVENTS, SocketMessage } from '@/lib/socketEvents';
import { setPlaybackState } from '@/lib/videoPlaybackStore';

/** 초 → mm:ss 변환 */
function formatTime(sec: number): string {
  if (!sec || !isFinite(sec)) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function VideoControlBar() {
  const {
    setlists,
    currentSetlistId,
    activeItemId,
    activeSectionId,
    selectedElementId,
    updateElement,
  } = useStore();

  // 현재 선택된 요소 탐색
  const currentSetlist = setlists.find((s) => s.id === currentSetlistId);
  const currentItem = currentSetlist?.items.find((i) => i.id === activeItemId);
  const currentSection = currentItem?.sections.find((s) => s.id === activeSectionId);
  const selectedEl = currentSection?.elements?.find((e) => e.id === selectedElementId);

  const video = (selectedEl?.type === 'video' ? selectedEl : null) as VideoElement | null;
  const isYouTube = !!video?.youtubeId;

  // ── 시간 상태 ──
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isSeeking, setIsSeeking] = useState(false);
  const seekBarRef = useRef<HTMLDivElement>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const allElements = currentSection?.elements ?? [];

  // ★ 모든 훅은 여기 (early return 전)에 선언
  const update = useCallback(
    (updates: Partial<VideoElement>) => {
      if (!video || !currentSetlistId || !activeItemId || !activeSectionId) return;
      undoManager.pushState(allElements);
      updateElement(currentSetlistId, activeItemId, activeSectionId, video.id, updates);
    },
    [video, currentSetlistId, activeItemId, activeSectionId, allElements, updateElement]
  );

  const postCommand = useCallback((func: string, args?: unknown[]) => {
    if (!video?.youtubeId) return;

    // ① 로컬 에디터 iframe 제어
    //    에디터는 모니터링 화면이므로 unMute 는 로컬에 적용하지 않는다.
    //    실제 출력 오디오는 아래 Socket.io 명령으로 /output 에만 전달된다.
    const iframe = document.querySelector(
      `iframe[src*="${video.youtubeId}"]`
    ) as HTMLIFrameElement | null;
    if (iframe?.contentWindow && func !== 'unMute') {
      iframe.contentWindow.postMessage(
        JSON.stringify({ event: 'command', func, args: args ?? [] }),
        'https://www.youtube.com'
      );
    }

    // ② 출력 PC에 VIDEO_COMMAND 전송 (Socket.io)
    const socket = getSocket();
    if (socket) {
      const msg: SocketMessage = {
        type: 'VIDEO_COMMAND',
        payload: { youtubeId: video.youtubeId, command: func, args: args ?? [] },
      };
      socket.emit(SOCKET_EVENTS.BROADCAST, msg);
    }
  }, [video?.youtubeId]);

  // ── YouTube iframe 메시지 수신 (시간 정보 + 상태) ──
  const ytId = video?.youtubeId ?? null;
  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      if (e.origin !== 'https://www.youtube.com') return;
      try {
        const data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;

        // YouTube Player API 상태 변경
        if (data.event === 'onStateChange') {
          // -1=unstarted, 0=ended, 1=playing, 2=paused, 3=buffering, 5=cued
          const playing = data.info === 1;
          setIsPlaying(playing);
          if (ytId) setPlaybackState(ytId, { isPlaying: playing });
        }

        // YouTube info delivery (currentTime, duration 등)
        if (data.event === 'infoDelivery' && data.info) {
          if (typeof data.info.currentTime === 'number' && !isSeeking) {
            setCurrentTime(data.info.currentTime);
            if (ytId) setPlaybackState(ytId, { currentTime: data.info.currentTime });
          }
          if (typeof data.info.duration === 'number' && data.info.duration > 0) {
            setDuration(data.info.duration);
            if (ytId) setPlaybackState(ytId, { duration: data.info.duration });
          }
          // videoData 에서 duration
          if (data.info.videoData?.duration && data.info.videoData.duration > 0) {
            setDuration(data.info.videoData.duration);
            if (ytId) setPlaybackState(ytId, { duration: data.info.videoData.duration });
          }
        }
      } catch { /* ignore */ }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [isSeeking, ytId]);

  // ── YouTube iframe 에 listening 활성화 (시간 정보 수신용) ──
  useEffect(() => {
    if (!video?.youtubeId) return;

    // YouTube iframe에 "listening" 이벤트를 보내야 infoDelivery를 받을 수 있음
    const enableListening = () => {
      const iframe = document.querySelector(
        `iframe[src*="${video.youtubeId}"]`
      ) as HTMLIFrameElement | null;
      if (iframe?.contentWindow) {
        iframe.contentWindow.postMessage(
          JSON.stringify({ event: 'listening', id: 0 }),
          'https://www.youtube.com'
        );
      }
    };

    // 초기 + 주기적으로 listening 요청 (iframe 로드 타이밍 대응)
    enableListening();
    pollingRef.current = setInterval(enableListening, 1000);

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [video?.youtubeId]);

  // ── 시크바 클릭/드래그 ──
  const handleSeek = useCallback((clientX: number) => {
    if (!seekBarRef.current || duration <= 0) return;
    const rect = seekBarRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const seekTime = ratio * duration;
    setCurrentTime(seekTime);
    postCommand('seekTo', [seekTime, true]);
  }, [duration, postCommand]);

  const handleSeekMouseDown = useCallback((e: React.MouseEvent) => {
    setIsSeeking(true);
    handleSeek(e.clientX);

    const handleMouseMove = (ev: MouseEvent) => handleSeek(ev.clientX);
    const handleMouseUp = (ev: MouseEvent) => {
      handleSeek(ev.clientX);
      setIsSeeking(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [handleSeek]);

  // ★ early return 은 훅 선언 이후
  if (!video) return null;

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="flex flex-col bg-[#111] border-b border-[#222]">
      {/* ── 시크바 영역 ── */}
      <div className="px-3 pt-2 pb-1">
        {/* 시크바 */}
        <div
          ref={seekBarRef}
          className="group relative h-3 flex items-center cursor-pointer"
          onMouseDown={handleSeekMouseDown}
        >
          {/* 트랙 배경 */}
          <div className="absolute inset-x-0 h-1 group-hover:h-1.5 bg-[#333] rounded-full transition-all" />
          {/* 버퍼/재생 진행 */}
          <div
            className="absolute left-0 h-1 group-hover:h-1.5 bg-blue-500 rounded-full transition-all"
            style={{ width: `${progress}%` }}
          />
          {/* 시크 핸들 */}
          <div
            className="absolute w-3 h-3 bg-blue-400 rounded-full shadow-md opacity-0 group-hover:opacity-100 transition-opacity -translate-x-1/2"
            style={{ left: `${progress}%` }}
          />
        </div>
        {/* 시간 표시 */}
        <div className="flex justify-between mt-0.5">
          <span className="text-[9px] text-gray-500 font-mono">{formatTime(currentTime)}</span>
          <span className="text-[9px] text-gray-500 font-mono">{formatTime(duration)}</span>
        </div>
      </div>

      {/* ── 컨트롤 버튼 영역 ── */}
      <div className="flex items-center gap-3 px-4 pb-2">
        {/* 썸네일 */}
        {isYouTube && video.youtubeId && (
          <img
            src={getThumbnailUrl(video.youtubeId, 'default')}
            alt=""
            className="w-12 h-7 rounded object-cover flex-shrink-0"
          />
        )}

        {/* 영상 정보 */}
        <div className="flex-1 min-w-0">
          <p className="text-[10px] text-gray-300 truncate font-medium">
            {isYouTube ? `YouTube: ${video.youtubeId}` : '로컬 영상 파일'}
          </p>
          <p className="text-[9px] text-gray-600 font-mono">
            {Math.round(video.width)}% × {Math.round(video.height)}%
          </p>
        </div>

        {/* 재생 컨트롤 */}
        <div className="flex items-center gap-1">
          {isYouTube ? (
            <>
              {/* ▶ 재생 */}
              <button
                onClick={() => postCommand('playVideo')}
                title="재생"
                className={`w-7 h-7 rounded flex items-center justify-center
                           bg-[#1a1a1a] transition-colors ${
                             isPlaying
                               ? 'text-green-500 bg-green-600/15'
                               : 'text-green-400 hover:bg-green-600/20'
                           }`}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="5,3 19,12 5,21" />
                </svg>
              </button>

              {/* ❚❚ 일시정지 */}
              <button
                onClick={() => postCommand('pauseVideo')}
                title="일시정지"
                className={`w-7 h-7 rounded flex items-center justify-center
                           bg-[#1a1a1a] transition-colors ${
                             !isPlaying && currentTime > 0
                               ? 'text-yellow-500 bg-yellow-600/15'
                               : 'text-yellow-400 hover:bg-yellow-600/20'
                           }`}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="4" width="4" height="16" />
                  <rect x="14" y="4" width="4" height="16" />
                </svg>
              </button>

              {/* ■ 정지 (처음으로) */}
              <button
                onClick={() => {
                  postCommand('stopVideo');
                  setCurrentTime(0);
                  setIsPlaying(false);
                  if (ytId) setPlaybackState(ytId, { currentTime: 0, isPlaying: false });
                }}
                title="정지 (처음으로)"
                className="w-7 h-7 rounded flex items-center justify-center
                           bg-[#1a1a1a] hover:bg-red-600/20 text-red-400 transition-colors"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="5" y="5" width="14" height="14" />
                </svg>
              </button>

              {/* -10초 */}
              <button
                onClick={() => {
                  const t = Math.max(0, currentTime - 10);
                  postCommand('seekTo', [t, true]);
                  setCurrentTime(t);
                }}
                title="-10초"
                className="w-7 h-7 rounded flex items-center justify-center
                           bg-[#1a1a1a] hover:bg-[#252525] text-gray-400 transition-colors text-[9px] font-bold"
              >
                -10
              </button>

              {/* +10초 */}
              <button
                onClick={() => {
                  const t = Math.min(duration, currentTime + 10);
                  postCommand('seekTo', [t, true]);
                  setCurrentTime(t);
                }}
                title="+10초"
                className="w-7 h-7 rounded flex items-center justify-center
                           bg-[#1a1a1a] hover:bg-[#252525] text-gray-400 transition-colors text-[9px] font-bold"
              >
                +10
              </button>

              <div className="w-px h-5 bg-[#333] mx-1" />
            </>
          ) : (
            <span className="mr-1 rounded bg-[#151515] px-2 py-1 text-[9px] text-gray-500">
              섹션 송출 시 자동 재생
            </span>
          )}

          {/* 음소거 토글 */}
          <button
            onClick={() => {
              update({ muted: !video.muted });
              postCommand(video.muted ? 'unMute' : 'mute');
            }}
            title={video.muted ? '음소거 해제' : '음소거'}
            className={`w-7 h-7 rounded flex items-center justify-center
                       bg-[#1a1a1a] transition-colors ${
                         video.muted
                           ? 'text-red-400 hover:bg-red-600/20'
                           : 'text-blue-400 hover:bg-blue-600/20'
                       }`}
          >
            {video.muted ? (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19" fill="currentColor" />
                <line x1="23" y1="9" x2="17" y2="15" />
                <line x1="17" y1="9" x2="23" y2="15" />
              </svg>
            ) : (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19" fill="currentColor" />
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
              </svg>
            )}
          </button>

          {/* 루프 토글 */}
          <button
            onClick={() => update({ loop: !video.loop })}
            title={video.loop ? '루프 해제' : '루프'}
            className={`w-7 h-7 rounded flex items-center justify-center
                       bg-[#1a1a1a] transition-colors ${
                         video.loop
                           ? 'text-blue-400 hover:bg-blue-600/20'
                           : 'text-gray-500 hover:bg-[#252525]'
                       }`}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="17 1 21 5 17 9" />
              <path d="M3 11V9a4 4 0 0 1 4-4h14" />
              <polyline points="7 23 3 19 7 15" />
              <path d="M21 13v2a4 4 0 0 1-4 4H3" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
