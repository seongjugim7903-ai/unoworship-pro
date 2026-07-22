/**
 * lib/media/mediaStore.ts
 * UnoMedia Zustand 스토어 — Phase 2A.1 (목 데이터 shell)
 *
 * 현재는 순수 클라이언트 목 데이터만 보관합니다.
 * 추후 API 계층이 생기면 `useMediaStore`는 서버 응답 캐시 역할만 맡고
 * 실제 상태는 tanstack-query 또는 RSC로 옮겨갈 수 있습니다.
 *
 * persist는 `authMode`, `activeChurchId`, `viewMode` 만 저장합니다.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type {
  AuthMode,
  BroadcastMemoEntry,
  BroadcastConnectionSnapshot,
  BroadcastRecord,
  BroadcastSession,
  BroadcastStats,
  ChatMessage,
  Church,
  Department,
  IncidentLogEntry,
  Member,
  Notice,
  QuickAction,
  NewSceneInput,
  SceneCard,
  SceneKind,
  SessionClipKind,
  SessionClipMarker,
  Worship,
  Activity,
  SyncMeta,
} from './mediaTypes';

// ─────────────────────────────────────────
// 클립 마커 기본 라벨 매핑
// ─────────────────────────────────────────
export const CLIP_KIND_LABEL: Record<SessionClipKind, string> = {
  sermon: '설교',
  choir: '찬양대',
  'special-performance': '특별연주',
  'special-song': '특송',
  testimony: '간증',
  announcement: '광고',
  other: '기타',
};

// ─────────────────────────────────────────
// Scene Rack — 카드 타입 기본 라벨 + 아이콘 힌트
// ─────────────────────────────────────────
export const SCENE_KIND_LABEL: Record<SceneKind, string> = {
  image: '이미지',
  video: '영상',
  window: '윈도우',
  camera: '서브캠',
  canvas: '캔버스',
  countdown: '카운트다운',
  'audio-cover': '오디오+커버',
  black: '검정/공지',
};

/** Scene 카드 타입별 아이콘 이모지 (플레이스홀더 썸네일) */
export const SCENE_KIND_ICON: Record<SceneKind, string> = {
  image: '🖼',
  video: '🎥',
  window: '📺',
  camera: '📷',
  canvas: '📖',
  countdown: '⏱',
  'audio-cover': '🎵',
  black: '⚫',
};

// ─────────────────────────────────────────
// SSR 노옵 스토리지
// ─────────────────────────────────────────
const noopStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

// ─────────────────────────────────────────
// 목 데이터 시드
// ─────────────────────────────────────────
const now = () => Date.now();
const daysLater = (n: number) => Date.now() + n * 86400_000;
const minutesAgo = (n: number) => Date.now() - n * 60_000;

/** 기본 교회 데이터 — DB에서 로드되기 전 placeholder */
const DEFAULT_CHURCH: Church = {
  id: 'church-sample',
  name: '',
  denomination: '',
  memberCount: 0,
  region: '',
  slogan: '',
};

const MOCK_DEPARTMENTS: Department[] = [
  { id: 'dept-media',      churchId: 'church-sample', name: '미디어부',     order: 0,                       leaderId: 'mem-2', color: '#7c3aed' },
  { id: 'dept-broadcast',  churchId: 'church-sample', name: '방송팀',       order: 1, parentId: 'dept-media', leaderId: 'mem-3', color: '#2563eb' },
  { id: 'dept-camera',     churchId: 'church-sample', name: '카메라팀',     order: 2, parentId: 'dept-media', leaderId: 'mem-4', color: '#0ea5e9' },
  { id: 'dept-audio',      churchId: 'church-sample', name: '음향팀',       order: 3, parentId: 'dept-media', leaderId: 'mem-5', color: '#f59e0b' },
  { id: 'dept-edit',       churchId: 'church-sample', name: '영상편집팀',   order: 4, parentId: 'dept-media', leaderId: 'mem-6', color: '#10b981' },
  { id: 'dept-praise',     churchId: 'church-sample', name: '찬양팀',       order: 5,                       leaderId: 'mem-7', color: '#ec4899' },
  { id: 'dept-conti',      churchId: 'church-sample', name: '콘티팀',       order: 6, parentId: 'dept-praise', leaderId: 'mem-8', color: '#f43f5e' },
];

const MOCK_MEMBERS: Member[] = [
  { id: 'mem-1',  churchId: 'church-sample', name: '담임목사',        role: 'head',      departmentIds: ['dept-media'],                online: true,  lastSeenAt: minutesAgo(1),   broadcastGrade: 'lead' },
  { id: 'mem-2',  churchId: 'church-sample', name: '박미디어',       role: 'director',  departmentIds: ['dept-media'],                online: true,  lastSeenAt: minutesAgo(2),   broadcastGrade: 'lead' },
  { id: 'mem-3',  churchId: 'church-sample', name: '이방송',         role: 'operator',  departmentIds: ['dept-broadcast'],            online: true,  lastSeenAt: minutesAgo(0),   broadcastGrade: 'operator' },
  { id: 'mem-4',  churchId: 'church-sample', name: '정카메라',       role: 'camera',    departmentIds: ['dept-camera'],               online: false, lastSeenAt: minutesAgo(120), broadcastGrade: 'viewer' },
  { id: 'mem-5',  churchId: 'church-sample', name: '최음향',         role: 'audio',     departmentIds: ['dept-audio'],                online: true,  lastSeenAt: minutesAgo(5),   broadcastGrade: 'operator' },
  { id: 'mem-6',  churchId: 'church-sample', name: '한편집',         role: 'editor',    departmentIds: ['dept-edit'],                 online: false, lastSeenAt: minutesAgo(300), broadcastGrade: 'viewer' },
  { id: 'mem-7',  churchId: 'church-sample', name: '오찬양',         role: 'conti',     departmentIds: ['dept-praise', 'dept-conti'], online: true,  lastSeenAt: minutesAgo(3),   broadcastGrade: 'viewer' },
  { id: 'mem-8',  churchId: 'church-sample', name: '윤콘티',         role: 'conti',     departmentIds: ['dept-conti'],                online: false, lastSeenAt: minutesAgo(60),  broadcastGrade: 'viewer' },
  { id: 'mem-9',  churchId: 'church-sample', name: '장자막',         role: 'subtitle',  departmentIds: ['dept-broadcast'],            online: true,  lastSeenAt: minutesAgo(4),   broadcastGrade: 'operator' },
  { id: 'mem-10', churchId: 'church-sample', name: '임봉사',         role: 'volunteer', departmentIds: ['dept-broadcast'],            online: false, lastSeenAt: minutesAgo(720), broadcastGrade: 'viewer' },
];

// ─────────────────────────────────────────
// 브로드캐스트 세션 목 데이터 (/media/broadcast)
// ─────────────────────────────────────────
const MOCK_SESSION: BroadcastSession = {
  id: 'sess-001',
  worshipId: 'wor-1',
  syncStatus: 'connected',
  activeOperatorId: 'mem-3', // 이방송
  viewerIds: ['mem-1', 'mem-2', 'mem-5'],
  // [FEATURE: YOUTUBE_LIVE] 초기 상태는 OFF — 담당자가 "라이브 시작" 버튼을 눌러야 활성화.
  //   이전에는 데모 데이터(active: true)로 대시보드 열자마자 방송 중처럼 보였음.
  recording: {
    active: false,
    startedAt: null,
    fileSize: 0,
    quality: '1080p60',
    outputPath: '~/Movies/UnoLive/',
  },
  live: {
    active: false,
    startedAt: null,
    provider: 'youtube',
    viewers: 0,
    bitrate: 0,
    health: 'good',
    streamKeyMask: '',
  },
  audioLevels: [
    { channel: 'mic',    label: 'Pulpit Mic', db: -8,  muted: false },
    { channel: 'bgm',    label: 'BGM',        db: -24, muted: false },
    { channel: 'system', label: 'PC System',  db: -18, muted: false },
    { channel: 'line',   label: 'Line In',    db: -60, muted: true  },
  ],
  currentSectionLabel: '② 설교 본론',
  nextSectionLabel: '③ 결단찬양',
  openedAt: minutesAgo(50),
  clipMarkers: [],
  activeClipId: null,
  // ── Scene Rack 초기 덱 (Phase 2B.2: 5개 기본 + 사용자 추가) ──
  // builtin=true 는 "기본 5개" 로 삭제 불가. 사용자가 '추가하기' 로 덧붙인 카드는
  // builtin=undefined 로 자유롭게 삭제할 수 있습니다.
  scenes: [
    {
      id: 'scene-welcome',
      kind: 'image',
      label: '환영 · 주보 이미지',
      note: '예배 시작 전 루프',
      accentColor: '#7c3aed',
      builtin: true,
      createdAt: minutesAgo(600),
    },
    {
      id: 'scene-hymn-mr',
      kind: 'audio-cover',
      label: '찬양 MR + 커버',
      accentColor: '#ec4899',
      builtin: true,
      createdAt: minutesAgo(600),
    },
    {
      id: 'scene-sermon-card',
      kind: 'canvas',
      label: '설교 제목 카드',
      note: 'Canvas: 설교 타이틀 템플릿',
      accentColor: '#0ea5e9',
      canvasPageId: 'canvas-sermon-title',
      builtin: true,
      createdAt: minutesAgo(600),
    },
    {
      id: 'scene-countdown',
      kind: 'countdown',
      label: '예배 시작 카운트다운',
      accentColor: '#8b5cf6',
      durationSec: 300,
      builtin: true,
      createdAt: minutesAgo(600),
    },
    {
      id: 'scene-tech',
      kind: 'black',
      label: '기술적 문제 발생',
      note: '긴급 복귀용',
      locked: true,
      accentColor: '#1f2937',
      builtin: true,
      createdAt: minutesAgo(600),
    },
  ],
  programSceneId: null,      // 시작 상태: 실제 카메라 피드
  standbySceneId: 'scene-sermon-card', // 데모: "설교 제목 카드" 를 대기
};

// ─────────────────────────────────────────
// 방송 라이브러리 목 (지난 세션 아카이브)
// ─────────────────────────────────────────
const MOCK_BROADCAST_RECORDS: BroadcastRecord[] = [
  {
    id: 'rec-001',
    churchId: 'church-sample',
    worshipTitle: '주일낮예배',
    label: '2026-04-05 주일낮예배',
    startedAt: Date.now() - 5 * 86400_000,
    endedAt:   Date.now() - 5 * 86400_000 + 98 * 60_000,
    quality: '1080p60',
    mainFilePath: '~/Movies/UnoLive/2026-04-05-주일낮예배.mp4',
    mainFileSize: 14_200_000_000,
    thumbnailUrl: undefined,
    youtubeStatus: 'uploaded',
    youtubeUrl: 'https://www.youtube.com/watch?v=sample1',
    clips: [
      {
        id: 'rec-001-clip-1', sessionId: 'rec-001', kind: 'choir',
        label: '찬양대 · 내 영혼의 그윽히 깊은 데서',
        startedAt: Date.now() - 5 * 86400_000 + 5 * 60_000,
        endedAt:   Date.now() - 5 * 86400_000 + 9 * 60_000,
      },
      {
        id: 'rec-001-clip-2', sessionId: 'rec-001', kind: 'special-song',
        label: '특송 · 엠마 선교 간증',
        startedAt: Date.now() - 5 * 86400_000 + 35 * 60_000,
        endedAt:   Date.now() - 5 * 86400_000 + 42 * 60_000,
      },
      {
        id: 'rec-001-clip-3', sessionId: 'rec-001', kind: 'sermon',
        label: '설교 · 시편 23편',
        startedAt: Date.now() - 5 * 86400_000 + 48 * 60_000,
        endedAt:   Date.now() - 5 * 86400_000 + 85 * 60_000,
      },
    ],
  },
  {
    id: 'rec-002',
    churchId: 'church-sample',
    worshipTitle: '수요예배',
    label: '2026-04-02 수요예배',
    startedAt: Date.now() - 8 * 86400_000,
    endedAt:   Date.now() - 8 * 86400_000 + 75 * 60_000,
    quality: '1080p30',
    mainFilePath: '~/Movies/UnoLive/2026-04-02-수요예배.mp4',
    mainFileSize: 8_900_000_000,
    youtubeStatus: 'not-uploaded',
    clips: [
      {
        id: 'rec-002-clip-1', sessionId: 'rec-002', kind: 'sermon',
        label: '설교 · 야고보서 1장',
        startedAt: Date.now() - 8 * 86400_000 + 20 * 60_000,
        endedAt:   Date.now() - 8 * 86400_000 + 65 * 60_000,
      },
    ],
  },
  {
    id: 'rec-003',
    churchId: 'church-sample',
    worshipTitle: '주일낮예배',
    label: '2026-03-29 주일낮예배',
    startedAt: Date.now() - 12 * 86400_000,
    endedAt:   Date.now() - 12 * 86400_000 + 105 * 60_000,
    quality: '1080p60',
    mainFilePath: '~/Movies/UnoLive/2026-03-29-주일낮예배.mp4',
    mainFileSize: 15_600_000_000,
    youtubeStatus: 'failed',
    clips: [
      {
        id: 'rec-003-clip-1', sessionId: 'rec-003', kind: 'choir',
        label: '찬양대 · 거룩 거룩 거룩',
        startedAt: Date.now() - 12 * 86400_000 + 3 * 60_000,
        endedAt:   Date.now() - 12 * 86400_000 + 7 * 60_000,
      },
      {
        id: 'rec-003-clip-2', sessionId: 'rec-003', kind: 'special-performance',
        label: '특별연주 · 오케스트라',
        startedAt: Date.now() - 12 * 86400_000 + 15 * 60_000,
        endedAt:   Date.now() - 12 * 86400_000 + 22 * 60_000,
      },
      {
        id: 'rec-003-clip-3', sessionId: 'rec-003', kind: 'testimony',
        label: '간증 · 김권사',
        startedAt: Date.now() - 12 * 86400_000 + 30 * 60_000,
        endedAt:   Date.now() - 12 * 86400_000 + 38 * 60_000,
      },
      {
        id: 'rec-003-clip-4', sessionId: 'rec-003', kind: 'sermon',
        label: '설교 · 마태복음 5:1-12',
        startedAt: Date.now() - 12 * 86400_000 + 45 * 60_000,
        endedAt:   Date.now() - 12 * 86400_000 + 92 * 60_000,
      },
    ],
  },
];

const MOCK_INCIDENTS: IncidentLogEntry[] = [];

// ─────────────────────────────────────────
// 동기화 상태 목 데이터
// ─────────────────────────────────────────
const MOCK_SYNC_META: Record<string, SyncMeta> = {
  'settings.general':   { scope: 'user',         lastSyncedAt: minutesAgo(3),  status: 'synced' },
  'settings.editor':    { scope: 'user',         lastSyncedAt: minutesAgo(3),  status: 'synced' },
  'settings.output':    { scope: 'church',       lastSyncedAt: minutesAgo(10), status: 'synced' },
  'settings.broadcast': { scope: 'church',       lastSyncedAt: minutesAgo(2),  status: 'synced' },
  'settings.shortcuts': { scope: 'user',         lastSyncedAt: minutesAgo(120), status: 'pending' },
  'settings.hardware':  { scope: 'desktop-only', lastSyncedAt: null,           status: 'offline' },
  'canvas.projects':    { scope: 'church',       lastSyncedAt: minutesAgo(1),  status: 'synced' },
};

const MOCK_WORSHIPS: Worship[] = [
  {
    id: 'wor-1',
    churchId: 'church-sample',
    type: 'sunday-main',
    title: '주일낮예배',
    startAt: daysLater(3),
    preacher: '담임목사',
    scripture: '요한복음 3:16',
    sermonTitle: '하나님이 세상을 이처럼 사랑하사',
    status: 'preparing',
    inputs: {
      bulletin: true,
      worshipConti: true,
      sermon: false,
      specialSong: false,
      announcements: true,
    },
    operatorId: 'mem-3',
    contiLeaderId: 'mem-7',
  },
  {
    id: 'wor-2',
    churchId: 'church-sample',
    type: 'wednesday',
    title: '수요예배',
    startAt: daysLater(6),
    preacher: '박부목사',
    scripture: '시편 23편',
    sermonTitle: '여호와는 나의 목자시니',
    status: 'draft',
    inputs: {
      bulletin: false,
      worshipConti: false,
      sermon: false,
      specialSong: false,
      announcements: false,
    },
    operatorId: 'mem-3',
  },
];

const MOCK_NOTICES: Notice[] = [
  {
    id: 'not-1',
    churchId: 'church-sample',
    authorId: 'mem-2',
    title: '주일낮예배 리허설 안내',
    body: '토요일 오후 3시에 본당에서 카메라/음향/자막 리허설을 진행합니다. 각 팀 책임자는 필수 참여 부탁드립니다.',
    priority: 'urgent',
    createdAt: minutesAgo(45),
    pinned: true,
  },
  {
    id: 'not-2',
    churchId: 'church-sample',
    authorId: 'mem-1',
    title: '이번 주 찬양콘티 방향',
    body: '본문 요한복음 3:16 맞춤으로 찬양 톤을 잡아주세요. "주 사랑은" 도입으로 어떨까요?',
    priority: 'normal',
    createdAt: minutesAgo(180),
  },
  {
    id: 'not-3',
    churchId: 'church-sample',
    authorId: 'mem-5',
    title: '음향 인터페이스 납품 완료',
    body: 'Focusrite Scarlett 2i2 + SM58 2대 방송실에 설치 완료. 다음 주일 방송부터 적용합니다.',
    priority: 'info',
    createdAt: minutesAgo(600),
  },
];

const MOCK_CHAT: ChatMessage[] = [
  { id: 'chat-1', churchId: 'church-sample', channelId: 'general', authorId: 'mem-2', body: '다들 주일 준비 잘 되고 계신가요?', createdAt: minutesAgo(30) },
  { id: 'chat-2', churchId: 'church-sample', channelId: 'general', authorId: 'mem-3', body: '저는 OBS 대신 UnoLive로 완전히 넘어왔어요 😊', createdAt: minutesAgo(28) },
  { id: 'chat-3', churchId: 'church-sample', channelId: 'general', authorId: 'mem-7', body: '찬양콘티 방금 1차 확정했습니다. 확인 부탁드려요!', createdAt: minutesAgo(20), system: false },
  { id: 'chat-4', churchId: 'church-sample', channelId: 'general', authorId: 'system', body: '오찬양님이 찬양콘티를 확정했습니다.', createdAt: minutesAgo(20), system: true },
  { id: 'chat-5', churchId: 'church-sample', channelId: 'general', authorId: 'mem-9', body: '자막 템플릿 새 버전 미디어 라이브러리에 올려두었어요.', createdAt: minutesAgo(10) },
];

const MOCK_ACTIVITIES: Activity[] = [
  { id: 'act-1', churchId: 'church-sample', type: 'input-completed', actorId: 'mem-7', targetId: 'wor-1', message: '오찬양님이 찬양콘티를 확정했습니다', createdAt: minutesAgo(20) },
  { id: 'act-2', churchId: 'church-sample', type: 'input-completed', actorId: 'mem-2', targetId: 'wor-1', message: '박미디어님이 주보를 업로드했습니다', createdAt: minutesAgo(90) },
  { id: 'act-3', churchId: 'church-sample', type: 'notice-posted',   actorId: 'mem-2',                    message: '박미디어님이 공지 "주일낮예배 리허설 안내"를 게시했습니다', createdAt: minutesAgo(45) },
  { id: 'act-4', churchId: 'church-sample', type: 'member-online',   actorId: 'mem-3',                    message: '이방송님이 온라인 상태가 되었습니다', createdAt: minutesAgo(2) },
  { id: 'act-5', churchId: 'church-sample', type: 'live-ended',                                            message: '지난 주일낮예배 송출이 종료되었습니다 (1시간 42분)', createdAt: minutesAgo(60 * 24 * 4) },
];

const MOCK_STATS: BroadcastStats = {
  totalBroadcasts: 142,
  monthBroadcasts: 12,
  totalViewers: 8420,
  avgConcurrent: 38,
  weeklyTrend: [1, 0, 1, 2, 1, 0, 2],
  onlineMemberCount: MOCK_MEMBERS.filter((m) => m.online).length,
};

const MOCK_QUICK_ACTIONS: QuickAction[] = [
  { id: 'qa-conti',      label: '찬양콘티 작성', icon: 'conti',     href: '/media/dashboard/worship-conti', badge: '진행중' },
  { id: 'qa-bulletin',   label: '주보 업로드',   icon: 'bulletin',  href: '/media/dashboard/bulletin' },
  { id: 'qa-sermon',     label: '설교 자료',     icon: 'sermon',    href: '/media/dashboard/sermon' },
  { id: 'qa-choir',      label: '찬양대 자막 요청', icon: 'choir', href: '/media/fellowship?tab=choir-subtitle' },
  { id: 'qa-library',    label: '미디어 라이브러리', icon: 'library',  href: '/media/library' },
  { id: 'qa-team',       label: '팀 관리',       icon: 'member',    href: '/media/team', requiredRoles: ['head', 'director'] },
];

// ─────────────────────────────────────────
// 스토어 인터페이스
// ─────────────────────────────────────────
interface MediaStoreState {
  // 인증 (목)
  authMode: AuthMode;
  currentMemberId: string | null;
  setAuthMode: (mode: AuthMode) => void;
  loginAsMember: (memberId: string) => void;
  loginAsOperator: () => void;
  logout: () => void;

  // 활성 교회
  activeChurchId: string;

  // 데이터 (읽기 전용 목)
  churches: Church[];
  departments: Department[];
  members: Member[];
  worships: Worship[];
  notices: Notice[];
  chatMessages: ChatMessage[];
  activities: Activity[];
  stats: BroadcastStats;
  quickActions: QuickAction[];

  // 브로드캐스트 세션 (대시보드)
  session: BroadcastSession;
  incidents: IncidentLogEntry[];
  sessionMemos: BroadcastMemoEntry[];
  connectionSnapshot: BroadcastConnectionSnapshot | null;
  /** 지난 세션 아카이브 (라이브러리) */
  broadcastRecords: BroadcastRecord[];

  // 동기화 메타
  syncMeta: Record<string, SyncMeta>;

  // 단순 액션 (채팅 추가 등 로컬 상태)
  sendChatMessage: (body: string) => void;

  // 브로드캐스트 제어 (목)
  /** 라이브 방송 원클릭 시작: 현재는 YouTube/RTMP 송출만 ON */
  startLiveSession: () => void;
  /** 라이브 방송 원클릭 종료: 송출만 OFF. 예배순서 마킹/녹화는 별도로 유지 */
  endLiveSession: () => void;
  /** 로컬 녹화 런타임 시작 */
  startRecordingSession: (input: {
    startedAt: number;
    quality: BroadcastSession['recording']['quality'];
    outputPath?: string;
    fileName?: string;
    mimeType?: string;
  }) => void;
  /** 로컬 녹화 파일 크기 갱신 */
  updateRecordingProgress: (fileSize: number) => void;
  /** 로컬 녹화 완료 + 방송 라이브러리에 기록 추가 */
  finishRecordingSession: (input: {
    endedAt: number;
    filePath: string;
    fileSize: number;
    fileName?: string;
    mimeType?: string;
  }) => void;
  /** 로컬 녹화 실패 */
  failRecordingSession: (message: string) => void;
  /** 내부: 레거시 토글. 실제 녹화는 Recording 패널에서 제어한다. */
  toggleRecording: () => void;
  /** 내부: 라이브 단일 토글 (일반적으로는 startLiveSession 사용) */
  toggleLive: () => void;
  /** 예배순서/클립 마킹 시작 (녹화와 별도 운용) */
  startClipMarker: (kind: SessionClipKind, label?: string) => void;
  /** 활성 클립 마킹 종료 */
  endClipMarker: () => void;
  /** 클립 라벨/노트/저장 상태 수정 */
  updateClipMarker: (id: string, patch: Partial<Pick<
    SessionClipMarker,
    'label'
    | 'note'
    | 'kind'
    | 'fileStatus'
    | 'filePath'
    | 'fileName'
    | 'fileSize'
    | 'mimeType'
    | 'fileError'
  >>) => void;
  /** 클립 삭제 */
  deleteClipMarker: (id: string) => void;
  recordIncident: (
    level: IncidentLogEntry['level'],
    message: string,
    category?: IncidentLogEntry['category'],
    options?: { actorId?: string | null }
  ) => void;
  addSessionMemo: (body: string) => void;
  deleteSessionMemo: (id: string) => void;
  setConnectionSnapshot: (snapshot: BroadcastConnectionSnapshot) => void;
  takeOperatorControl: (memberId: string) => void;
  releaseOperatorControl: () => void;
  setSessionSyncStatus: (status: BroadcastSession['syncStatus']) => void;

  // ── Scene Rack / Standby / Take ──
  /** Scene 카드를 Standby 에 로드 (null 이면 대기 비우기) */
  loadSceneToStandby: (sceneId: string | null) => void;
  /** Take! — Standby 에 있는 Scene 을 Program 으로 올림 (송출 교체) */
  takeStandbyToProgram: () => void;
  /** Program ↔ Standby 역할 교체 (실제 송출은 유지) */
  swapProgramStandby: () => void;
  /** 실제 카메라 피드(live) 로 복귀 — program = null */
  returnProgramToLive: () => void;
  /** Emergency — Scene 카드를 즉시 Program 으로 cut (잠금 우회) */
  emergencyCutToScene: (sceneId: string) => void;
  /** Scene 카드 잠금 토글 (lead 권한만) */
  toggleSceneLock: (sceneId: string) => void;
  /** Scene 카드 추가 — 사용자가 AddSceneModal 로 생성 */
  addScene: (input: NewSceneInput) => string;
  /** Scene 카드 삭제 — builtin 카드는 거부. program/standby 참조는 함께 정리 */
  removeScene: (sceneId: string) => void;
  /** Scene 카드 라벨/노트/색 수정 */
  updateScene: (sceneId: string, patch: Partial<Pick<SceneCard, 'label' | 'note' | 'accentColor' | 'sourceUrl' | 'durationSec' | 'canvasPageId'>>) => void;

  // ── 셀렉터 헬퍼 ──
  // ⚠ 여기에 배열을 새로 만들어 돌려주는 selector 는 절대 넣지 마세요.
  //   React 19 의 useSyncExternalStore 는 getSnapshot 이 안정된 참조를
  //   돌려주길 요구합니다. `.map()`/`.filter()` 로 만든 새 배열은 매 호출마다
  //   새 참조 → 무한 리렌더. 파생 배열은 컴포넌트에서 useMemo 로 만드세요.
  getActiveChurch: () => Church | undefined;
  getCurrentMember: () => Member | undefined;
  getNextWorship: () => Worship | undefined;
  getSessionWorship: () => Worship | undefined;
  getActiveOperator: () => Member | undefined;
  /** 현재 활성 클립 마커 (마킹 중인 구간) */
  getActiveClipMarker: () => SessionClipMarker | undefined;
  /** 특정 세션의 라이브러리 레코드 */
  getBroadcastRecord: (id: string) => BroadcastRecord | undefined;
  /** Program 에 올라가 있는 Scene (없으면 undefined = 실제 카메라) */
  getProgramScene: () => SceneCard | undefined;
  /** Standby 에 올라가 있는 Scene (없으면 undefined) */
  getStandbyScene: () => SceneCard | undefined;
  /** 특정 id 로 Scene 카드 찾기 */
  getScene: (id: string | null) => SceneCard | undefined;
  /** 현재 사용자가 대시보드에 접근 가능한가 */
  canAccessBroadcast: () => boolean;
  /** 현재 사용자가 직접 조작 (start/stop) 가능한가 */
  canControlBroadcast: () => boolean;
  /** 현재 사용자가 Lead 권한 (설정변경/권한이양) 을 가지는가 */
  canLeadBroadcast: () => boolean;

  // ── DB 연동 ──
  /** Supabase churches 테이블에서 교회 정보를 불러와 스토어에 반영 */
  loadChurchFromDB: () => Promise<void>;

  // ── [FEATURE: TRANSITIONS] Scene 전환 효과 ──
  /** 사용자가 선택한 전환 타입·지속시간 (UI 기본값, persist 됨) */
  transitionConfig: TransitionConfig;
  /** 전환 설정 변경 */
  setTransitionConfig: (patch: Partial<TransitionConfig>) => void;
  /** 진행 중인 전환 — null 이면 정적 상태 (전환 중 아님) */
  activeTransition: ActiveTransition | null;
}

// ── [FEATURE: TRANSITIONS] 전환 타입 ──
//   cut           : 즉시 교체
//   fade          : 크로스페이드 (동시 opacity 교차)
//   slide         : 오른쪽 → 왼쪽 슬라이드
//   dip-to-black  : 검정 경유 페이드 (out → black → in 순차)
export type TransitionType = 'cut' | 'fade' | 'slide' | 'dip-to-black';

export interface TransitionConfig {
  type: TransitionType;
  /** 밀리초. cut 일 때는 0 강제. */
  duration: number;
}

export interface ActiveTransition {
  /** 전환 시작 시점의 Program 씬 id (페이드아웃 대상, null 이면 BroadcastFeed) */
  fromSceneId: string | null;
  /** 전환 종료 후 Program 에 설정될 씬 id (페이드인 대상, null 이면 BroadcastFeed 로 복귀) */
  toSceneId: string | null;
  type: Exclude<TransitionType, 'cut'>;
  duration: number;
  startedAt: number;
}

// ─────────────────────────────────────────
// [FEATURE: TRANSITIONS] Program 씬 전환 실행 헬퍼
//   - transitionConfig.type === 'cut' 이면 즉시 교체
//   - 그 외 (fade/slide) 는 activeTransition 상태를 켜고 duration 후 최종 적용
// ─────────────────────────────────────────
function runProgramTransition(
  get: () => MediaStoreState,
  set: (partial: Partial<MediaStoreState>) => void,
  toSceneId: string | null,
  logMessage: string,
): void {
  const state = get();
  const config = state.transitionConfig;
  const fromSceneId = state.session.programSceneId;

  // 동일 씬이면 noop
  if (fromSceneId === toSceneId) return;

  // Cut 또는 지속시간 0 → 즉시 교체
  if (config.type === 'cut' || config.duration <= 0) {
    set({
      session: { ...state.session, programSceneId: toSceneId },
      activeTransition: null,
    });
    state.recordIncident('info', logMessage, 'broadcast');
    return;
  }

  // 진행 중인 전환이 있다면 강제 종료 (종료 타이머 보장)
  const startedAt = Date.now();
  set({
    activeTransition: {
      fromSceneId,
      toSceneId,
      type: config.type,
      duration: config.duration,
      startedAt,
    },
  });
  state.recordIncident(
    'info',
    `${logMessage} [${config.type.toUpperCase()} ${config.duration}ms]`,
    'broadcast'
  );

  // duration 후 최종 반영 (다른 전환으로 덮여진 경우 skip)
  setTimeout(() => {
    const current = get();
    if (current.activeTransition?.startedAt !== startedAt) return;
    set({
      session: { ...current.session, programSceneId: toSceneId },
      activeTransition: null,
    });
  }, config.duration);
}

// ─────────────────────────────────────────
// 스토어 구현
// ─────────────────────────────────────────
export const useMediaStore = create<MediaStoreState>()(
  persist(
    (set, get) => ({
      // 인증
      authMode: 'guest',
      currentMemberId: null,

      setAuthMode: (mode) => set({ authMode: mode }),

      loginAsMember: (memberId) => {
        const found = get().members.find((m) => m.id === memberId);
        if (!found) return;
        set({
          authMode: found.role === 'operator' ? 'operator' : 'member',
          currentMemberId: memberId,
        });
      },

      loginAsOperator: () => {
        const op = get().members.find((m) => m.role === 'operator');
        set({
          authMode: 'operator',
          currentMemberId: op?.id ?? null,
        });
      },

      logout: () => {
        // Supabase 로그아웃 (브라우저 환경에서만)
        if (typeof window !== 'undefined') {
          import('@/lib/supabase/browser').then(({ createClient }) => {
            createClient()?.auth.signOut();
          });
        }
        set({ authMode: 'guest', currentMemberId: null });
      },

      // 활성 교회
      activeChurchId: 'church-sample',

      // 데이터 (시드)
      churches: [DEFAULT_CHURCH],
      departments: MOCK_DEPARTMENTS,
      members: MOCK_MEMBERS,
      worships: MOCK_WORSHIPS,
      notices: MOCK_NOTICES,
      chatMessages: MOCK_CHAT,
      activities: MOCK_ACTIVITIES,
      stats: MOCK_STATS,
      quickActions: MOCK_QUICK_ACTIONS,

      session: MOCK_SESSION,
      incidents: MOCK_INCIDENTS,
      sessionMemos: [],
      connectionSnapshot: null,
      broadcastRecords: MOCK_BROADCAST_RECORDS,
      syncMeta: MOCK_SYNC_META,

      // 채팅 로컬 추가
      sendChatMessage: (body) => {
        const state = get();
        const authorId = state.currentMemberId ?? 'mem-3';
        const msg: ChatMessage = {
          id: `chat-${now()}`,
          churchId: state.activeChurchId,
          channelId: 'general',
          authorId,
          body,
          createdAt: now(),
        };
        set({ chatMessages: [...state.chatMessages, msg] });
      },

      // ── 브로드캐스트 제어 (목) ──
      // 현재 실제 구현은 RTMP 라이브 송출이다. 로컬 파일 녹화는 Recording 패널에서 별도로 제어한다.
      startLiveSession: () => {
        const state = get();
        if (!state.canControlBroadcast()) return;
        if (state.session.syncStatus !== 'connected') return;
        const startedAt = Date.now();
        set({
          session: {
            ...state.session,
            live: {
              ...state.session.live,
              active: true,
              startedAt,
              viewers: 0,
              health: 'good',
            },
          },
        });
        state.recordIncident('info', '라이브 송출 시작', 'live');
      },

      endLiveSession: () => {
        const state = get();
        if (!state.canControlBroadcast()) return;
        set({
          session: {
            ...state.session,
            live: {
              ...state.session.live,
              active: false,
              startedAt: null,
              viewers: 0,
            },
          },
        });
        get().recordIncident('info', '라이브 송출 종료', 'live');
      },

      startRecordingSession: (input) => {
        const state = get();
        if (!state.canControlBroadcast()) return;
        set({
          session: {
            ...state.session,
            recording: {
              ...state.session.recording,
              active: true,
              startedAt: input.startedAt,
              fileSize: 0,
              quality: input.quality,
              outputPath: input.outputPath,
              fileName: input.fileName,
              mimeType: input.mimeType,
              lastError: undefined,
            },
          },
        });
        state.recordIncident(
          'info',
          `로컬 녹화 시작: ${input.fileName ?? '새 녹화 파일'}`,
          'recording'
        );
      },

      updateRecordingProgress: (fileSize) => {
        const state = get();
        if (!state.session.recording.active) return;
        set({
          session: {
            ...state.session,
            recording: {
              ...state.session.recording,
              fileSize,
            },
          },
        });
      },

      finishRecordingSession: (input) => {
        const state = get();
        const startedAt = state.session.recording.startedAt ?? input.endedAt;
        const worship = state.worships.find((w) => w.id === state.session.worshipId);
        const fileName = input.fileName ?? state.session.recording.fileName ?? 'UnoLive recording';
        const record: BroadcastRecord = {
          id: `rec-${now()}`,
          churchId: state.activeChurchId,
          worshipTitle: worship?.title ?? '예배 녹화',
          label: fileName.replace(/\.[^.]+$/, ''),
          startedAt,
          endedAt: input.endedAt,
          quality: state.session.recording.quality,
          mainFilePath: input.filePath,
          mainFileSize: input.fileSize,
          clips: state.session.clipMarkers,
          youtubeStatus: 'not-uploaded',
        };
        set({
          session: {
            ...state.session,
            recording: {
              ...state.session.recording,
              active: false,
              startedAt: null,
              fileSize: input.fileSize,
              outputPath: input.filePath,
              fileName,
              mimeType: input.mimeType ?? state.session.recording.mimeType,
              lastError: undefined,
            },
          },
          broadcastRecords: [record, ...state.broadcastRecords],
        });
        state.recordIncident('info', `로컬 녹화 저장 완료: ${fileName}`, 'recording');
      },

      failRecordingSession: (message) => {
        const state = get();
        set({
          session: {
            ...state.session,
            recording: {
              ...state.session.recording,
              active: false,
              startedAt: null,
              lastError: message,
            },
          },
        });
        state.recordIncident('error', `로컬 녹화 실패: ${message}`, 'recording');
      },

      toggleRecording: () => {
        const state = get();
        if (!state.canControlBroadcast()) return;
        state.recordIncident(
          'warn',
          '로컬 녹화는 우측 Recording 패널에서 별도로 시작해 주세요',
          'recording'
        );
      },

      toggleLive: () => {
        const state = get();
        if (!state.canControlBroadcast()) return;
        const next = !state.session.live.active;
        set({
          session: {
            ...state.session,
            live: {
              ...state.session.live,
              active: next,
              startedAt: next ? Date.now() : null,
              viewers: next ? state.session.live.viewers : 0,
            },
          },
        });
        state.recordIncident(
          'info',
          next ? 'YouTube 라이브 연결 시도' : '라이브 종료',
          'live'
        );
      },

      // ── 클립 마커 ──
      startClipMarker: (kind, label) => {
        const state = get();
        if (!state.canControlBroadcast()) return;
        // 이미 활성 클립이 있으면 먼저 종료
        let clips = state.session.clipMarkers;
        if (state.session.activeClipId) {
          clips = clips.map((c) =>
            c.id === state.session.activeClipId && c.endedAt === null
              ? { ...c, endedAt: Date.now() }
              : c
          );
        }
        const fallbackLabel = CLIP_KIND_LABEL[kind];
        const newClip: SessionClipMarker = {
          id: `clip-${now()}`,
          sessionId: state.session.id,
          kind,
          label: label?.trim() ? label.trim() : fallbackLabel,
          startedAt: Date.now(),
          endedAt: null,
          actorId: state.currentMemberId ?? undefined,
        };
        set({
          session: {
            ...state.session,
            clipMarkers: [...clips, newClip],
            activeClipId: newClip.id,
          },
        });
        state.recordIncident('info', `클립 마킹 시작: ${newClip.label}`, 'recording');
      },

      endClipMarker: () => {
        const state = get();
        if (!state.canControlBroadcast()) return;
        const activeId = state.session.activeClipId;
        if (!activeId) return;
        const target = state.session.clipMarkers.find((c) => c.id === activeId);
        const endedAt = Date.now();
        set({
          session: {
            ...state.session,
            clipMarkers: state.session.clipMarkers.map((c) =>
              c.id === activeId && c.endedAt === null ? { ...c, endedAt } : c
            ),
            activeClipId: null,
          },
        });
        if (target) {
          const durSec = Math.max(1, Math.round((endedAt - target.startedAt) / 1000));
          const m = Math.floor(durSec / 60);
          const s = durSec % 60;
          state.recordIncident(
            'info',
            `클립 마킹 종료: ${target.label} (${m}분 ${s}초)`,
            'recording'
          );
        }
      },

      updateClipMarker: (id, patch) => {
        const state = get();
        if (!state.canControlBroadcast()) return;
        set({
          session: {
            ...state.session,
            clipMarkers: state.session.clipMarkers.map((c) =>
              c.id === id ? { ...c, ...patch } : c
            ),
          },
        });
      },

      deleteClipMarker: (id) => {
        const state = get();
        if (!state.canControlBroadcast()) return;
        const target = state.session.clipMarkers.find((c) => c.id === id);
        set({
          session: {
            ...state.session,
            clipMarkers: state.session.clipMarkers.filter((c) => c.id !== id),
            activeClipId:
              state.session.activeClipId === id ? null : state.session.activeClipId,
          },
        });
        if (target) {
          state.recordIncident('warn', `클립 마커 삭제: ${target.label}`, 'recording');
        }
      },

      recordIncident: (level, message, category, options) => {
        const state = get();
        const entry: IncidentLogEntry = {
          id: `inc-${now()}`,
          sessionId: state.session.id,
          at: now(),
          level,
          category,
          message,
          actorId:
            options?.actorId === null
              ? undefined
              : options?.actorId ?? state.currentMemberId ?? undefined,
        };
        set({ incidents: [...state.incidents, entry] });
      },

      addSessionMemo: (body) => {
        const state = get();
        const trimmed = body.trim();
        if (!trimmed) return;
        const entry: BroadcastMemoEntry = {
          id: `memo-${now()}`,
          sessionId: state.session.id,
          at: now(),
          body: trimmed,
          actorId: state.currentMemberId ?? undefined,
        };
        set({ sessionMemos: [...state.sessionMemos, entry] });
      },

      deleteSessionMemo: (id) => {
        const state = get();
        set({ sessionMemos: state.sessionMemos.filter((memo) => memo.id !== id) });
      },

      setConnectionSnapshot: (snapshot) => {
        set({ connectionSnapshot: snapshot });
      },

      takeOperatorControl: (memberId) => {
        const state = get();
        if (!state.canLeadBroadcast()) return;
        const target = state.members.find((m) => m.id === memberId);
        if (!target) return;
        set({
          session: { ...state.session, activeOperatorId: memberId },
        });
        state.recordIncident(
          'info',
          `${target.name}님이 오퍼레이터 권한을 부여받았습니다`,
          'system'
        );
      },

      releaseOperatorControl: () => {
        const state = get();
        if (!state.canLeadBroadcast()) return;
        set({ session: { ...state.session, activeOperatorId: null } });
        state.recordIncident('warn', '오퍼레이터 권한이 해제되었습니다', 'system');
      },

      setSessionSyncStatus: (status) =>
        set((s) => ({ session: { ...s.session, syncStatus: status } })),

      // ── [FEATURE: TRANSITIONS] Scene 전환 설정 + 진행 상태 ──
      transitionConfig: { type: 'cut', duration: 500 },
      setTransitionConfig: (patch) => {
        const current = get().transitionConfig;
        const next: TransitionConfig = {
          ...current,
          ...patch,
          // cut 이면 duration 강제 0
          duration: (patch.type ?? current.type) === 'cut' ? 0 : (patch.duration ?? current.duration),
        };
        set({ transitionConfig: next });
      },
      activeTransition: null,

      // ── Scene Rack / Standby / Take ──
      loadSceneToStandby: (sceneId) => {
        const state = get();
        if (!state.canControlBroadcast()) return;
        // 잠긴 카드는 standby 에 올릴 수 없음 (emergency 는 별도 경로)
        if (sceneId) {
          const target = state.session.scenes.find((s) => s.id === sceneId);
          if (!target) return;
          if (target.locked) {
            state.recordIncident(
              'warn',
              `잠긴 Scene "${target.label}" 은 직접 로드할 수 없습니다 (Emergency 로만 전환 가능)`,
              'broadcast'
            );
            return;
          }
        }
        set({
          session: { ...state.session, standbySceneId: sceneId },
        });
      },

      takeStandbyToProgram: () => {
        const state = get();
        if (!state.canControlBroadcast()) return;
        const standbyId = state.session.standbySceneId;
        if (!standbyId) return;
        const target = state.session.scenes.find((s) => s.id === standbyId);
        if (!target) return;
        runProgramTransition(get, set, standbyId, `Take: Program ← "${target.label}"`);
      },

      swapProgramStandby: () => {
        const state = get();
        if (!state.canControlBroadcast()) return;
        const { programSceneId, standbySceneId } = state.session;
        // swap 은 단순 교체 — 양쪽이 동시에 바뀌므로 전환 효과 없이 즉시
        set({
          session: {
            ...state.session,
            programSceneId: standbySceneId,
            standbySceneId: programSceneId,
          },
        });
        state.recordIncident('info', 'Program ↔ Standby 역할 교체', 'broadcast');
      },

      returnProgramToLive: () => {
        const state = get();
        if (!state.canControlBroadcast()) return;
        if (state.session.programSceneId === null) return;
        runProgramTransition(get, set, null, '송출 복귀: Program → 실제 카메라 피드');
      },

      emergencyCutToScene: (sceneId) => {
        const state = get();
        if (!state.canControlBroadcast()) return;
        const target = state.session.scenes.find((s) => s.id === sceneId);
        if (!target) return;
        set({
          session: {
            ...state.session,
            programSceneId: sceneId,
            standbySceneId: state.session.standbySceneId,
          },
        });
        state.recordIncident(
          'error',
          `🚨 긴급 송출 전환: "${target.label}" 로 즉시 cut`,
          'broadcast'
        );
      },

      toggleSceneLock: (sceneId) => {
        const state = get();
        if (!state.canLeadBroadcast()) return;
        set({
          session: {
            ...state.session,
            scenes: state.session.scenes.map((s) =>
              s.id === sceneId ? { ...s, locked: !s.locked } : s
            ),
          },
        });
      },

      addScene: (input) => {
        const state = get();
        if (!state.canControlBroadcast()) return '';
        const id = `scene-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
        const newScene: SceneCard = {
          ...input,
          id,
          createdAt: Date.now(),
        };
        set({
          session: {
            ...state.session,
            scenes: [...state.session.scenes, newScene],
          },
        });
        state.recordIncident(
          'info',
          `Scene 추가: "${newScene.label}" (${SCENE_KIND_LABEL[newScene.kind]})`,
          'broadcast'
        );
        return id;
      },

      removeScene: (sceneId) => {
        const state = get();
        if (!state.canControlBroadcast()) return;
        const target = state.session.scenes.find((s) => s.id === sceneId);
        if (!target) return;
        if (target.builtin) {
          state.recordIncident(
            'warn',
            `기본 Scene "${target.label}" 은 삭제할 수 없습니다`,
            'broadcast'
          );
          return;
        }
        // program/standby 에 연결되어 있으면 해당 슬롯도 비움
        const nextProgram =
          state.session.programSceneId === sceneId ? null : state.session.programSceneId;
        const nextStandby =
          state.session.standbySceneId === sceneId ? null : state.session.standbySceneId;
        set({
          session: {
            ...state.session,
            scenes: state.session.scenes.filter((s) => s.id !== sceneId),
            programSceneId: nextProgram,
            standbySceneId: nextStandby,
          },
        });
        state.recordIncident('warn', `Scene 삭제: "${target.label}"`, 'broadcast');
      },

      updateScene: (sceneId, patch) => {
        const state = get();
        if (!state.canControlBroadcast()) return;
        set({
          session: {
            ...state.session,
            scenes: state.session.scenes.map((s) =>
              s.id === sceneId ? { ...s, ...patch } : s
            ),
          },
        });
      },

      // 셀렉터
      getActiveChurch: () => {
        const { churches, activeChurchId } = get();
        return churches.find((c) => c.id === activeChurchId);
      },

      getCurrentMember: () => {
        const { members, currentMemberId } = get();
        if (!currentMemberId) return undefined;
        return members.find((m) => m.id === currentMemberId);
      },

      getNextWorship: () => {
        const { worships } = get();
        const future = worships
          .filter((w) => w.startAt > now() && w.status !== 'archived')
          .sort((a, b) => a.startAt - b.startAt);
        return future[0];
      },

      getSessionWorship: () => {
        const { worships, session } = get();
        return worships.find((w) => w.id === session.worshipId);
      },

      getActiveOperator: () => {
        const { members, session } = get();
        if (!session.activeOperatorId) return undefined;
        return members.find((m) => m.id === session.activeOperatorId);
      },

      getActiveClipMarker: () => {
        const { session } = get();
        if (!session.activeClipId) return undefined;
        return session.clipMarkers.find((c) => c.id === session.activeClipId);
      },

      getBroadcastRecord: (id) => get().broadcastRecords.find((r) => r.id === id),

      getScene: (id) => {
        if (!id) return undefined;
        return get().session.scenes.find((s) => s.id === id);
      },
      getProgramScene: () => {
        const { session } = get();
        if (!session.programSceneId) return undefined;
        return session.scenes.find((s) => s.id === session.programSceneId);
      },
      getStandbyScene: () => {
        const { session } = get();
        if (!session.standbySceneId) return undefined;
        return session.scenes.find((s) => s.id === session.standbySceneId);
      },

      canAccessBroadcast: () => {
        const current = get().getCurrentMember();
        // 비로그인은 접근 불가
        if (!current) return false;
        // Phase 2A.2: 미디어팀 소속이면 최소 viewer 로 접근 가능
        return Boolean(current.broadcastGrade);
      },

      canControlBroadcast: () => {
        const state = get();
        const current = state.getCurrentMember();
        if (!current) return false;
        // operator/lead 이면서 Active Operator 이거나 Active Operator 가 없는 상태
        const grade = current.broadcastGrade;
        if (grade === 'viewer') return false;
        if (grade === 'lead') return true;
        // operator: 내가 Active Operator 일 때만
        return state.session.activeOperatorId === current.id;
      },

      canLeadBroadcast: () => {
        const current = get().getCurrentMember();
        return current?.broadcastGrade === 'lead';
      },

      // ── DB 연동 ──
      loadChurchFromDB: async () => {
        try {
          const res = await fetch('/api/church');
          if (!res.ok) return;
          const { church } = await res.json();
          if (!church) return;

          const updated: Church = {
            id: church.id ?? 'church-sample',
            name: church.name ?? '',
            seniorPastor: church.senior_pastor ?? '',
            denomination: church.denomination ?? '',
            region: church.region ?? '',
            memberCount: church.member_count ?? 0,
            slogan: church.slogan ?? '',
          };

          set((state) => {
            const idx = state.churches.findIndex(
              (c) => c.id === 'church-sample' || c.id === updated.id
            );
            const next = [...state.churches];
            if (idx >= 0) {
              next[idx] = updated;
            } else {
              next.push(updated);
            }
            return { churches: next, activeChurchId: updated.id };
          });
        } catch {
          // 네트워크 오류 무시 — 기본값 유지
        }
      },
    }),
    {
      name: 'unoMedia-store',
      storage: createJSONStorage(() =>
        typeof window !== 'undefined' ? localStorage : noopStorage
      ),
      partialize: (state) => ({
        authMode: state.authMode,
        currentMemberId: state.currentMemberId,
        activeChurchId: state.activeChurchId,
        transitionConfig: state.transitionConfig,
        sessionMemos: state.sessionMemos,
      }),
    }
  )
);
