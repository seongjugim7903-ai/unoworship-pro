/**
 * lib/socketEvents.ts
 * Socket.io 이벤트 타입 및 상수 정의
 *
 * [FEATURE: SOCKET_IO]
 * BroadcastChannel(동일 PC 전용)을 대체하는 Socket.io 기반 크로스-PC 통신 레이어.
 * - PC1(컴포저)  →  서버  →  PC2(아웃풋) : BROADCAST 이벤트
 * - PC2(아웃풋)  →  서버  →  PC1(컴포저) : PONG 이벤트 (연결 확인)
 *
 * 이 파일은 서버/클라이언트 양쪽에서 import 가능한 순수 타입·상수만 포함.
 */

import { SubtitleStyle, PromptLayoutType } from './types';
import { CanvasElement, CanvasRenderTarget, DEFAULT_RENDER_TARGETS } from './canvasTypes';

// ── [FEATURE: SECTION_TRANSITION] 섹션 송출 시 /output · /prompt 에서 재생될 전환 효과
export interface SectionTransitionPayload {
  type: 'cut' | 'fade' | 'slide' | 'dip-to-black';
  duration: number;
}

export type SectionKind = 'default' | 'cover';

export type SocketMessageTarget = CanvasRenderTarget;

export type SocketTraceRenderMode =
  | 'subtitle'
  | 'elements'
  | 'frame-update'
  | 'frame-cache'
  | 'frame-show'
  | 'command'
  | 'control';

export interface SocketTraceMeta {
  id: string;
  source: 'composer' | 'output' | 'prompt' | 'broadcast' | 'server';
  sentAt: number;
  messageType: string;
  renderMode: SocketTraceRenderMode;
  targetSummary: string;
  elementCount?: number;
  frameBytes?: number;
  sectionId?: string;
  textLength?: number;
  controlStartedAt?: number;
  controlPrepMs?: number;
  cachePhase?: string;
  cacheDecision?: string;
  cacheReason?: string;
  cacheKeyDigest?: string;
  cacheAgeMs?: number;
  fixedLayerCount?: number;
  ownElementCount?: number;
  outputElementCount?: number;
  hasOutputRouting?: boolean;
  hasOutputVideo?: boolean;
  outputOnlyFrame?: boolean;
  serverReceivedAt?: number;
  serverForwardedAt?: number;
}

type TargetedSocketMessage = {
  /**
   * 생략 시 기존 동작처럼 output, prompt, broadcast 전체가 수신한다.
   * prompt-only PMT 같은 특수 송출에서 특정 화면만 반응하게 할 때 사용한다.
   */
  targets?: SocketMessageTarget[];
  /**
   * ?debugLatency=1 진단용 trace. 운영 메시지의 의미에는 관여하지 않는다.
   */
  trace?: SocketTraceMeta;
};

// ── 메시지 페이로드 타입 (BroadcastMessage와 동일 구조) ──────────────────────
export type SocketMessage =
  | ({ type: 'SUBTITLE_UPDATE'; payload: { text: string; style: SubtitleStyle; promptLayout?: PromptLayoutType; nextSectionText?: string; sectionKind?: SectionKind; transition?: SectionTransitionPayload; promptVerses?: string[]; promptCurrentIndex?: number; scripturePassage?: string } } & TargetedSocketMessage)
  | ({ type: 'ELEMENTS_UPDATE'; payload: { elements: CanvasElement[]; sectionText: string; promptLayout?: PromptLayoutType; nextSectionText?: string; sectionKind?: SectionKind; transition?: SectionTransitionPayload; promptVerses?: string[]; promptCurrentIndex?: number; scripturePassage?: string } } & TargetedSocketMessage)
  | ({ type: 'BLACKOUT'; payload: { active: boolean } } & TargetedSocketMessage)
  | ({ type: 'CLEAR_TEXT' } & TargetedSocketMessage)
  | ({ type: 'CAMERA_SOURCE'; payload: { deviceId: string } } & TargetedSocketMessage)
  | ({ type: 'VIDEO_COMMAND'; payload: { youtubeId: string; command: string; args?: unknown[] } } & TargetedSocketMessage)
  | ({ type: 'FRAME_UPDATE'; payload: { frame: string; sectionText: string; hasMotion: boolean; promptLayout?: PromptLayoutType; nextSectionText?: string; sectionKind?: SectionKind; transition?: SectionTransitionPayload } } & TargetedSocketMessage)
  | ({ type: 'FRAME_CACHE'; payload: { sectionId: string; frame: string } } & TargetedSocketMessage)
  | ({ type: 'FRAME_SHOW'; payload: { sectionId: string; sectionText: string; hasMotion: boolean; promptLayout?: PromptLayoutType; nextSectionText?: string; sectionKind?: SectionKind; transition?: SectionTransitionPayload } } & TargetedSocketMessage)
  | ({ type: 'PING' } & TargetedSocketMessage)
  | ({ type: 'PONG' } & TargetedSocketMessage);

export function isSocketMessageTargetedTo(
  msg: Pick<SocketMessage, 'targets'>,
  target: SocketMessageTarget,
): boolean {
  return !msg.targets || msg.targets.length === 0 || msg.targets.includes(target);
}

export function getDefaultSocketMessageTargets(): SocketMessageTarget[] {
  return [...DEFAULT_RENDER_TARGETS];
}

// ── Socket.io 이벤트 이름 상수 ────────────────────────────────────────────────
export const SOCKET_EVENTS = {
  /** Composer → 서버 → Output: 모든 라이브 메시지 릴레이 */
  BROADCAST: 'broadcast',
  /** Output/Prompt → 서버: 송출 지연 진단 기록 */
  LATENCY_REPORT: 'latency-report',
  /** Output → 서버 → Composer: 연결 확인 응답 */
  PONG: 'pong',
  /** 클라이언트 → 서버: 룸 참가 요청 */
  JOIN_ROOM: 'join-room',
  /** 서버 → 요청 클라이언트: 룸 참가 허용/거부 결과 */
  JOIN_ROOM_RESULT: 'join-room-result',
  /** 서버 → 클라이언트: 상대방 룸 참가 알림 */
  PEER_JOINED: 'peer-joined',
  /** 서버 → 클라이언트: 상대방 연결 해제 알림 */
  PEER_LEFT: 'peer-left',

  // ─── WebRTC 미러 시그널링 [FEATURE: BROADCAST_VIEWER / WEBRTC] ─────────────
  /** Viewer → 서버 → Output: 뷰어가 합류해 비디오 피드를 요청 */
  VIEWER_JOIN: 'viewer-join',
  /** 서버 → Output: Viewer 이탈 (disconnecting 감지) */
  VIEWER_LEAVE: 'viewer-leave',
  /** Output → 서버 → Viewer 룸: 송출 준비 완료 (재연결 시 뷰어가 JOIN 재발송) */
  OUTPUT_READY: 'output-ready',
  /** WebRTC SDP / ICE 시그널 (to 필드 기반 1:1 라우팅) */
  WEBRTC_SIGNAL: 'webrtc-signal',

  // ─── [FEATURE: CAMERAS_RELAY] 서버 ATEM 카메라 4분할 → 원격 PC 릴레이 ────
  //     /output 과 완전 독립된 시그널 채널. 서버 페이지 /cameras-source 가
  //     퍼블리셔, 원격 composer 의 CameraGrid 가 구독자.
  CAMERAS_VIEWER_JOIN: 'cameras-viewer-join',
  CAMERAS_VIEWER_LEAVE: 'cameras-viewer-leave',
  CAMERAS_READY: 'cameras-ready',
  CAMERAS_WEBRTC_SIGNAL: 'cameras-webrtc-signal',
} as const;

// ── WebRTC 시그널 페이로드 ───────────────────────────────────────────────────
export type WebRTCSignal =
  | {
      kind: 'offer';
      /** 목적지 socket id (Output → Viewer) */
      to: string;
      /** 서버가 송신자 socket.id 로 덮어씀 */
      from?: string;
      sdp: RTCSessionDescriptionInit;
    }
  | {
      kind: 'answer';
      to: string;
      from?: string;
      sdp: RTCSessionDescriptionInit;
    }
  | {
      kind: 'ice';
      to: string;
      from?: string;
      candidate: RTCIceCandidateInit;
    };

// ── 룸 이름 상수 ─────────────────────────────────────────────────────────────
export const SOCKET_ROOMS = {
  COMPOSER: 'composer',
  OUTPUT: 'output',
  /**
   * 수동적 뷰어 룸 — /media/broadcast 대시보드 미러 창 전용.
   * - Composer → Output 릴레이와 동일한 BROADCAST 이벤트를 수신만 함.
   * - PEER_JOINED/PEER_LEFT 를 방출하지 않아 기존 Composer↔Output 하트비트에 영향 없음.
   * - PONG 송신하지 않음 (OUTPUT 존재 감지를 방해하지 않음).
   */
  VIEWER: 'viewer',

  // [FEATURE: CAMERAS_RELAY]
  /** 서버 카메라 퍼블리셔 — /cameras-source 페이지 1개 */
  CAMERAS_SOURCE: 'cameras-source',
  /** 카메라 구독자 — 원격 composer 의 CameraGrid */
  CAMERAS_VIEWER: 'cameras-viewer',
} as const;

export type SocketRoom = typeof SOCKET_ROOMS[keyof typeof SOCKET_ROOMS];
