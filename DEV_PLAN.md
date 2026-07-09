# UnoWorship Pro — 개발 계획서

> 작성 2026-07-07. 레퍼런스 구현과 감사 보고서를 근거로 한 기술 계획.
> 레퍼런스: `/Users/kimseongju/unogstack/projects/UnoLive-plus-atem-field` (읽기 전용)
> 감사: 레퍼런스 저장소의 `docs/audit-2026-07-07.md`

---

## 1. 전략 — "런타임 계승, 에디터 재구축"

감사 결론이 곧 전략이다.

- **계승 (검증돼서 그대로 가져올 것)** — 캔버스 렌더러, rAF 수명 관리, 소켓 서버의 검증·권한
  모델, 듀얼아웃 라우팅(visibleOn/promptLayout), 리니어 키 합성 알고리즘, 운영 스크립트 골격.
- **재구축 (부채가 확인돼서 새로 쓸 것)** — 컴포저 UI 전체(새 디자인), 스토어(셀렉터·persist 전략),
  송출 모듈(단일 구현), 인증/환경 플래그 체계(프로덕션 빌드 가능하게).
- **재작성이 아니라 이식이다** — 렌더러·소켓 코어는 파일 단위로 가져와 새 구조에 맞게 다듬는다.
  바닥부터 다시 쓰는 것은 에디터뿐이다.
- **한 코드베이스 + 출력 프로필** — Pro(직결)/Plus(필앤키 PGM 미러)는 폴더 포크가 아니라
  프로필(설정+기동 스크립트)로 갈라진다 (PRODUCT_PLAN §5-5, 2026-07-08 확정).
  unoworship-plus 폴더는 만들지 않는다.

## 2. 기술 스택 (레퍼런스와 동일 — 검증된 선택 유지)

| 계층 | 선택 | 이유 |
|---|---|---|
| 프레임워크 | Next.js 15 (App Router) + 커스텀 서버(tsx→**빌드 후 node**) | 레퍼런스 검증. 단 운영은 `next build` + production 기동 (아래 §3-7) |
| 실시간 | socket.io (websocket 전용, upgrade:false) | LAN 최소 지연 검증됨 |
| 상태 | zustand + IndexedDB persist | 유지하되 §3-4 규칙 적용 |
| 렌더 | Canvas 2D + 정적 프레임 원칙 | 2시간 무인 운영 CPU 0 수렴 검증됨 |
| 검증 | zod (신규 도입) | 소켓 페이로드 스키마를 타입과 런타임 검증으로 단일화 |
| 테스트 | vitest (신규 도입) | 레퍼런스는 러너 부재. 렌더러·송출 모듈은 단위 테스트 필수 |
| 출력 창 | Chrome kiosk (스크립트 배치) | 검증된 방식. Electron 전환은 v2 검토 항목. **서브는 맥 직결 모니터**(PRODUCT_PLAN §5) — DisplayLink 사용 시 DisplayLink Manager 드라이버 의존 |

## 3. 설계 원칙 — 협상 불가 (전부 실사고·감사에서 도출)

### 3-1. 송출은 단일 모듈, 명시 조작으로만
- `features/broadcast/`에 **송출 함수 1개**. UI 어디서든 이것만 호출 (레퍼런스는 SetlistPanel/
  OperatorPanel 이중 구현 ~300줄씩 → 이미 드리프트 발생했었다).
- **마운트/이펙트에서 송출 금지.** 송출은 사용자 이벤트 핸들러에서만 시작된다
  (레퍼런스 사고: 컴포저 리로드 → BLACKOUT 해제 자동 송출).
- 상태 동기화가 필요하면 "서버가 기억하고 늦게 온 창에 리플레이"로 푼다. 클라가 재송출하지 않는다.

### 3-2. 소켓 계층 — 끊김은 정상 상황이다
- **룸 재조인 내장** — 소켓 래퍼가 `connect` 이벤트에서 자동 재조인. 훅마다 구현하지 않는다
  (레퍼런스 치명 결함: 재조인 부재 → 출력창 영구 동결).
- **서버 상태 리플레이** — 서버가 마지막 송출 상태(자막·블랙아웃)를 보관, OUTPUT 룸 join 시 즉시
  재전송. "리로드 = 10초 내 원상복구"의 근거.
- **핸들러 예외 격리** — 수신 메시지 처리와 렌더 루프 본문은 try/catch. 한 건의 비정상 페이로드가
  창을 죽이지 못한다.
- **페이로드는 zod 스키마** — 송신 전 검증 + 수신 후 검증. 레퍼런스의 수작업 화이트리스트 검증
  로직(잘 되어 있음)을 스키마로 옮긴다.
- FRAME 계열 대형 페이로드는 전체 재직렬화 검증 금지 — 길이 검사만 (레퍼런스 감사 항목).

### 3-3. 렌더러 — 검증된 패턴을 그대로
- 정적 프레임 원칙 — 변화 없으면 다음 rAF 예약 안 함.
- 모든 캐시에 상한 (이미지 LRU, 프레임 캐시 등 — 레퍼런스 수치 계승).
- **디버그 출력은 `?debug=1`일 때만** — 렌더러 캔버스는 전부 방송 화면이다. 진단 문구를 그리면
  방송 노출이다 (레퍼런스 사고 사례).
- getUserMedia 수명은 레퍼런스 `useVideoCaptureStream` 패턴 (cancelled 플래그 + streamRef).

### 3-4. 에디터 — iPad Safari가 1급 환경
- 스토어 구독은 **개별 셀렉터만** (전면 `useStore()` 금지 — lint 규칙으로 강제).
- persist는 **1초 디바운스 + 쓰기 완료 확인**. Base64 이미지 등 대형 바이너리는 스토어 밖
  (IndexedDB 별도 스토어에 id 참조로) — 레퍼런스는 드래그 틱마다 수십 MB 직렬화했다.
- **라이브 상태 persist** — activeItem/activeSection/broadcastSection/isBlackout 포함.
  리로드 후 운영자가 "지금 어디 쏘는지"를 즉시 복원.
- 서버 데이터는 명시적 다운로드로만 로컬을 덮는다 (자동 병합 금지 — 레퍼런스 사고: 리로드가
  현장 편집을 롤백).
- 포인터 이벤트만 사용 (mouse 전용 금지 — iPad 터치).
- 전역 단축키는 BUTTON 포커스 제외.

### 3-5. 에디터/렌더러 분리 — 방향 규칙
- 렌더러(출력 라우트)는 에디터 스토어를 import하지 않는다. 소켓 수신이 유일한 입력.
- 편집은 라이브에 자동 반영되지 않는다 — 명시적 재송출로만 (레퍼런스의 올바른 결정 계승).
- 디렉터리로 강제: `renderer/`는 `editor/`를 import 불가 (eslint boundary 규칙).

### 3-6. 영상 재생 — 역할 경계 (구조 확정 2026-07-08 반영)
- **카메라 = ATEM, 콘텐츠 영상(유튜브·업로드) = 앱.** 메인은 필앤키 영상 방식(Fill 재생 +
  Key 마스크 — 레퍼런스 검증 완료), 서브는 직결 로컬 재생.
- 영상 재생 구간은 정적 프레임 원칙의 **명시적 예외 구간**으로 격리 — 재생 시작/종료가
  rAF 수명에 정확히 연결돼야 한다 (레퍼런스 스터터 사고의 경계 유지).
- DisplayLink 경유 화면에서는 영상 재생 금지 권장 (압축 프레임 드랍) — 권장 배치는
  서브=네이티브 HDMI, 제어=DisplayLink (PRODUCT_PLAN §5-2).

### 3-7. 운영 — 프로덕션 빌드 + 현장 모드 분리
- 현장 우회는 `UNOWORSHIP_FIELD_MODE=1` **전용 env**로 — NODE_ENV와 분리
  (레퍼런스는 우회가 dev 전제라 dev 서버 운영이 강제됐다).
- 운영 = `next build` + `node server` — 첫 방문 컴파일 지연·HMR 리로드 위험 원천 제거.
- 부팅 자동실행/전체종료 스크립트는 레퍼런스 최신본(2026-07-07 수정본) 골격 계승
  (디스플레이 안정 대기, 배치 후 재검증, 프로필별 창 정리, non-watch).
- 로그 로테이션 내장. 서버에 `/api/health` + 진단 페이지.
- 완전 오프라인 LAN에서 전 기능 동작 — 외부 네트워크는 어떤 경로에서도 요청 대기 금지
  (미들웨어 포함. 런타임 경로는 인증 확인 전에 통과).

## 4. 레퍼런스에서 가져올 코드 (파일 단위)

이식 시 각 파일 감사 지적사항을 반영하며 가져온다 (지적사항은 audit-2026-07-07.md 참조).

| 레퍼런스 파일 | 새 위치(안) | 비고 |
|---|---|---|
| `lib/canvasRenderer.ts` | `src/renderer/canvasRenderer.ts` | 그대로 (캐시 상한 포함). hexToRgba 가드만 보강 |
| `lib/subtitleRenderer.ts` | `src/renderer/subtitleRenderer.ts` | hexToRgba 가드 보강 |
| `components/atem-key/AtemKeyCanvas.tsx` | `src/renderer/outputs/AtemOutputCanvas.tsx` | rAF·마스크·시퀀스 가드 패턴 계승, 렌더 루프 try/catch 추가. sub 창은 **직결 모니터 kiosk** (ATEM 입력6 경로 제거 — PRODUCT_PLAN §5) |
| 영상 필앤키 (`docs/features/video-fillkey/BRIEF.md` 구현부) | `src/renderer/outputs/` + `features/broadcast/` | 메인 영상 송출(Fill 재생+Key 마스크) 검증 완료 — 계승. 서브는 직결 로컬 재생으로 단순화 |
| `components/prompt/choir/choirPromptLayoutRenderer.ts` | `src/renderer/promptLayouts/` | black-white 계승 + bible/dance 확장 지점 |
| `lib/server/socketServer.ts` | `src/server/socket/` | 검증·권한·상한 계승, zod화 + 상태 리플레이 추가 |
| `lib/socketClient.ts` | `src/lib/socketClient.ts` | 재조인 내장 래퍼로 확장 |
| `hooks/useVideoCaptureStream.ts` | `src/hooks/` | 모범 구현 — 그대로 |
| `hooks/useBroadcastPublisher.ts` 외 WebRTC 훅 | `src/hooks/webrtc/` | 다중 뷰어 Map 패턴 계승 |
| `app/atem-dev/page.tsx` (멀티뷰 + 리니어 키 합성) | `src/editor/multiview/` | **제품 기능으로 승격** — 새 UI 하단 3분할 + 중앙 PGM 프리뷰 |
| `scripts/UnoLive-ATEM-3Screen-Start.command` 외 | `scripts/` | 골격 계승, 프로덕션 기동으로 변경 |
| `lib/bible/`, importers (`menu/*Importer.tsx`) | `src/editor/importers/` | 로직 계승, UI는 새 디자인 |
| `data/templates/` 구조, `applyTemplate` | `src/lib/templates/` | fieldRole·visibleOn 사전 태그 방식 계승 |

가져오지 않는 것 — SetlistPanel/OperatorPanel/EditorCanvas 등 컴포저 UI 전체(새로 씀),
`atemsignal` 중복 라우트(출력 라우트는 한 벌만), 구세대 LinearKey·Dev-Start 스크립트.

## 5. 새 저장소 구조

```
unoworship-pro/
├─ src/
│  ├─ server/            # 커스텀 서버 + socket (상태 리플레이, zod 검증)
│  ├─ renderer/          # 출력 전용 — editor import 금지 (eslint boundary)
│  │  ├─ outputs/        #   fill/key/sub 캔버스
│  │  └─ promptLayouts/  #   black-white, bible, youtube-dance
│  ├─ editor/            # 컴포저 UI (새 디자인)
│  │  ├─ setlist/        #   ② 좌측 사이드바
│  │  ├─ canvas/         #   ③ 중앙 편집 캔버스
│  │  ├─ multiview/      #   ③PGM 프리뷰 + ④ 하단 3분할
│  │  ├─ operator/       #   ⑤ 우측 패널
│  │  └─ importers/      #   성경/찬송/PPT/유튜브
│  ├─ features/
│  │  └─ broadcast/      # 송출 단일 모듈 (§3-1)
│  ├─ lib/               # 공용 타입·스키마(zod)·소켓 클라이언트
│  └─ hooks/
├─ app/                  # 라우트만 (얇게) — /composer, /out/fill|key|sub, /health
├─ scripts/              # 자동실행·종료·진단
├─ docs/
└─ tests/                # vitest — renderer·broadcast·socket 계약 테스트
```

## 6. Phase 로드맵

각 Phase는 "검증 기준 통과 = 완료"다. 검증 없이 다음 Phase 착수 금지.

### Phase 0 — 스캐폴드 (0.5일)
- Next.js 15 + 커스텀 서버 + socket.io + zustand + zod + vitest + eslint boundary 규칙.
- `UNOWORSHIP_FIELD_MODE` env 체계. production 빌드가 처음부터 돌아가는 상태로 시작.
- **검증**: `npm run build && npm start`로 기동, /health 200, 소켓 에코 테스트 통과.

### Phase 1 — 코어 런타임 이식 (2~3일)
- 소켓 서버(검증·권한·**상태 리플레이**·재조인 래퍼) + 렌더러(canvasRenderer, AtemOutputCanvas,
  black-white promptLayout) 이식. 출력 라우트 `/out/fill|key|sub`.
- **검증**: vitest 계약 테스트 — ①송출 1건이 fill/key/sub 각자 도달 ②서버 재시작 후 자동 재조인
  ③늦게 연 창이 리플레이로 현재 상태 표시 ④비정상 페이로드 주입 시 창 생존. headless 브라우저로
  실브라우저 확인 (레퍼런스에서 쓴 browse 검증 방식).

### Phase 2 — 송출 모듈 + 오퍼레이터 (2일)
- `features/broadcast/` 단일 송출 모듈 (visibleOn 라우팅, promptSendMode, 섹션 타깃, 블랙아웃).
- 새 UI 골격 (①상단 바 + ⑤우측 오퍼레이터) — 운영 모드 먼저.
- 리모트 오퍼레이터 스텁 — `/remote` 라우트, 최소 조작(송출/다음/이전/블랙아웃) 큰 버튼 레이아웃.
- **검증**: 마운트 시 소켓 송출 0건 (자동 테스트로 강제), 블랙아웃 걸고 리로드 → 유지 확인,
  리모트에서 다음/이전 조작이 본 컴포저와 동일 결과.

### Phase 3 — 멀티뷰 + PGM 프리뷰 (1~2일)
- ④하단 3분할 (실해상도 렌더 후 셀 맞춤 축소 — 검증된 방식) + ③PGM 리니어 키 합성 프리뷰
  (카메라x(1-키)+필x키) + ATEM USB 캡처/내부 WebRTC 소스 선택.
- **검증**: 32인치·노트북·4K 뷰포트 스크롤 없음, 합성 결과가 테스트 패턴(검정 자막 + 불투명 박스)
  기준 실키와 동일.

### Phase 4 — 에디터 (3~5일)
- ②세트리스트 + ③편집 캔버스 (새 스토어 — 셀렉터 구독, persist 디바운스, 바이너리 분리,
  라이브 상태 persist).
- 편집/운영 모드 전환. 프리렌더 파이프라인 (편집 디바운스 후 백그라운드).
- **검증**: 드래그 중 IndexedDB 쓰기 ≤1회/초, 리로드 후 편집본·라이브 위치 완전 복원,
  iPad Safari 실기기 확인.

### Phase 5 — 임포터 + 템플릿 (2일)
- 성경/찬송/PPT/유튜브 이식, 시나리오 템플릿 (성가 v1 완성형).
- **검증**: 각 임포터로 실데이터 1건씩 → 듀얼아웃 송출까지 엔드투엔드.

### Phase 6 — 운영 패키징 (1~2일)
- 자동실행·전체종료·진단 스크립트 (프로덕션 기동), 로그 로테이션, 오프라인 체크
  (외부 네트워크 차단 상태에서 전 기능).
- **출력 프로필 선택** — 기동 스크립트/설정에서 Pro(직결)/Plus(필앤키 미러) 프로필에 따라
  창 배치·서브 경로 분기 (PRODUCT_PLAN §5-5).
- **검증**: 맥미니 실장비 리허설 — 부팅부터 송출까지 무개입, 예배 체크리스트 통과.
  **DisplayLink 배치 리허설** — 영상 재생 프레임 드랍 확인, HDMI↔DisplayLink 할당 비교 후
  최종 배치 확정 (PRODUCT_PLAN §5-2 권장안 기준).

### v1.1 이후 — bible/youtube-dance promptLayout, 커스텀 서브 디자인 갭, 배포 패키징.

## 7. 리스크와 대응

| 리스크 | 대응 |
|---|---|
| 이식 중 렌더러 회귀 (미묘한 타이밍·캐시 동작) | 파일 단위 이식 + Phase 1 계약 테스트를 레퍼런스 대비 동작 비교로 작성 |
| 새 에디터가 현행 기능을 빠뜨림 | PRODUCT_PLAN §7 v1.0 목록이 기준. 기능 추가 아닌 동등+안정화가 목표 |
| 병행 운영 부담 (현행은 매주 예배 사용 중) | 레퍼런스는 동결 유지. Pro는 리허설 검증 전까지 현장 투입 금지 |
| 율동(영상) 부하 | v1.1로 격리 — 레퍼런스 계획과 동일하게 정적 프레임 원칙 예외 구간으로 별도 설계 |
| iPad Safari 특성 (메모리·백그라운드 타이머) | Phase 4 검증을 실기기로. pingTimeout 조정은 재조인 안정화 후 |
| DisplayLink 영상 프레임 드랍 (USB 압축 그래픽) | 권장 배치 = 서브(영상 대상)는 네이티브 HDMI, 제어(정적 UI)만 DisplayLink. Phase 6 리허설로 확정 |

## 8. 진행 규칙 (어느 세션이 이어받아도)

1. 시작하면 `README.md` → 이 문서 → `checklist.md` → `context-notes.md` 순으로 읽는다.
2. 현재 Phase의 체크리스트만 진행한다. Phase 검증 기준 통과 전 다음 Phase 금지.
3. 레퍼런스 코드가 필요하면 `/Users/kimseongju/unogstack/projects/UnoLive-plus-atem-field`에서
   읽어 온다 (그쪽 수정 금지).
4. 결정을 내리면 `context-notes.md`에 이유와 함께 기록한다.
5. §3 설계 원칙과 충돌하는 요구가 생기면 진행을 멈추고 사용자에게 확인한다.
