# UnoLive Broadcast — 송출 모듈

**원맨 방송을 운영하는 소형 교회를 위한 통합 송출 솔루션**

---

## 비전

UnoLive만으로 녹화 + 유튜브 라이브 송출을 완전히 해결.
OBS, 별도 캡처카드, ATEM 없이도 한 사람이 방송을 운영할 수 있도록 합니다.

### 타겟 시나리오
- 작은 교회 예배 영상을 담당자 1명이 운영
- UnoLive 데스크탑(Electron) 또는 미디어 웹포털에서 접근
- 외부 프로그램 의존 없이 스트림 키만 입력하면 즉시 YouTube Live

---

## 아키텍처

```
┌────────────────────────────────────────────────────────┐
│ Browser (UnoLive Composer)                             │
│                                                         │
│  EditorCanvas / OutputCanvas                            │
│       │                                                 │
│       │ canvas.captureStream(30)                       │
│       ▼                                                 │
│  MediaStream (video + audio)                            │
│       │                                                 │
│       │ MediaRecorder (webm/vp9/opus)                  │
│       ▼                                                 │
│  Blob chunks (250ms interval)                           │
│       │                                                 │
└───────┼─────────────────────────────────────────────────┘
        │ socket.io 'broadcast:chunk'
        ▼
┌────────────────────────────────────────────────────────┐
│ Next.js Server (server.ts)                              │
│                                                         │
│  Socket.IO handler                                      │
│       │                                                 │
│       │ pipe to stdin                                   │
│       ▼                                                 │
│  ffmpeg-static child process                            │
│    ffmpeg -i - -c:v libx264 -preset veryfast            │
│           -c:a aac -f flv rtmp://...                    │
│       │                                                 │
└───────┼─────────────────────────────────────────────────┘
        │ RTMP
        ▼
   YouTube Live / Custom RTMP endpoint
```

---

## 개발 단계

### ✅ Phase 1: UI Shell (현재 세션)
- [x] 타입 정의 (`broadcastTypes.ts`)
- [x] Zustand store (`broadcastStore.ts`)
- [ ] 녹화 훅 (UI state만)
- [ ] 라이브 훅 (UI state만)
- [ ] 메뉴 버튼 컴포넌트
- [ ] 라이브 설정 모달
- [ ] MiddleTopMenu 통합

### 🔜 Phase 2: 녹화 구현 (브라우저 단독)
브라우저 내장 API만으로 완성 가능. 서버 변경 불필요.

#### 캡처 소스 옵션
1. **EditorCanvas 직접 캡처** — 가장 단순, 2D 그리기만 포함
2. **OutputCanvas 캡처** — 카메라 + 자막 + 요소 합성 결과 (권장)
3. **getDisplayMedia()** — 화면 전체 (대안)

#### 구현 포인트
```typescript
// 1. 캔버스에서 영상 스트림 추출
const videoStream = outputCanvasRef.current.captureStream(30);

// 2. 오디오 소스
const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });

// 3. 믹싱 (Web Audio API)
const audioContext = new AudioContext();
const destination = audioContext.createMediaStreamDestination();
// ... mic + system audio → destination

// 4. 통합 스트림
const combined = new MediaStream([
  ...videoStream.getVideoTracks(),
  ...destination.stream.getAudioTracks(),
]);

// 5. MediaRecorder
const recorder = new MediaRecorder(combined, {
  mimeType: 'video/webm;codecs=vp9,opus',
  videoBitsPerSecond: 8_000_000,  // 8Mbps
});

recorder.ondataavailable = (e) => chunks.push(e.data);
recorder.onstop = () => {
  const blob = new Blob(chunks, { type: 'video/webm' });
  const url = URL.createObjectURL(blob);
  // ↓ 다운로드 링크 트리거
  const a = document.createElement('a');
  a.href = url;
  a.download = `unolive-${Date.now()}.webm`;
  a.click();
};

recorder.start(250); // 250ms chunk
```

#### 고려사항
- **WebM vs MP4**: WebM은 브라우저 네이티브, MP4는 ffmpeg.wasm 필요
- **오디오 싱크**: 캔버스 캡처는 영상만 → 오디오는 별도 추가
- **긴 녹화 메모리**: 청크를 File System Access API로 계속 기록하면 메모리 문제 해결
- **중단 없는 재개**: `MediaRecorder.pause()` / `resume()` 활용

### 🔜 Phase 3: YouTube 라이브 스트리밍 (서버 연동)

#### 서버 파일 추가 (미래)
```
lib/server/broadcast/
├── liveRelay.ts              # 소켓 이벤트 핸들러
├── ffmpegRunner.ts           # ffmpeg-static 래퍼
└── youtubeApi.ts (선택)      # YouTube Data API v3
```

#### 소켓 이벤트 프로토콜
```typescript
// 클라이언트 → 서버
interface BroadcastStartEvent {
  provider: 'youtube' | 'custom';
  streamUrl: string;
  streamKey: string;
  videoBitrate: number;  // kbps
  audioBitrate: number;  // kbps
}

socket.emit('broadcast:start', config);
socket.emit('broadcast:chunk', blob);  // webm 청크
socket.emit('broadcast:stop');

// 서버 → 클라이언트
socket.on('broadcast:ready', () => {});          // ffmpeg 연결됨
socket.on('broadcast:error', (err) => {});       // 오류 발생
socket.on('broadcast:stats', (stats) => {});     // 주기적 통계
```

#### FFmpeg 명령 (서버측)
```bash
ffmpeg -re -i - \
  -c:v libx264 -preset veryfast -tune zerolatency \
  -b:v 4500k -maxrate 4500k -bufsize 9000k \
  -g 60 -keyint_min 60 \
  -c:a aac -b:a 160k -ar 44100 \
  -f flv rtmp://a.rtmp.youtube.com/live2/STREAM_KEY
```

#### 의존성 (설치 필요)
```json
{
  "ffmpeg-static": "^5.2.0",    // 플랫폼별 ffmpeg 바이너리 자동 포함
  "fluent-ffmpeg": "^2.1.3"     // 선택: ffmpeg CLI 래퍼
}
```

`ffmpeg-static`은 npm install만으로 macOS/Windows/Linux용 ffmpeg 바이너리를
자동 다운로드합니다 — 사용자가 별도로 설치할 필요 없음.

### 🔜 Phase 4: 고급 기능
- 멀티스트림 (YouTube + Facebook 동시 송출)
- 자동 재연결 (네트워크 끊김 시 ffmpeg 재시작)
- 딜레이 버퍼 (10초 지연 송출 — 방송 사고 대비)
- 채팅 오버레이 (YouTube Live Chat API)
- 스트림 프리뷰 (서버 HLS 프록시)

---

## 폴더 구조

```
lib/broadcast/
├── broadcastTypes.ts         # 타입 정의
├── broadcastStore.ts         # Zustand store
└── README.md                 # 본 문서

hooks/broadcast/
├── useRecording.ts           # 녹화 훅
└── useLiveStream.ts          # 라이브 스트리밍 훅

components/composer/broadcast/
├── BroadcastMenu.tsx         # 우측 메뉴 wrapper
├── RecordButton.tsx          # 녹화 버튼
├── LiveButton.tsx            # 라이브 버튼
├── LiveSetupModal.tsx        # 라이브 설정 모달
├── LiveStatusIndicator.tsx   # 라이브 ON 인디케이터
└── index.ts                  # 재export
```

---

## 보안 고려사항

### 스트림 키 저장
- **현재**: localStorage에 평문 저장 (Phase 1)
- **Phase 3**: 서버측 암호화 저장으로 마이그레이션 예정
  - 사용자별 암호화 키 (비밀번호 유도)
  - 서버 세션에만 복호화된 키 유지
- **공유 금지**: README에 "스트림 키는 절대 공유하지 마세요" 명시

### 네트워크 보안
- RTMP는 평문 전송 → YouTube는 RTMPS(TLS) 지원
- WebSocket은 동일 도메인 → Next.js 서버에서 HTTPS 종단화
