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
import { sendLocalVideoCommand } from '@/lib/localVideoCommand'; // [FEATURE: LOCAL_VIDEO_CONTROL]

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
  // 폴링(setInterval)이 드래그 중인 값을 덮어쓰지 않도록 ref 로도 들고 있는다
  const isSeekingRef = useRef(false);
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
      // [FIX: YT_CONTROL] 명령 전에 listening 을 한 번 더 — 플레이어가 아직
      // 핸드셰이크 전이면 이후 명령이 조용히 무시된다.
      iframe.contentWindow.postMessage(
        JSON.stringify({ event: 'listening', id: 0 }),
        'https://www.youtube.com'
      );
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

  /**
   * [FEATURE: LOCAL_VIDEO_LOADBAR] 로컬 영상이 **재생 가능한 상태인가**.
   *
   * 처음에는 "받은 바이트 / 전체" 비율을 보여줬는데 잘못된 지표였다. 브라우저는
   * 영상이 재생 중이 아니면 앞부분만 미리 받고 멈춘다(146MB 파일에서 15% 정도).
   * preload="auto" 를 줘도 같다. 그래서 100% 가 될 일이 거의 없고, 정상인데도
   * "15% 에서 멈춤" 처럼 보였다.
   *
   * 그래서 readyState 로 바꾼다 — 운영자가 알아야 할 것은 "몇 % 받았나" 가 아니라
   * **지금 송출해도 되는가** 이기 때문이다.
   *   0~1 메타데이터도 아직   2 첫 프레임만   3 이상 재생 가능
   */
  const [ready, setReady] = useState(0);
  const [bufferedSec, setBufferedSec] = useState(0);
  const localElId = !isYouTube ? (video?.id ?? '') : '';
  useEffect(() => {
    if (!localElId) return;
    const read = () => {
      const el = document.querySelector(
        `video[data-video-element-id="${CSS.escape(localElId)}"]`,
      ) as HTMLVideoElement | null;
      if (!el) return;
      setReady(el.readyState);
      setBufferedSec(el.buffered.length > 0 ? el.buffered.end(el.buffered.length - 1) : 0);
      // [FEATURE: LOCAL_VIDEO_TIMELINE] 로컬 영상은 시간을 알려주는 곳이 없다.
      //   (유튜브는 iframe 이 infoDelivery 로 보내주지만 <video> 는 직접 읽어야 한다)
      //   여기서 읽어야 타임라인·재생시간이 살아나고, 반복 재생도 눈으로 확인된다.
      if (el.duration && isFinite(el.duration)) setDuration(el.duration);
      if (!isSeekingRef.current) setCurrentTime(el.currentTime);
      setIsPlaying(!el.paused && !el.ended);
    };
    const first = requestAnimationFrame(read);
    const timer = setInterval(read, 250);
    return () => { cancelAnimationFrame(first); clearInterval(timer); };
  }, [localElId]);

  // ── 시크바 클릭/드래그 ──
  /** 이동한 위치(초)를 돌려준다 — 드래그를 놓을 때 요소에 기록하기 위해 */
  const handleSeek = useCallback((clientX: number): number | undefined => {
    if (!seekBarRef.current || duration <= 0) return undefined;
    const rect = seekBarRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const seekTime = ratio * duration;
    setCurrentTime(seekTime);
    // [FIX: YT_START_POS] 모듈 저장소에도 즉시 기록한다.
    //   송출(Enter)은 autoPlayVideos 가 getPlaybackState 로 읽은 위치에서 시작하는데,
    //   일시정지 상태에서는 유튜브가 infoDelivery 를 잘 보내지 않아 저장소가 0으로 남는다.
    //   그러면 원하는 지점에 맞춰놔도 출력이 0:00 부터 재생된다.
    if (ytId) setPlaybackState(ytId, { currentTime: seekTime });
    if (ytId) {
      postCommand('seekTo', [seekTime, true]);
      return seekTime;
    }
    // [FEATURE: LOCAL_VIDEO_TIMELINE] 로컬 영상 — 에디터 미리보기와 송출 창을 함께 이동.
    //   postCommand 는 youtubeId 가 없으면 아무것도 안 하므로 여기서 따로 보낸다.
    // sendLocalVideoCommand 가 에디터 미리보기와 송출 창 양쪽을 함께 옮긴다.
    if (video?.id) sendLocalVideoCommand(video.id, 'seekTo', [seekTime]);
    return seekTime;
  }, [duration, postCommand, ytId, video?.id]);

  const handleSeekMouseDown = useCallback((e: React.MouseEvent) => {
    isSeekingRef.current = true;
    setIsSeeking(true);
    handleSeek(e.clientX);

    const handleMouseMove = (ev: MouseEvent) => handleSeek(ev.clientX);
    const handleMouseUp = (ev: MouseEvent) => {
      const seekTime = handleSeek(ev.clientX);
      isSeekingRef.current = false;
      setIsSeeking(false);
      // [FIX: SEEK_START_POS] 로컬 영상은 시크바로 옮긴 위치도 요소에 남겨야 한다.
      //   ⏸ 를 누를 때만 기록하면, 드래그로 맞춰 놓고 바로 Enter 를 쳤을 때
      //   송출이 예전 위치에서 시작한다. (유튜브는 저장소에 매번 기록되고 있다)
      //   드래그 중이 아니라 놓는 순간에만 기록 — undo 스택이 더러워지지 않는다.
      if (!isYouTube && seekTime !== undefined) update({ startTime: seekTime });
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [handleSeek, isYouTube, update]);

  // ★ early return 은 훅 선언 이후
  if (!video) return null;

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="flex flex-col bg-[#111] border-b border-[#222]">
      {/* ── 시크바 영역 ── */}
      <div className="px-4 pt-3 pb-2">
        {/* 시크바 — 클릭 영역을 넉넉히 (h-5), 트랙/핸들은 항상 보이게 */}
        <div
          ref={seekBarRef}
          className="group relative flex h-5 cursor-pointer items-center"
          onMouseDown={handleSeekMouseDown}
        >
          {/* 트랙 배경 */}
          <div className="absolute inset-x-0 h-2 rounded-full bg-[#2e2e2e]" />
          {/* 재생 진행 */}
          <div
            className="absolute left-0 h-2 rounded-full bg-blue-500"
            style={{ width: `${progress}%` }}
          />
          {/* 시크 핸들 — 항상 표시 (호버 시 확대) */}
          <div
            className="absolute h-4 w-4 -translate-x-1/2 rounded-full border-2 border-[#0d0d0d]
                       bg-blue-400 shadow-md transition-transform group-hover:scale-125"
            style={{ left: `${progress}%` }}
          />
        </div>
        {/* 시간 표시 — 현재 시간은 크게/밝게, 전체 길이는 옆에 */}
        <div className="mt-1.5 flex items-baseline justify-between">
          <div className="flex items-baseline gap-1.5 font-mono tabular-nums">
            <span className="text-[17px] font-semibold leading-none text-white">
              {formatTime(currentTime)}
            </span>
            <span className="text-[13px] leading-none text-gray-500">
              / {formatTime(duration)}
            </span>
          </div>
          <span className="font-mono text-[13px] tabular-nums leading-none text-gray-400">
            −{formatTime(Math.max(0, duration - currentTime))}
          </span>
        </div>
      </div>

      {/* ── 컨트롤 버튼 영역 ── */}
      <div className="flex items-center gap-3 px-4 pb-3">
        {/* 썸네일 */}
        {isYouTube && video.youtubeId && (
          <img
            src={getThumbnailUrl(video.youtubeId, 'default')}
            alt=""
            className="h-9 w-16 flex-shrink-0 rounded object-cover"
          />
        )}

        {/* 영상 정보 */}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] font-medium text-gray-300">
            {isYouTube ? `YouTube: ${video.youtubeId}` : '로컬 영상 파일'}
          </p>
          {/* [FEATURE: LOCAL_VIDEO_LOADBAR] 송출해도 되는지 한눈에.
              "몇 % 받았나" 가 아니라 재생 준비 상태를 보여준다. */}
          {!isYouTube && (
            <div className="mt-0.5 flex items-center gap-1.5">
              <span
                className={`inline-block h-1.5 w-1.5 rounded-full ${
                  ready >= 3 ? 'bg-emerald-500' : ready >= 1 ? 'bg-amber-500' : 'bg-gray-600'
                }`}
              />
              <span
                className={`text-[9px] ${
                  ready >= 3 ? 'text-emerald-400' : ready >= 1 ? 'text-amber-400' : 'text-gray-500'
                }`}
              >
                {ready >= 3
                  ? `송출 준비됨 · ${Math.floor(bufferedSec)}초 버퍼`
                  : ready >= 1
                    ? '불러오는 중…'
                    : '대기 중'}
              </span>
            </div>
          )}
          <p className="font-mono text-[10px] text-gray-600">
            {Math.round(video.width)}% × {Math.round(video.height)}%
          </p>
        </div>

        {/* 재생 컨트롤 */}
        <div className="flex items-center gap-1.5">
          {isYouTube ? (
            <>
              {/* ▶ 재생 */}
              <button
                onClick={() => {
                  // [FEATURE: PAUSED_BROADCAST] 다시 재생하면 "멈춰 둠" 을 해제한다.
                  if (ytId) setPlaybackState(ytId, { pausedByOperator: false });
                  postCommand('playVideo');
                }}
                title="재생"
                className={`flex h-9 w-9 items-center justify-center rounded-md border
                           transition-colors ${
                             isPlaying
                               ? 'border-green-500/60 bg-green-600/25 text-green-300'
                               : 'border-[#203a20] bg-[#1a1a1a] text-green-400 hover:bg-green-600/25 hover:text-green-300'
                           }`}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="5,3 19,12 5,21" />
                </svg>
              </button>

              {/* ❚❚ 일시정지 */}
              <button
                onClick={() => {
                  // [FEATURE: PAUSED_BROADCAST] 멈춘 상태를 기억해서, 이 섹션을 송출해도
                  //   자동재생하지 않고 이 화면 그대로 나가게 한다.
                  if (ytId) setPlaybackState(ytId, { pausedByOperator: true });
                  postCommand('pauseVideo');
                }}
                title="일시정지 (멈춘 화면 그대로 송출)"
                className={`flex h-9 w-9 items-center justify-center rounded-md border
                           transition-colors ${
                             !isPlaying && currentTime > 0
                               ? 'border-yellow-500/60 bg-yellow-600/25 text-yellow-300'
                               : 'border-[#3a3520] bg-[#1a1a1a] text-yellow-400 hover:bg-yellow-600/25 hover:text-yellow-300'
                           }`}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="4" width="4" height="16" />
                  <rect x="14" y="4" width="4" height="16" />
                </svg>
              </button>

              {/* ■ 정지 (처음으로) */}
              <button
                onClick={() => {
                  // [FIX: YT_CONTROL] stopVideo 는 플레이어를 언로드해 버려서
                  // 이후 play/pause/mute 가 전부 먹지 않는다. 일시정지 + 0초로
                  // 되감기로 같은 결과를 내면서 플레이어는 살려 둔다.
                  postCommand('pauseVideo');
                  postCommand('seekTo', [0, true]);
                  setCurrentTime(0);
                  setIsPlaying(false);
                  if (ytId) setPlaybackState(ytId, { currentTime: 0, isPlaying: false, pausedByOperator: true });
                }}
                title="정지 (처음으로 · 송출해도 재생 안 함)"
                className="flex h-9 w-9 items-center justify-center rounded-md border
                           border-[#3a2020] bg-[#1a1a1a] text-red-400 transition-colors
                           hover:bg-red-600/25 hover:text-red-300"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="5" y="5" width="14" height="14" />
                </svg>
              </button>

              {/* -10초 */}
              <button
                onClick={() => {
                  const t = Math.max(0, currentTime - 10);
                  postCommand('seekTo', [t, true]);
                  setCurrentTime(t);
                  // [FIX: YT_START_POS] 송출 시작 위치로 쓰이므로 저장소에도 기록
                  if (ytId) setPlaybackState(ytId, { currentTime: t });
                }}
                title="-10초"
                className="flex h-9 w-9 items-center justify-center rounded-md border
                           border-[#2c2c2c] bg-[#1a1a1a] font-mono text-[12px] font-bold
                           text-gray-300 transition-colors hover:bg-[#292929] hover:text-white"
              >
                −10
              </button>

              {/* +10초 */}
              <button
                onClick={() => {
                  const t = Math.min(duration, currentTime + 10);
                  postCommand('seekTo', [t, true]);
                  setCurrentTime(t);
                  // [FIX: YT_START_POS] 송출 시작 위치로 쓰이므로 저장소에도 기록
                  if (ytId) setPlaybackState(ytId, { currentTime: t });
                }}
                title="+10초"
                className="flex h-9 w-9 items-center justify-center rounded-md border
                           border-[#2c2c2c] bg-[#1a1a1a] font-mono text-[12px] font-bold
                           text-gray-300 transition-colors hover:bg-[#292929] hover:text-white"
              >
                +10
              </button>

              <div className="mx-1.5 h-7 w-px bg-[#333]" />
            </>
          ) : (
            <>
              {/* [FEATURE: LOCAL_VIDEO_CONTROL] 로컬 영상 — 송출 창 원격 제어 */}
              <button
                onClick={() => {
                  // [FEATURE: PAUSED_BROADCAST] 로컬 영상은 autoplay 속성으로 송출 창에서
                  //   시작한다. 재생을 누르면 다음 송출부터도 자동 재생되도록 켠다.
                  update({ autoplay: true, startTime: currentTime });
                  sendLocalVideoCommand(video.id, 'play');
                }}
                title="재생 (송출 창)"
                className="flex h-9 w-9 items-center justify-center rounded-md border
                           border-[#203a20] bg-[#1a1a1a] text-green-400 transition-colors
                           hover:bg-green-600/25 hover:text-green-300"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="5,3 19,12 5,21" />
                </svg>
              </button>

              <button
                onClick={() => {
                  // [FEATURE: PAUSED_BROADCAST] ⏸ 는 **시작 지점 지정**이다.
                  //   여기서 멈춘 위치를 기억해 두면 섹션 Enter 송출 시 그 지점부터
                  //   재생된다(유튜브와 같은 감각). autoplay 는 끄지 않는다 —
                  //   끄면 송출해도 정지 화면만 나가서 "동시 재생" 이 안 된다.
                  update({ startTime: currentTime });
                  sendLocalVideoCommand(video.id, 'pause');
                }}
                title="일시정지 (여기서부터 송출 재생)"
                className="flex h-9 w-9 items-center justify-center rounded-md border
                           border-[#3a3520] bg-[#1a1a1a] text-yellow-400 transition-colors
                           hover:bg-yellow-600/25 hover:text-yellow-300"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="4" width="4" height="16" />
                  <rect x="14" y="4" width="4" height="16" />
                </svg>
              </button>

              <button
                onClick={() => {
                  // [FIX: STOP_MEANS_STOP] ■ 는 "멈춰"다. 처음으로 되돌리되 정지
                  //   상태를 요소에 남겨서, 송출(Enter)해도 0초 정지 화면만 나가고
                  //   재생은 시작하지 않는다. (⏸ 는 반대로 "여기서부터" 라는 뜻이라
                  //   autoplay 를 건드리지 않는다 — 두 버튼의 의미가 다르다.)
                  update({ autoplay: false, startTime: 0 });
                  sendLocalVideoCommand(video.id, 'stop');
                }}
                title="정지 (처음으로 · 송출해도 재생 안 함)"
                className="flex h-9 w-9 items-center justify-center rounded-md border
                           border-[#3a2020] bg-[#1a1a1a] text-red-400 transition-colors
                           hover:bg-red-600/25 hover:text-red-300"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="5" y="5" width="14" height="14" />
                </svg>
              </button>

              <div className="mx-1.5 h-7 w-px bg-[#333]" />
            </>
          )}

          {/* 음소거 토글 — 유튜브와 로컬 영상 모두 송출 창에 전달 */}
          <button
            onClick={() => {
              const next = !video.muted;
              update({ muted: next });
              if (isYouTube) {
                postCommand(next ? 'mute' : 'unMute');
              } else {
                // [FEATURE: LOCAL_VIDEO_CONTROL]
                sendLocalVideoCommand(video.id, next ? 'mute' : 'unMute');
              }
            }}
            title={video.muted ? '음소거 해제' : '음소거'}
            className={`flex h-9 w-9 items-center justify-center rounded-md border
                       transition-colors ${
                         video.muted
                           ? 'border-red-500/60 bg-red-600/25 text-red-300'
                           : 'border-[#20303a] bg-[#1a1a1a] text-blue-400 hover:bg-blue-600/25 hover:text-blue-300'
                       }`}
          >
            {video.muted ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19" fill="currentColor" />
                <line x1="23" y1="9" x2="17" y2="15" />
                <line x1="17" y1="9" x2="23" y2="15" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19" fill="currentColor" />
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
              </svg>
            )}
          </button>

          {/* 루프 토글 */}
          <button
            onClick={() => {
              const next = !video.loop;
              update({ loop: next });
              // [FIX: LOOP_SYNC] 로컬 영상은 송출 창에도 즉시 알려야 한다.
              //   요소만 바꾸면 다음 송출 전까지 송출 창이 계속 반복 재생한다.
              if (!isYouTube) sendLocalVideoCommand(video.id, 'setLoop', [next ? 1 : 0]);
            }}
            title={video.loop ? '루프 해제' : '루프'}
            className={`flex h-9 w-9 items-center justify-center rounded-md border
                       transition-colors ${
                         video.loop
                           ? 'border-blue-500/60 bg-blue-600/25 text-blue-300'
                           : 'border-[#2c2c2c] bg-[#1a1a1a] text-gray-500 hover:bg-[#292929] hover:text-gray-300'
                       }`}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
