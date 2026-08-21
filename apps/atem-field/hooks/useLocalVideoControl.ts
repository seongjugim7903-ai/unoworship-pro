'use client';

// 송출 창에서 로컬 영상(<video>)을 id 로 등록하고 원격 명령을 적용하는 수신 훅

/**
 * [FEATURE: LOCAL_VIDEO_CONTROL]
 *
 * 각 송출 화면(OutputCanvas / AtemKeyCanvas / PromptCanvas)의 메시지 switch 를
 * 건드리지 않으려고 이 훅이 자체 소켓 리스너를 붙인다. 그래서 붙이는 쪽은
 *
 *   const { registerVideo } = useLocalVideoControl({ audio });
 *   <video ref={registerVideo(vel.id)} ... />
 *
 * 두 줄이면 끝이고, 유튜브 제어 경로와는 코드가 전혀 섞이지 않는다.
 *
 * 오디오 규약은 유튜브와 동일하다. `audio: true` 인 화면 한 곳만 소리를 내고,
 * 나머지는 `unMute` 가 와도 무시하고 음소거를 유지한다. 두 창이 동시에 소리를
 * 내면 미세하게 어긋난 메아리가 되고 원인 추적이 매우 어렵기 때문
 * (docs/UNOLIVE_YOUTUBE_OUTPUT_AUDIO_FIX_NOTE_2026-07-28.md 참조).
 */

import { useCallback, useEffect, useRef } from 'react';
import { getSocket } from '@/lib/socketClient';
import { SOCKET_EVENTS, type SocketMessage } from '@/lib/socketEvents';

interface UseLocalVideoControlOptions {
  /** 이 화면이 오디오를 내보내는 유일한 창인지. 기본 false = 항상 음소거. */
  audio?: boolean;
}

export function useLocalVideoControl({ audio = false }: UseLocalVideoControlOptions = {}) {
  const videosRef = useRef<Map<string, HTMLVideoElement>>(new Map());
  // 재시도 타이머 — 언마운트 시 일괄 정리
  const timersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const audioRef = useRef(audio);

  useEffect(() => {
    audioRef.current = audio;
    // 오디오 담당이 아니면 이미 붙어 있는 영상도 즉시 음소거로 되돌린다.
    if (!audio) {
      for (const video of videosRef.current.values()) video.muted = true;
    }
  }, [audio]);

  /** <video ref={registerVideo(elementId)} /> 형태로 사용 */
  const registerVideo = useCallback(
    (elementId: string) => (el: HTMLVideoElement | null) => {
      if (el) videosRef.current.set(elementId, el);
      // el === null 은 React 가 ref 를 재부착할 때마다 오므로 삭제하지 않는다.
      // 사라진 요소 정리는 아래 cleanup 이 담당.
    },
    [],
  );

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const handleBroadcast = (msg: SocketMessage) => {
      if (msg.type !== 'LOCAL_VIDEO_COMMAND') return;
      const { elementId, command, args } = msg.payload;

      // [FIX: LOCAL_CMD_RETRY] 송출 시 ELEMENTS_UPDATE 와 명령이 거의 동시에 온다.
      //   <video> 가 아직 안 그려졌으면 registerVideo 도 안 끝나서 명령이 그냥
      //   버려졌다. 그래서 "멈춘 위치에서 송출" 이 로컬만 안 먹었다.
      //   (유튜브 수신부는 처음부터 재시도가 있어서 됐다 — 같은 규약으로 맞춘다.)
      const el = videosRef.current.get(elementId);
      if (el) {
        apply(el, command, args);
        return;
      }
      // 아직 안 그려졌으면 붙을 때까지만 재시도한다.
      //   `done` 으로 첫 성공 뒤 나머지 타이머를 무력화 — 안 그러면 뒤늦은 재시도가
      //   그 사이 운영자가 바꾼 상태(예: 재생 → 다시 정지)를 덮어쓴다.
      let done = false;
      for (const delay of [80, 250, 600, 1200, 2000]) {
        const timer = setTimeout(() => {
          timersRef.current.delete(timer);
          if (done) return;
          const late = videosRef.current.get(elementId);
          if (late) {
            done = true;
            apply(late, command, args);
          }
        }, delay);
        timersRef.current.add(timer);
      }
    };

    const apply = (video: HTMLVideoElement, command: string, args?: number[]) => {
      switch (command) {
        case 'play':
          void video.play().catch(() => {
            /* 자동재생 정책으로 막히면 조용히 무시 — 음소거 상태면 통과한다 */
          });
          break;
        case 'pause':
          video.pause();
          break;
        case 'stop':
          video.pause();
          video.currentTime = 0;
          break;
        case 'seekTo':
          if (typeof args?.[0] === 'number') video.currentTime = args[0];
          break;
        case 'setLoop':
          // [FIX: LOOP_SYNC] 반복 토글을 껐는데 송출 창만 계속 돌던 문제.
          //   요소 속성만 바꾸면 다음 송출까지 반영되지 않아 명령으로 즉시 맞춘다.
          video.loop = args?.[0] === 1;
          break;
        case 'mute':
          video.muted = true;
          break;
        case 'unMute':
          // 오디오 담당 화면에서만 실제로 소리를 켠다.
          video.muted = !audioRef.current;
          break;
      }
    };

    socket.on(SOCKET_EVENTS.BROADCAST, handleBroadcast);
    const timers = timersRef.current;
    return () => {
      socket.off(SOCKET_EVENTS.BROADCAST, handleBroadcast);
      for (const t of timers) clearTimeout(t);
      timers.clear();
    };
  }, []);

  /** 현재 살아 있는 요소 id 목록으로 사라진 <video> 참조를 정리한다 */
  const pruneVideos = useCallback((activeIds: Iterable<string>) => {
    const alive = new Set(activeIds);
    for (const id of videosRef.current.keys()) {
      if (!alive.has(id)) videosRef.current.delete(id);
    }
  }, []);

  return { registerVideo, pruneVideos };
}
