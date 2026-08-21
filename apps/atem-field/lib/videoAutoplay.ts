/**
 * 공유 비디오 자동재생 헬퍼
 * OperatorPanel / SetlistPanel 양쪽에서 사용하여 로직 일관성 유지
 */
import { CanvasElement, VideoElement } from '@/lib/canvasTypes';
import { getPlaybackState } from '@/lib/videoPlaybackStore';
import { sendLocalVideoCommand } from '@/lib/localVideoCommand'; // [FEATURE: PAUSED_BROADCAST]
import { isFixedLayerYouTube } from '@/lib/youtubeRouting'; // [FEATURE: YT_OUTPUT_ROUTING]
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
  // [FEATURE: PAUSED_BROADCAST] 로컬 영상도 송출 시 위치·재생 상태를 맞춘다.
  //   유튜브는 seekTo/playVideo 를 보내서 됐지만, 로컬은 아무 명령도 안 보내서
  //   송출 창이 늘 0초 정지 상태였다. 기억해 둔 startTime 으로 이동한 뒤 재생한다.
  for (const vel of elements) {
    if (vel.type !== 'video') continue;
    const local = vel as VideoElement;
    if (local.youtubeId || !local.src) continue;
    if (local.startTime && isFinite(local.startTime)) {
      sendLocalVideoCommand(local.id, 'seekTo', [local.startTime]);
    }
    // ⏸ 와 ■ 의 의미가 다르다.
    //   ⏸ = "여기서부터"  → autoplay 를 건드리지 않으므로 송출 시 그 지점부터 재생.
    //   ■ = "멈춰"        → autoplay:false 를 남기므로 송출해도 정지 화면만 나간다.
    //   autoplay 가 아예 없는 새 영상은 재생이 기본값이다.
    sendLocalVideoCommand(local.id, local.autoplay === false ? 'pause' : 'play');
  }

  const videoEls = elements.filter(
    (el): el is VideoElement => el.type === 'video' && !!el.youtubeId
  );
  if (videoEls.length === 0) return;

  for (const vel of videoEls) {
    const pb = getPlaybackState(vel.youtubeId!);
    // [FEATURE: YT_OUTPUT_ROUTING] 고정 레이어 영상은 섹션이 바뀌어도 계속 흘러야 하므로
    //   seekTo 를 보내지 않는다. 보내면 섹션마다 저장된 위치로 되감긴다.
    //   playVideo 는 그대로 보내도 안전 — 수신 측이 이미 재생 중이면 무시한다.
    const keepFlowing = isFixedLayerYouTube(vel);
    const shouldSeek = !keepFlowing && pb.currentTime > 0;
    // [FEATURE: PAUSED_BROADCAST] 운영자가 컨트롤 바에서 직접 멈춰 뒀으면
    //   송출해도 자동재생하지 않고 그 위치의 정지 화면을 그대로 내보낸다.
    //   고정 레이어는 계속 흘러야 하므로 이 규칙에서 제외한다.
    const holdPaused = !keepFlowing && pb.pausedByOperator;

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
      // seekTo 는 resume 인 경우에만 (고정 레이어는 되감지 않음)
      if (shouldSeek || holdPaused) {
        win.postMessage(
          JSON.stringify({ event: 'command', func: 'seekTo', args: [pb.currentTime, true] }),
          'https://www.youtube.com'
        );
      }
      win.postMessage(
        JSON.stringify({ event: 'command', func: holdPaused ? 'pauseVideo' : 'playVideo', args: [] }),
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

      if (shouldSeek || holdPaused) {
        emitCmd('seekTo', [pb.currentTime, true]);
      }
      if (holdPaused) {
        // 멈춘 화면 그대로 송출 — 소리도 켜지 않는다.
        emitCmd('pauseVideo');
      } else {
        emitCmd('playVideo');
        emitCmd('unMute');
      }
    }
  }
}
