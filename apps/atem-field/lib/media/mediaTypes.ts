/**
 * lib/media/mediaTypes.ts
 * UnoMedia 도메인 핵심 타입
 *
 * UnoMedia는 소형 교회 미디어부를 위한
 * 웹 기반 협업 + 입력 + 분석 + 랜딩 플랫폼입니다.
 * UnoLive(데스크탑 송출 엔진)와 서버 중심 동기화로 연결됩니다.
 *
 * Phase 2A.1 단계에서는 모든 상태가 목(mock) 데이터 기반이며,
 * 추후 Prisma + PostgreSQL + API 계층으로 교체됩니다.
 */

// ─────────────────────────────────────────
// 인증/역할
// ─────────────────────────────────────────

/** 로그인 상태: 랜딩 페이지가 3가지 모드(비로그인/로그인/오퍼레이터)로 분기 */
export type AuthMode = 'guest' | 'member' | 'operator';

/** 교회 미디어부 역할 */
export type MediaRole =
  | 'head'          // 미디어부장
  | 'director'      // 연출/감독
  | 'operator'      // 방송 오퍼레이터 (UnoLive 사용자)
  | 'conti'         // 찬양콘티 담당
  | 'subtitle'      // 자막 담당
  | 'camera'        // 카메라 담당
  | 'audio'         // 음향 담당
  | 'editor'        // 영상편집
  | 'photographer'  // 사진
  | 'volunteer';    // 자원봉사자 (일반)

/**
 * 브로드캐스트 대시보드 권한 그레이드
 *
 *  - viewer:   프리뷰/통계 보기만. 제어 불가.
 *  - operator: 현재 세션의 녹화·라이브 시작/정지, 품질 전환, 사고 로그 기록.
 *  - lead:     operator + 세션 설정 변경, Operator 권한 위임/회수, 긴급 종료.
 *
 * 운영 규칙: 한 세션당 Active Operator는 1명만 존재.
 */
export type BroadcastGrade = 'viewer' | 'operator' | 'lead';

// ─────────────────────────────────────────
// 조직 (교회 미디어부 구조)
// ─────────────────────────────────────────

export interface Church {
  id: string;
  name: string;
  seniorPastor?: string;   // 담임목사
  denomination?: string;   // 교단
  logoUrl?: string;
  memberCount?: number;    // 성도 수 (티어 산정)
  region?: string;
  /** 교제공간 지휘체계 대시보드 슬로건 */
  slogan?: string;
}

export interface Department {
  id: string;
  churchId: string;
  /** 예: "미디어부", "찬양팀", "영상팀" */
  name: string;
  parentId?: string;       // 상위 부서 (트리 구조)
  order: number;
  /** 부서 책임자 memberId */
  leaderId?: string;
  color?: string;          // 대시보드 뱃지 컬러
}

export interface Member {
  id: string;
  churchId: string;
  name: string;
  avatarUrl?: string;
  role: MediaRole;
  /** 소속 부서 ids */
  departmentIds: string[];
  /** 현재 온라인 여부 (실시간) */
  online?: boolean;
  /** 마지막 활동 시각 */
  lastSeenAt?: number;
  /** 자기 소개 / 한마디 */
  bio?: string;
  /** 브로드캐스트 대시보드 권한 그레이드 */
  broadcastGrade: BroadcastGrade;
}

// ─────────────────────────────────────────
// 예배 (Worship)
// ─────────────────────────────────────────

export type WorshipType =
  | 'sunday-main'     // 주일 대예배
  | 'sunday-evening'  // 주일 저녁
  | 'wednesday'       // 수요예배
  | 'friday'          // 금요철야
  | 'dawn'            // 새벽기도
  | 'special';        // 특별집회

export type WorshipStatus =
  | 'draft'       // 기획 중
  | 'preparing'   // 입력 진행 중
  | 'ready'       // 모든 자료 준비 완료
  | 'live'        // 방송 중
  | 'completed'   // 종료
  | 'archived';   // 아카이브

/** 예배에 필요한 입력 자료들의 완료 여부 */
export interface WorshipInputStatus {
  /** 주보 업로드 */
  bulletin: boolean;
  /** 찬양콘티 확정 */
  worshipConti: boolean;
  /** 설교 원고 / 요약 */
  sermon: boolean;
  /** 특송/헌금송 등록 */
  specialSong: boolean;
  /** 광고/공지 */
  announcements: boolean;
}

export interface Worship {
  id: string;
  churchId: string;
  type: WorshipType;
  title: string;
  /** 예배 시작 시각 (timestamp) */
  startAt: number;
  /** 담당 설교자 */
  preacher?: string;
  /** 본문 (예: "요한복음 3:16") */
  scripture?: string;
  /** 설교 제목 */
  sermonTitle?: string;
  status: WorshipStatus;
  inputs: WorshipInputStatus;
  /** 방송 담당자 memberId */
  operatorId?: string;
  /** 찬양콘티 담당 memberId */
  contiLeaderId?: string;
}

// ─────────────────────────────────────────
// 공지 / 업무 / 채팅 (협업)
// ─────────────────────────────────────────

export type NoticePriority = 'info' | 'normal' | 'urgent';

export interface Notice {
  id: string;
  churchId: string;
  authorId: string;
  title: string;
  body: string;
  priority: NoticePriority;
  /** 대상 부서 (비어있으면 전체) */
  targetDepartmentIds?: string[];
  createdAt: number;
  pinned?: boolean;
}

export interface ChatMessage {
  id: string;
  churchId: string;
  /** 채널 (예배별 or 부서별) */
  channelId: string;
  authorId: string;
  body: string;
  createdAt: number;
  /** 시스템 메시지 ("○○님이 주보를 업로드했습니다") */
  system?: boolean;
}

// ─────────────────────────────────────────
// 통계 (대시보드)
// ─────────────────────────────────────────

export interface BroadcastStats {
  /** 총 방송 횟수 */
  totalBroadcasts: number;
  /** 이번 달 방송 횟수 */
  monthBroadcasts: number;
  /** 누적 시청자 수 */
  totalViewers: number;
  /** 평균 동시 시청자 */
  avgConcurrent: number;
  /** 최근 7일 일별 방송 수 */
  weeklyTrend: number[];
  /** 온라인 멤버 수 */
  onlineMemberCount: number;
}

// ─────────────────────────────────────────
// 활동 피드 (Activity Log)
// ─────────────────────────────────────────

export type ActivityType =
  | 'worship-created'
  | 'input-completed'   // 주보/콘티/설교 등 개별 입력 완료
  | 'live-started'
  | 'live-ended'
  | 'notice-posted'
  | 'member-joined'
  | 'member-online';

export interface Activity {
  id: string;
  churchId: string;
  type: ActivityType;
  actorId?: string;
  targetId?: string;
  /** 표시용 텍스트 ("△△님이 찬양콘티를 확정했습니다") */
  message: string;
  createdAt: number;
}

// ─────────────────────────────────────────
// 빠른 액션 / 퀵링크
// ─────────────────────────────────────────

export interface QuickAction {
  id: string;
  label: string;
  icon: 'conti' | 'bulletin' | 'sermon' | 'camera' | 'broadcast' | 'library' | 'member' | 'settings' | 'choir';
  /** 이동할 경로 */
  href: string;
  /** 접근 가능 역할 (없으면 전체) */
  requiredRoles?: MediaRole[];
  /** 강조 배지 (예: "NEW", "3") */
  badge?: string;
}

// ─────────────────────────────────────────
// 브로드캐스트 세션 (대시보드 실시간 데이터)
// ─────────────────────────────────────────

/** 서버(BroadcastSession 단일 엔진)와의 연결 상태 */
export type ServerSyncStatus = 'connected' | 'connecting' | 'disconnected' | 'fallback-local';

/** 녹화 런타임 상태 */
export interface RecordingRuntime {
  active: boolean;
  startedAt: number | null;
  /** 녹화 파일 누적 크기 (bytes) */
  fileSize: number;
  /** 녹화 품질 라벨 */
  quality: '1080p60' | '1080p30' | '720p60' | '720p30';
  /** 다음에 저장될 파일 경로 힌트 (데스크탑 보고) */
  outputPath?: string;
  /** 현재/마지막 녹화 파일명 */
  fileName?: string;
  /** 현재/마지막 녹화 MIME 타입 */
  mimeType?: string;
  /** 마지막 녹화 오류 */
  lastError?: string;
}

/** 라이브 런타임 상태 */
export interface LiveRuntime {
  active: boolean;
  startedAt: number | null;
  provider: 'youtube' | 'custom';
  /** 현재 시청자 수 */
  viewers: number;
  /** 비트레이트 (kbps) */
  bitrate: number;
  /** 연결 건강도 */
  health: 'good' | 'warning' | 'bad';
  /** 사람이 읽는 스트림 키 힌트 (마스킹) */
  streamKeyMask?: string;
}

/** 오디오 레벨 (VU 미터 미러) */
export interface AudioLevelSnapshot {
  channel: 'mic' | 'bgm' | 'system' | 'line';
  label: string;
  /** -60 ~ 0 dB */
  db: number;
  muted: boolean;
}

/** 사고/이벤트 로그 1건 */
export interface IncidentLogEntry {
  id: string;
  sessionId: string;
  at: number;
  level: 'info' | 'warn' | 'error';
  /** 운영자가 필터링해서 볼 수 있는 로그 분류 */
  category?: 'broadcast' | 'recording' | 'live' | 'system';
  message: string;
  /** 기록한 사람 (자동기록은 undefined) */
  actorId?: string;
}

/** 브로드캐스트 세션 수동 메모 1건 */
export interface BroadcastMemoEntry {
  id: string;
  sessionId: string;
  at: number;
  body: string;
  actorId?: string;
}

/** 운영 로그/상태바에서 쓰는 실제 접속 스냅샷 */
export interface BroadcastConnectionSnapshot {
  at: number;
  socketConnected: boolean;
  activeSockets: number;
  composer: number;
  output: number;
  viewer: number;
  camerasSource: number;
  camerasViewer: number;
}

/**
 * 세션 클립 마커 종류
 *
 * 라이브 방송 중에 특별히 따로 저장해 둘 부분 (설교/찬양/특송 등) 을
 * 오퍼레이터가 in/out 으로 표시합니다.
 * 메인 녹화 파일은 손대지 않고 **타임스탬프 마커만** 남기므로
 * 세션 종료 후 라이브러리에서 필요한 구간만 잘라 썸네일 달고 YouTube 에
 * 올릴 수 있습니다.
 */
export type SessionClipKind =
  | 'sermon'              // 설교
  | 'choir'               // 성가대/찬양대
  | 'special-performance' // 특별연주
  | 'special-song'        // 특송
  | 'testimony'           // 간증
  | 'announcement'        // 광고/공지
  | 'other';              // 기타

/**
 * 세션 클립 마커
 * - `endedAt == null` 이면 "현재 마킹 중" (활성 클립)
 * - 메인 녹화 파일에 대한 in/out 타임스탬프를 남김
 * - 데스크탑 앱에서는 같은 구간을 별도 마커 파일로도 저장할 수 있음
 */
export interface SessionClipMarker {
  id: string;
  sessionId: string;
  kind: SessionClipKind;
  /** 사용자 표시용 라벨 (기본값은 kind → 한글 매핑) */
  label: string;
  /** 마커 시작 시각 (wall clock) */
  startedAt: number;
  /** 마커 종료 시각. null 이면 진행 중 */
  endedAt: number | null;
  /** 마킹을 시작한 오퍼레이터 */
  actorId?: string;
  /** 자유 메모 (예: "솔로이스트 김○○ 특송") */
  note?: string;
  /** 별도 마커 녹화 파일 저장 상태 */
  fileStatus?: 'recording' | 'ready' | 'failed';
  /** 별도 마커 녹화 파일 경로 (데스크탑 기준) */
  filePath?: string;
  /** 별도 마커 녹화 파일명 */
  fileName?: string;
  /** 별도 마커 녹화 파일 크기 */
  fileSize?: number;
  /** 별도 마커 녹화 MIME 타입 */
  mimeType?: string;
  /** 별도 마커 녹화 실패 메시지 */
  fileError?: string;
}

/**
 * ─────────────────────────────────────────
 * Scene Rack (송출 덱)
 * ─────────────────────────────────────────
 *
 * OBS Studio Mode 의 Scenes + Preview/Program 구도를 웹 대시보드에서
 * 구현하기 위한 타입들.
 *
 * 워크플로우:
 *   1) Scene Rack (카드 그리드) 에서 카드 선택 → `standbySceneId` 에 로드
 *   2) Standby Monitor 에서 대기 중인 카드 프리뷰 확인
 *   3) Take 버튼 → `programSceneId` 에 standby 값이 올라가고 실제 송출 교체
 *   4) "Back to Live" → `programSceneId = null` 로 실제 카메라 피드 복귀
 *
 * `programSceneId === null` 의 의미: Program 은 실제 카메라 피드 (일상 상태)
 * `programSceneId === 'scene-xxx'` 의 의미: 해당 Scene 카드가 덮어씌워진 상태
 */
export type SceneKind =
  | 'image'        // 이미지 슬라이드 (주보/공지/성경구절)
  | 'video'        // 프리레코딩 영상 (환영/광고/찬양 MR)
  | 'window'       // 브라우저/윈도우 캡처
  | 'camera'       // 서브 카메라 (드론/와이드/기타)
  | 'canvas'       // UnoLive Canvas 에서 만든 페이지
  | 'countdown'    // 카운트다운 타이머
  | 'audio-cover'  // 오디오 + 커버 이미지 (묵상 시간)
  | 'black';       // 검정/기술적 문제 카드

/**
 * Scene Rack 카드 1장.
 *
 * Phase 2B.2: 사용자가 직접 생성/삭제할 수 있는 소스 엔트리.
 * 타입별 설정 필드는 선택적이며, 런타임에는 데스크탑 쪽에서 해석합니다.
 */
export interface SceneCard {
  id: string;
  kind: SceneKind;
  label: string;
  /** 추가 설명 (예: "설교자 마이크 확인 중") */
  note?: string;
  /** 잠금 — Emergency/Black 처럼 실수 클릭 방지 */
  locked?: boolean;
  /** 기본 Scene Rack 에 포함된 시스템 카드 여부 (삭제 불가 · 수정 제한) */
  builtin?: boolean;
  /** 이 Scene 이 특정 예배 전용이면 worshipId. 비어있으면 항상 사용 가능(공용) */
  worshipId?: string;
  /** 생성 시각 (정렬/정리용) */
  createdAt?: number;
  /** 데스크탑 쪽 실제 소스 경로 힌트 (파일 기반) */
  sourcePath?: string;
  /** URL 기반 소스 (browser/image-url/video-url) */
  sourceUrl?: string;
  /** canvas kind 전용: UnoLive Canvas 에서 저장된 페이지 id */
  canvasPageId?: string;
  /** countdown kind 전용: 카운트다운 초 */
  durationSec?: number;
  /** camera/window kind 전용: 데스크탑 쪽 디바이스/창 id (Phase 2C+) */
  deviceId?: string;
  /** 대표 색 (썸네일 플레이스홀더 배경) */
  accentColor?: string;
}

/**
 * AddSceneModal 이 생성하는 payload — id/createdAt 은 store 가 채웁니다.
 */
export type NewSceneInput = Omit<SceneCard, 'id' | 'createdAt' | 'builtin'>;

/**
 * 브로드캐스트 세션 — 대시보드의 "지금 이 예배" 런타임 상태
 *
 * 실제로는 서버에만 존재해야 하는 데이터지만,
 * Phase 2A.2 에서는 mediaStore 에 목으로 유지합니다.
 */
export interface BroadcastSession {
  id: string;
  worshipId: string;
  /** 연결 상태 */
  syncStatus: ServerSyncStatus;
  /** 현재 Active Operator (1명만) */
  activeOperatorId: string | null;
  /** 함께 보고 있는 viewer 멤버 ids */
  viewerIds: string[];
  /** 녹화 */
  recording: RecordingRuntime;
  /** 라이브 */
  live: LiveRuntime;
  /** 오디오 레벨 */
  audioLevels: AudioLevelSnapshot[];
  /** 현재 자막 섹션 라벨 */
  currentSectionLabel?: string;
  /** 다음 섹션 라벨 */
  nextSectionLabel?: string;
  /** 세션 시작 시각 */
  openedAt: number;
  /** 이 세션 동안 마킹된 클립 구간 (메인 녹화 파일에 대한 비파괴 마커) */
  clipMarkers: SessionClipMarker[];
  /** 현재 마킹 진행 중인 클립 id (없으면 null) */
  activeClipId: string | null;
  /** Scene Rack — 준비된 송출 카드들 */
  scenes: SceneCard[];
  /** 현재 Program 에 올라가 있는 Scene id. null 이면 실제 카메라 피드(live) */
  programSceneId: string | null;
  /** 지금 Standby 에 올라가 있는 Scene id. null 이면 대기 비어 있음 */
  standbySceneId: string | null;
}

// ─────────────────────────────────────────
// 방송 라이브러리 (지난 세션 기록)
// ─────────────────────────────────────────

/** 지난 방송 1건. 세션이 종료되면 서버가 이 형태로 아카이브합니다. */
export interface BroadcastRecord {
  id: string;
  churchId: string;
  worshipTitle: string;
  /** 예: "2026-04-05 주일 대예배" */
  label: string;
  /** 실제 방송 시작/종료 시각 (= 녹화 in/out) */
  startedAt: number;
  endedAt: number;
  /** 녹화 품질 */
  quality: '1080p60' | '1080p30' | '720p60' | '720p30';
  /** 메인 녹화 파일 경로 (데스크탑 기준) */
  mainFilePath: string;
  /** 메인 녹화 파일 크기 */
  mainFileSize: number;
  /** 마킹된 클립 구간들 */
  clips: SessionClipMarker[];
  /** 썸네일 이미지 URL (Canvas 에서 만든 것) */
  thumbnailUrl?: string;
  /** YouTube 업로드 상태 */
  youtubeStatus: 'not-uploaded' | 'uploading' | 'uploaded' | 'failed';
  /** 업로드된 YouTube 영상 url (메인) */
  youtubeUrl?: string;
}

// ─────────────────────────────────────────
// 동기화 배지 (설정/캔버스)
// ─────────────────────────────────────────

/** 값이 어느 범위에서 공유되는가 */
export type SyncScope =
  | 'church'       // 교회 전체 공유
  | 'user'         // 개인 사용자별
  | 'local'        // 이 기기에만 (sync 제외)
  | 'desktop-only'; // UnoLive 데스크탑에만 의미 있음

export interface SyncMeta {
  scope: SyncScope;
  /** 마지막 동기화 시각 (null이면 미동기) */
  lastSyncedAt: number | null;
  /** 서버 대비 현재 로컬 상태 */
  status: 'synced' | 'syncing' | 'pending' | 'offline' | 'conflict';
}
