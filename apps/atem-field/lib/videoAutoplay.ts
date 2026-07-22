/**
 * 공유 비디오 자동재생 헬퍼
 * OperatorPanel / SetlistPanel 양쪽에서 사용하여 로직 일관성 유지
 */
import { CanvasElement, VideoElement } from '@/lib/canvasTypes';
import { getPlaybackState } from '@/lib/videoPlaybackStore';
import { getSocket } from '@/lib/socketClient';
import { SOCKET_EVENTS, SocketMessage, type SocketMessageTarget } from '@/lib/socketEvents';

/**
 * 주어진 요소 배열에서 비디오 요소를 찾아
 * 에디터 iframe 은 모니터링 전용이므로 음소거 상태로 playVideo/seekTo 만 전송하고,
 * 실제 오디오 unMute 는 송출 PC(/output) 쪽 VIDEO_COMMAND 로만 전송한다.
 *
 * 설계 원칙 (스터터 방지):
 *   - 한 번만 전송. 중복 전송은 매번 짧은 버퍼링 블립을 유발해서
 *     "다다다다" 반복 재생처럼 들리게 만듭니다.
 *   - seekTo 는 resume 경우 (currentTime > 0) 에만 — fresh play 에서는 불필요.
 *   - 에디터 iframe 은 스탠바이 상태에서 이미 로드되어 있으므로 1회 전송이면 충분.
 *   - 송출 PC (강대상/프롬프트/브로드캐스트) 는 receiver 가 onStateChange 를 추적해서
 *     state=1 (playing) 이 확인될 때까지만 재시도 — 한 번이라도 재생에 들어가면
 *     추가 명령을 보내지 않아서 스터터 발생 없음. (sender 는 단일 emit)
 */
export function autoPlayVideos(
  elements: CanvasElement[],
  options: { targets?: SocketMessageTarget[] } = {},
): void {
  const videoEls = elements.filter(
    (el): el is VideoElement => el.type === 'video' && !!el.youtubeId
  );
  if (videoEls.length === 0) return;

  for (const vel of videoEls) {
    const pb = getPlaybackState(vel.youtubeId!);

    // ── 에디터 iframe: iframe 이 준비되면 1회만 전송 ──
    // iframe 이 마운트되지 않았을 때만 재시도 (최대 2초). 마운트된 이후에는 1회.
    const tryEditorPlay = (retries = 0) => {
      const editorIframe = document.querySelector(
        `iframe[src*="${vel.youtubeId}"]`
      ) as HTMLIFrameElement | null;

      if (!editorIframe?.contentWindow) {
        if (retries < 10) {
          setTimeout(() => tryEditorPlay(retries + 1), 200);
        }
        return;
      }

      const win = editorIframe.contentWindow;
      // listening 이벤트: YouTube iframe API 활성화
      win.postMessage(
        JSON.stringify({ event: 'listening', id: 0 }),
        'https://www.youtube.com'
      );
      // seekTo 는 resume 인 경우에만
      if (pb.currentTime > 0) {
        win.postMessage(
          JSON.stringify({ event: 'command', func: 'seekTo', args: [pb.currentTime, true] }),
          'https://www.youtube.com'
        );
      }
      win.postMessage(
        JSON.stringify({ event: 'command', func: 'playVideo', args: [] }),
        'https://www.youtube.com'
      );
    };
    // React re-render 후 (다음 tick) 시작
    setTimeout(() => tryEditorPlay(), 50);

    // ── 송출 PC: VIDEO_COMMAND 를 즉시 emit (딜레이 제거) ──
    //   receivers (OutputCanvas / PromptCanvas / BroadcastFeedMirror) 가
    //   iframe 로딩 대기를 포함한 재시도 로직 + state=1 진입 시 pending seek
    //   재적용 로직을 가지고 있으므로 sender 는 지연 없이 즉시 보낸다.
    //   seekTo 를 playVideo 보다 먼저 보내는 것이 중요 — playVideo 가 먼저 오면
    //   YouTube 가 0:00 에서 재생을 시작한 후 seek 이 적용되는 깜빡임이 있음.
    const socket = getSocket();
    if (socket) {
      const emitCmd = (command: string, args: unknown[] = []) =>
        socket.emit(SOCKET_EVENTS.BROADCAST, {
          type: 'VIDEO_COMMAND',
          targets: options.targets,
          payload: { youtubeId: vel.youtubeId!, command, args },
        } satisfies SocketMessage);

      if (pb.currentTime > 0) {
        emitCmd('seekTo', [pb.currentTime, true]);
      }
      emitCmd('playVideo');
      emitCmd('unMute');
    }
  }
}
