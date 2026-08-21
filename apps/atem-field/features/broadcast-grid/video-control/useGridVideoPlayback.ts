'use client';

// 송출그리드 타일 전용 영상 재생 제어 훅 — 컴포저 VideoControlBar 코어를 (video, 섹션)
//   파라미터로 복제. 선택된 섹션은 그리드 뒤 에디터가 실제 <video>/iframe DOM 을 마운트하므로
//   컴포저와 동일하게 로컬=DOM 폴링, 유튜브=iframe postMessage + infoDelivery 로 시간/상태를 읽는다.
//   제어 명령은 기존 저수준 헬퍼(sendLocalVideoCommand / 소켓 VIDEO_COMMAND)를 그대로 재사용.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { VideoElement } from '@/lib/canvasTypes';
import { useStore } from '@/lib/store';
import { undoManager } from '@/lib/undoManager';
import { getSocket } from '@/lib/socketClient';
import { SOCKET_EVENTS, type SocketMessage } from '@/lib/socketEvents';
import { setPlaybackState } from '@/lib/videoPlaybackStore';
import { sendLocalVideoCommand } from '@/lib/localVideoCommand';

export interface GridVideoPlayback {
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  /** 로컬 영상 readyState (0~1 대기, 2 첫프레임, 3+ 송출 준비) — 유튜브는 3 고정 */
  ready: number;
  play: () => void;
  pause: () => void;
  stop: () => void;
  /** 시크(초). 드래그 중이면 dragging=true 로 넘겨 폴링 덮어쓰기를 막는다. */
  seek: (sec: number, opts?: { commit?: boolean }) => void;
  seekStart: () => void;
  seekEnd: (sec: number) => void;
  /** 현재 음소거 여부(요소 상태) */
  muted: boolean;
  /** 음소거 토글 — 요소 상태(element.muted) 갱신 + 출력 창 명령. 컴포저 캔버스에도 반영됨. */
  toggleMute: () => void;
}

/** 유튜브 iframe + 송출 창에 명령 전송 (VideoControlBar.postCommand 와 동일 규약) */
function postYouTubeCommand(youtubeId: string, func: string, args?: unknown[]): void {
  if (typeof document !== 'undefined' && func !== 'unMute') {
    const iframe = document.querySelector(
      `iframe[src*="${youtubeId}"]`,
    ) as HTMLIFrameElement | null;
    if (iframe?.contentWindow) {
      iframe.contentWindow.postMessage(
        JSON.stringify({ event: 'listening', id: 0 }),
        'https://www.youtube.com',
      );
      iframe.contentWindow.postMessage(
        JSON.stringify({ event: 'command', func, args: args ?? [] }),
        'https://www.youtube.com',
      );
    }
  }
  const socket = getSocket();
  if (socket) {
    const msg: SocketMessage = {
      type: 'VIDEO_COMMAND',
      payload: { youtubeId, command: func, args: args ?? [] },
    };
    socket.emit(SOCKET_EVENTS.BROADCAST, msg);
  }
}

export function useGridVideoPlayback(
  video: VideoElement,
  ctx: { setlistId: string; itemId: string; sectionId: string; allElements: unknown[] },
): GridVideoPlayback {
  const updateElement = useStore((s) => s.updateElement);
  const isYouTube = !!video.youtubeId;
  const ytId = video.youtubeId ?? null;
  const elId = video.id;

  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [ready, setReady] = useState(isYouTube ? 3 : 0);
  const isSeekingRef = useRef(false);
  // play/pause 시 요소에 남길 시작 위치(startTime) — 최신 currentTime 을 콜백에서 읽기 위한 ref
  const currentTimeRef = useRef(0);
  useEffect(() => { currentTimeRef.current = currentTime; }, [currentTime]);
  // 로컬 영상: 요소 상태(autoplay/startTime) 갱신 — 컴포저 VideoControlBar 와 동일 규약.
  //   이걸 갱신해야 섹션 Enter 송출(autoPlayVideos)이 autoplay 값을 보고 재생/정지를 결정한다.
  const updateLocalElement = useCallback((updates: { autoplay?: boolean; startTime?: number }) => {
    undoManager.pushState(ctx.allElements as never[]);
    updateElement(ctx.setlistId, ctx.itemId, ctx.sectionId, elId, updates);
  }, [ctx.allElements, ctx.setlistId, ctx.itemId, ctx.sectionId, elId, updateElement]);

  // ── 유튜브: iframe listening 활성화 + infoDelivery 수신 ──
  useEffect(() => {
    if (!ytId) return;
    const enableListening = () => {
      const iframe = document.querySelector(
        `iframe[src*="${ytId}"]`,
      ) as HTMLIFrameElement | null;
      iframe?.contentWindow?.postMessage(
        JSON.stringify({ event: 'listening', id: 0 }),
        'https://www.youtube.com',
      );
    };
    enableListening();
    const timer = setInterval(enableListening, 1000);
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== 'https://www.youtube.com') return;
      try {
        const data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
        if (data.event === 'onStateChange') {
          const playing = data.info === 1;
          setIsPlaying(playing);
          setPlaybackState(ytId, { isPlaying: playing });
        }
        if (data.event === 'infoDelivery' && data.info) {
          if (typeof data.info.currentTime === 'number' && !isSeekingRef.current) {
            setCurrentTime(data.info.currentTime);
            setPlaybackState(ytId, { currentTime: data.info.currentTime });
          }
          const dur = data.info.duration ?? data.info.videoData?.duration;
          if (typeof dur === 'number' && dur > 0) {
            setDuration(dur);
            setPlaybackState(ytId, { duration: dur });
          }
        }
      } catch { /* ignore */ }
    };
    window.addEventListener('message', onMessage);
    return () => { clearInterval(timer); window.removeEventListener('message', onMessage); };
  }, [ytId]);

  // ── 로컬: <video> DOM 250ms 폴링 ──
  useEffect(() => {
    if (isYouTube) return;
    const read = () => {
      const el = document.querySelector(
        `video[data-video-element-id="${CSS.escape(elId)}"]`,
      ) as HTMLVideoElement | null;
      if (!el) return;
      setReady(el.readyState);
      if (el.duration && isFinite(el.duration)) setDuration(el.duration);
      if (!isSeekingRef.current) setCurrentTime(el.currentTime);
      setIsPlaying(!el.paused && !el.ended);
    };
    const first = requestAnimationFrame(read);
    const timer = setInterval(read, 250);
    return () => { cancelAnimationFrame(first); clearInterval(timer); };
  }, [isYouTube, elId]);

  const play = useCallback(() => {
    if (ytId) { postYouTubeCommand(ytId, 'playVideo'); setPlaybackState(ytId, { pausedByOperator: false }); }
    else {
      // [FIX: GRID_AUTOPLAY] 재생을 누르면 다음 섹션 송출부터도 자동 재생되도록 autoplay 를 켠다
      //   (컴포저 ▶ 와 동일). 이걸 안 하면 autoplay:false 영상은 송출해도 정지 화면만 나간다.
      updateLocalElement({ autoplay: true, startTime: currentTimeRef.current });
      sendLocalVideoCommand(elId, 'play');
    }
    setIsPlaying(true);
  }, [ytId, elId, updateLocalElement]);

  const pause = useCallback(() => {
    if (ytId) { postYouTubeCommand(ytId, 'pauseVideo'); setPlaybackState(ytId, { pausedByOperator: true }); }
    else {
      // ⏸ 는 "여기서부터" — 시작 위치만 기억하고 autoplay 는 끄지 않는다(컴포저와 동일).
      updateLocalElement({ startTime: currentTimeRef.current });
      sendLocalVideoCommand(elId, 'pause');
    }
    setIsPlaying(false);
  }, [ytId, elId, updateLocalElement]);

  const stop = useCallback(() => {
    if (ytId) {
      // stopVideo 는 플레이어를 언로드시키므로 pause + seek 0 (VideoControlBar 와 동일)
      postYouTubeCommand(ytId, 'pauseVideo');
      postYouTubeCommand(ytId, 'seekTo', [0, true]);
      setPlaybackState(ytId, { currentTime: 0, pausedByOperator: true });
    } else {
      // ■ 는 "멈춰" — 처음으로 되돌리고 autoplay:false 를 남겨 송출 시 정지 화면(컴포저와 동일).
      updateLocalElement({ autoplay: false, startTime: 0 });
      sendLocalVideoCommand(elId, 'stop');
    }
    setCurrentTime(0);
    setIsPlaying(false);
  }, [ytId, elId, updateLocalElement]);

  const seek = useCallback((sec: number, opts?: { commit?: boolean }) => {
    setCurrentTime(sec);
    if (ytId) {
      setPlaybackState(ytId, { currentTime: sec });
      postYouTubeCommand(ytId, 'seekTo', [sec, true]);
    } else {
      sendLocalVideoCommand(elId, 'seekTo', [sec]);
    }
    // 로컬은 송출 시작 위치(startTime)를 요소에 남긴다 — 놓는 순간(commit)에만 저장
    if (opts?.commit && !ytId) {
      undoManager.pushState(ctx.allElements as never[]);
      updateElement(ctx.setlistId, ctx.itemId, ctx.sectionId, elId, { startTime: sec });
    }
  }, [ytId, elId, ctx.setlistId, ctx.itemId, ctx.sectionId, ctx.allElements, updateElement]);

  const seekStart = useCallback(() => { isSeekingRef.current = true; }, []);
  const seekEnd = useCallback((sec: number) => { isSeekingRef.current = false; seek(sec, { commit: true }); }, [seek]);

  // 음소거 토글 — 컴포저 VideoControlBar 와 동일 규약: 요소 상태(muted) 갱신 + 출력 창 명령.
  //   요소 상태를 바꾸므로 그리드를 닫아도 컴포저 캔버스·컨트롤바에 그대로 반영된다.
  const toggleMute = useCallback(() => {
    const next = !video.muted;
    undoManager.pushState(ctx.allElements as never[]);
    updateElement(ctx.setlistId, ctx.itemId, ctx.sectionId, elId, { muted: next });
    if (ytId) postYouTubeCommand(ytId, next ? 'mute' : 'unMute');
    else sendLocalVideoCommand(elId, next ? 'mute' : 'unMute');
  }, [video.muted, ytId, elId, ctx.setlistId, ctx.itemId, ctx.sectionId, ctx.allElements, updateElement]);

  return { currentTime, duration, isPlaying, ready, play, pause, stop, seek, seekStart, seekEnd, muted: !!video.muted, toggleMute };
}
