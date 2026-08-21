// 유튜브 영상 요소의 출력 라우팅(main/sub/broadcast)·고정 레이어 판정 헬퍼

/**
 * [FEATURE: YT_OUTPUT_ROUTING]
 *
 * 기획: docs/features/youtube-output-routing/PLAN.md
 *
 * 라우팅 값은 기존 `CanvasRenderTarget` 을 그대로 쓴다. 새 타입을 만들지 않는다.
 *
 *   main      → 'output'    (회중/강대상)
 *   sub       → 'prompt'    (무대/중상층)
 *   broadcast → 'broadcast' (방송/미러)
 *
 * [용어 주의] 이 축은 **자막을 어느 창에 그리는가** 만 정한다. 유튜브 RTMP 송출
 * (⑥ 라이브·녹화 축)과는 무관하다. 예전에 세 번째 값을 'live' 로 부르다가
 * 이름이 겹쳐서 'broadcast' 로 통일했다.
 *
 * 고정 레이어는 `lib/fixedLayers.ts` 가 송신 측에서 이미 처리한다. 여기서는
 * "이 영상이 고정 레이어인가" 판정만 제공한다 — 고정 레이어 영상은 섹션이
 * 바뀌어도 계속 흘러야 하므로 STANDBY 대기와 seekTo 되감기에서 빠져야 한다.
 */

import type { CanvasElement, VideoElement } from './canvasTypes';
import { isFixedLayerElement } from './fixedLayers';

/** 유튜브 링크가 붙은 영상 요소인가 */
export function isYouTubeElement(el: CanvasElement): el is VideoElement {
  return el.type === 'video' && !!(el as VideoElement).youtubeId;
}

/**
 * 고정 레이어 유튜브 영상인가.
 *
 * true 면 섹션이 바뀌어도 같은 iframe 이 유지된 채 계속 재생된다.
 * 그 위로 섹션별 자막이 올라간다.
 */
export function isFixedLayerYouTube(el: CanvasElement): boolean {
  return isYouTubeElement(el) && isFixedLayerElement(el);
}

/** 요소 목록에 고정 레이어 유튜브가 하나라도 있는가 */
export function hasFixedLayerYouTube(elements: readonly CanvasElement[]): boolean {
  return elements.some(isFixedLayerYouTube);
}
