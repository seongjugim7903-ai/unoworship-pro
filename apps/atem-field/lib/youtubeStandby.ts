/**
 * lib/youtubeStandby.ts
 *
 * [FEATURE: YT_STANDBY]
 *
 * 유튜브 링크가 있는 섹션의 "송출 스탠바이" 로직 공통 유틸.
 *
 * 배경:
 *   기존에는 PageDown/PageUp(OperatorPanel) 또는 섹션 카드 더블클릭(SetlistPanel)
 *   으로 섹션을 이동하면 즉시 ELEMENTS_UPDATE 를 송출했습니다. 그런데 YouTube
 *   iframe 은 여러 모니터(강대상/프롬프트/브로드캐스트 대시보드)에서 독립적으로
 *   로드되기 때문에 도착과 동시에 플레이를 찌르면 로드 타이밍 편차로 "어떤
 *   모니터는 뜨고 어떤 모니터는 안 뜨는" 현상이 발생합니다.
 *
 * 해결:
 *   1. 네비게이션으로 YouTube 섹션에 도착 → 에디터에만 활성화(섹션 선택)하고
 *      송출 스탠바이 상태(youtubeStandby) 만 잡아둠. ELEMENTS_UPDATE 송출 안 함.
 *   2. 사용자가 Enter/Space 키 또는 에디터 내 YouTube 영상을 한 번 클릭하면
 *      그때 송출(ELEMENTS_UPDATE + VIDEO_COMMAND playVideo) 실행.
 *
 * 이 파일의 역할:
 *   - sectionHasYouTube()      — 섹션 내 YouTube 포함 여부 판정
 *   - commitYouTubeStandby()   — 현재 스탠바이 상태의 섹션을 즉시 송출
 *                                (VideoElementView 의 클릭 핸들러에서 호출)
 *   - Enter/Space 경로는 OperatorPanel.sendToOutput() 내에서 스탠바이를 해제하며
 *     기존 송출 경로로 자연스럽게 흘러가도록 처리합니다.
 */

import { Section } from './types';
import { VideoElement } from './canvasTypes';
import { useStore } from './store';
import { getSocket } from './socketClient';
import { SOCKET_EVENTS, type SocketMessage } from './socketEvents';
import { autoPlayVideos } from './videoAutoplay';

/**
 * 섹션에 YouTube 링크가 있는 video 요소가 하나라도 있는지 판정.
 * (visible 여부는 고려하지 않음 — 숨김 처리된 요소도 링크가 있다면 스탠바이 대상)
 */
export function sectionHasYouTube(section: Section | null | undefined): boolean {
  if (!section) return false;
  return section.elements.some(
    (el) => el.type === 'video' && !!(el as VideoElement).youtubeId
  );
}

/**
 * 현재 스탠바이 상태의 YouTube 섹션을 즉시 송출하고 스탠바이를 해제합니다.
 *
 * 호출 경로:
 *   - VideoElementView 의 스탠바이 오버레이 클릭
 *
 * 동작:
 *   1. store.youtubeStandby 에서 (itemId, sectionId) 조회
 *   2. setlists 트리에서 실제 섹션 객체 찾기
 *   3. store 상태 업데이트: youtubeStandby=null, broadcastSection=target,
 *      activeItem/Section=target, isBlackout=false
 *   4. Socket.io 로 ELEMENTS_UPDATE 송출 (hasElements 경로)
 *   5. autoPlayVideos() 호출 — 에디터 iframe 과 송출 PC 양쪽에 playVideo 명령
 *
 * 스탠바이가 비어 있거나 섹션을 찾지 못하면 no-op (스탠바이만 정리).
 */
export function commitYouTubeStandby(): void {
  const state = useStore.getState();
  const standby = state.youtubeStandby;
  if (!standby) return;

  const setlist = state.setlists.find((s) => s.id === state.currentSetlistId);
  const item = setlist?.items.find((i) => i.id === standby.itemId);
  const section = item?.sections.find((sec) => sec.id === standby.sectionId);
  if (!section) {
    // 스탠바이가 가리키는 섹션이 사라진 경우 (삭제/이동) → 안전하게 리셋
    state.setYouTubeStandby(null);
    return;
  }

  // ── 상태 전이 ──
  state.setYouTubeStandby(null);
  state.setBroadcastSection({ itemId: standby.itemId, sectionId: standby.sectionId });
  state.setActiveItem(standby.itemId);
  state.setActiveSection(standby.sectionId);
  if (state.isBlackout) state.setBlackout(false);

  // ── 송출 ──
  const socket = getSocket();
  if (socket) {
    const msg: SocketMessage = {
      type: 'ELEMENTS_UPDATE',
      payload: {
        elements: section.elements,
        sectionText: section.text,
      },
    };
    socket.emit(SOCKET_EVENTS.BROADCAST, msg);
  }
  // 에디터 iframe + 송출 PC 양쪽에 seekTo/playVideo/unMute (재시도 포함)
  autoPlayVideos(section.elements);
}
