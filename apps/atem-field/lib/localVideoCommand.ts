// 로컬 업로드 영상(<video>)을 송출 창에서 원격 제어하기 위한 명령 정의·전송 유틸

/**
 * [FEATURE: LOCAL_VIDEO_CONTROL]
 *
 * 배경:
 *   유튜브 영상은 VIDEO_COMMAND 로 송출 창의 iframe 을 제어한다. 그런데 로컬
 *   업로드 영상은 `VideoControlBar.postCommand` 가 `if (!video?.youtubeId) return`
 *   으로 막고 있어서 명령을 한 번도 보내지 않았다. 송출 창의 <video> 는
 *   `autoPlay` 속성으로 혼자 시작한 뒤 아무도 제어할 수 없었다.
 *
 * 설계:
 *   로컬 <video> 는 iframe 과 달리 같은 문서의 DOM 이라 postMessage 가 필요 없다.
 *   요소 id 로 <video> 를 찾아 play()/pause()/currentTime 을 직접 부르면 된다.
 *   그래서 유튜브 쪽 재시도·핸드셰이크 로직이 전혀 필요 없고, 코드도 섞이지 않는다.
 *
 *   - 이 파일: 보내는 쪽 (컴포저)
 *   - hooks/useLocalVideoControl.ts: 받는 쪽 (송출 창)
 */

import { CanvasElement, VideoElement } from './canvasTypes';
import { getSocket } from './socketClient';
import { SOCKET_EVENTS, type SocketMessage } from './socketEvents';

/** 로컬 영상 명령. 유튜브의 playVideo/pauseVideo 와 이름을 일부러 다르게 둔다. */
export type LocalVideoCommand =
  | 'play'
  | 'pause'
  | 'stop'      // 일시정지 + 0초로 되감기
  | 'seekTo'
  | 'mute'
  | 'unMute'
  /** [FIX: LOOP_SYNC] 반복 재생 on/off — args[0] 이 1 이면 켬 */
  | 'setLoop';

/** 유튜브가 아닌(=로컬 파일) 영상 요소인지 */
export function isLocalVideoElement(el: CanvasElement): el is VideoElement {
  return el.type === 'video' && !(el as VideoElement).youtubeId && !!(el as VideoElement).src;
}

/**
 * 송출 창들에 로컬 영상 명령을 보낸다.
 *
 * 유튜브와 달리 재시도가 없다. <video> 는 iframe 로딩·플레이어 초기화 같은
 * 비동기 준비 단계가 없어서, 요소가 마운트돼 있으면 명령이 항상 즉시 먹는다.
 */
export function sendLocalVideoCommand(
  elementId: string,
  command: LocalVideoCommand,
  args?: number[],
): void {
  // [FEATURE: LOCAL_VIDEO_TIMELINE] 에디터 미리보기에도 같은 조작을 적용한다.
  //   유튜브는 postCommand 가 에디터 iframe + 송출 창 양쪽에 보내서 타임라인이
  //   흘렀는데, 로컬은 송출 창에만 보내서 에디터가 멈춘 채였다. 그래서 재생
  //   시간이 0:00 에 고정되고 반복 재생도 확인할 수 없었다.
  //   에디터는 모니터링용이므로 음소거를 유지한다(소리는 송출 창 담당).
  applyToEditorPreview(elementId, command, args);

  const socket = getSocket();
  if (!socket) return;

  const msg: SocketMessage = {
    type: 'LOCAL_VIDEO_COMMAND',
    payload: { elementId, command, args },
  };
  socket.emit(SOCKET_EVENTS.BROADCAST, msg);
}

/** 컴포저 에디터에 떠 있는 같은 요소의 <video> 에 명령을 적용한다 */
function applyToEditorPreview(
  elementId: string,
  command: LocalVideoCommand,
  args?: number[],
): void {
  if (typeof document === 'undefined') return;
  const el = document.querySelector(
    `video[data-video-element-id="${CSS.escape(elementId)}"]`,
  ) as HTMLVideoElement | null;
  if (!el) return;

  el.muted = true; // 에디터는 항상 무음
  switch (command) {
    case 'play':
      void el.play().catch(() => { /* 자동재생 정책은 무시 */ });
      break;
    case 'pause':
      el.pause();
      break;
    case 'stop':
      el.pause();
      el.currentTime = 0;
      break;
    case 'seekTo':
      if (typeof args?.[0] === 'number') el.currentTime = args[0];
      break;
    case 'setLoop':
      el.loop = args?.[0] === 1;
      break;
    case 'mute':
    case 'unMute':
      break; // 에디터는 음소거 고정
  }
}
