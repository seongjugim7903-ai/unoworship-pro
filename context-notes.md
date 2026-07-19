# UnoWorship Pro — 컨텍스트 노트

> 작업 중 내린 결정과 이유. 세션마다 계속 append. 최신이 아래.

## 2026-07-07 — 프로젝트 시작 (기획·계획 수립)

### 왜 새 폴더에서 다시 만드는가
- 레퍼런스(UnoLive-plus-atem-field)는 매주 실예배에 사용 중인 살아 있는 시스템이라
  대규모 구조 변경을 그 안에서 할 수 없다 (예배용 폴더 동결 원칙).
- 2026-07-07 전체 감사 결과, 런타임(렌더러·소켓)은 우수하지만 에디터는 구조 부채
  (송출 이중 구현, 전면 스토어 구독, 핫패스 persist)가 커서 리팩터링보다 재구축이 싸다.
- 새 UI 디자인(Figma, 1920x1080 프레임)이 나와 어차피 에디터 전면 재작업이 필요했다.

### 핵심 결정
- **전략 = 런타임 계승 + 에디터 재구축.** 렌더러/소켓 코어는 파일 단위 이식,
  컴포저 UI만 새로 쓴다. (DEV_PLAN §1, §4)
- **기술 스택 유지** (Next.js+socket.io+zustand+canvas) — 실운영 검증된 선택을 바꿀 이유 없음.
  신규 도입은 zod(스키마 검증)와 vitest(테스트 러너)뿐.
- **프로덕션 빌드 운영** — 레퍼런스는 인증 우회가 NODE_ENV에 묶여 dev 서버 운영이 강제됐다.
  `UNOWORSHIP_FIELD_MODE` 전용 env로 분리해 처음부터 build+start로 간다.
- **`/atem-dev` 멀티뷰를 제품 기능으로 승격** — 새 디자인 하단 3분할이 정확히 그 역할.
  리니어 키 합성(카메라x(1-키)+필x키)은 2026-07-07 검증 완료된 알고리즘 그대로.
- **설계 원칙(DEV_PLAN §3)은 전부 실사고에서 도출** — 재조인(출력 동결 사고), 마운트 송출 금지
  (BLACKOUT 해제 사고), 디버그 게이트(방송 노출 사고), persist 디바운스(iPad 리로드 원인).
  이 원칙들은 협상 불가로 못박음.

### 열린 질문 (사용자 확인 대기)
- 새 UI 영역 해석 (PRODUCT_PLAN §5 ①~⑤) — Figma 프레임 구조에서 추론한 가정.
  특히 ③중앙이 "편집 캔버스 ↔ PGM 프리뷰 토글"인지, ④하단 3분할이 FILL/KEY/SUB인지.
- 제품명 (가칭 UnoWorship Pro).
- v1.0에 유튜브 영상 재생을 포함할지 (임포터는 포함, 재생 부하 검토는 v1.1 율동과 함께가 안전).

### 레퍼런스에서 배운 것 중 문서에 안 적힌 맥락
- ATEM 입력 매핑은 물리 배선 기준 — 입력4=Fill(C타입1), 5=Key(C타입2), 6=Sub(HDMI, EDID 유일).
  Fill/Key 어댑터 2개는 동일 EDID라 좌표순 구분. 뒤바뀌면 케이블 교환이 현장 해법.
- 서버 기동 시 `UNOLIVE_SOCKET_DEV_BYPASS=1`(레퍼런스 명칭)이 없으면 오프라인 LAN에서
  소켓·미들웨어가 Supabase를 기다린다 — 새 프로젝트에선 FIELD_MODE가 이를 대체.
- "영상은 ATEM, 앱은 자막/그래픽만" 원칙이 스터터 문제를 해결한 핵심이었다.
  앱에서 영상을 직접 내보내려는 유혹을 경계할 것.

## 2026-07-08 — 자막 시스템 구조 확정 (PRODUCT_PLAN §5 신설)

### 확정 내용
- **메인(회중) = 필앤키 유지** (C타입1/2 → ATEM 입력4/5 → Out1, PGM 중심).
  방송·회중 화면의 카메라+자막 합성은 하드웨어 키잉이 정답 — 이 경로는 바꾸지 않는다.
- **서브(무대) = 맥 직결** — ATEM 입력6 경유 제거. 검정배경 자막·영상은 합성이 필요 없어
  ATEM 을 거칠 이유가 없다. 부수 이득: 입력6 해방 → 카메라 +1.
- **제어 = 맥 로컬 조작 기본** (구조 변경 전엔 컴포저가 IP 원격 전용이었다).
- **리모트 = 긴급 조작 특화 레이아웃 신규** — 강대상 목사님·회중석에서 iPad/모바일로
  송출/다음/이전/블랙아웃만. 전체 컴포저 UI 원격 노출보다 사고 여지가 작다.
- 총 4화면: 필앤키 2출력 + 직결 2모니터 (한 대는 DisplayLink).

### 할당 권장 (사용자 질문 "더 좋은 방법?"에 대한 답)
- **서브 = 네이티브 HDMI, 제어 = DisplayLink.** DisplayLink 는 USB 압축 그래픽이라
  영상 재생 프레임 드랍 가능성 — 영상 재생 대상인 서브에 네이티브 출력을 주고,
  정적 UI 인 제어 화면을 DisplayLink 로. 최종 확정은 Phase 6 리허설.

### 원칙 재정의 (위 2026-07-07 노트의 "영상은 ATEM" 문구를 이렇게 갱신)
- **카메라 = ATEM, 콘텐츠 영상(유튜브·업로드) = 앱.** 메인 영상은 필앤키 방식
  (Fill 재생 + Key 마스크 — 레퍼런스 검증 완료), 서브 영상은 직결 로컬 재생.
  영상 구간은 정적 프레임 원칙의 명시적 예외 구간으로 격리 (DEV_PLAN §3-6 신설).
- 지향점: "거의 ProPresenter 기능을 다 담는다" (사용자 표현) — 영상 개별 송출 포함.

### 열린 검증 항목
- DisplayLink 영상 재생 부하 (권장 배치대로면 제어 화면이라 영향 최소).
- 직결 서브 창 kiosk 자동 배치 (DisplayLink EDID 고유 → 배정 용이 예상).
- **사전 체험 실험 (사용자 제안)** — DisplayLink 도착 전, 현 장비로 HDMI를 입력6 대신
  무대 모니터에 직결 + IP 컴포저 조작으로 서브 직결 구조를 미리 경험.
  절차·주의사항은 PRODUCT_PLAN §5-6에 문서화 (핫스왑 금지·배선 확인·예배 전 복원).

## 2026-07-08 — 출력 프로필 결정: 한 폴더, 포크 안 함

- 사용자가 unoworship-pro(직결)/unoworship-plus(필앤키) **두 폴더 포크 + 각각 커스텀**을
  제안 → 논의 끝에 **한 폴더 + 출력 프로필 2종**으로 확정 (PRODUCT_PLAN §5-5).
- 이유: 포크하면 기능 사본이 3벌(운영본+pro+plus)이 되어 "기능 공통 사용" 목표와 정면충돌.
  두 구성의 실제 차이는 코드가 아니라 **창 배치(기동 스크립트) + 서브 출력 경로**뿐이다.
- 프로필 A "직결(Pro)" = 서브 개별 디자인(듀얼아웃 전체). 프로필 B "필앤키(Plus)" =
  Out2 서브가 **PGM 미러** (ATEM 입력 2개뿐이므로 — 사용자 확인 완료).
- 시작점은 기존 계획 유지 — **런타임 파일 단위 이식 + 에디터 재구축** (atem-field 통복사안은
  검토 후 기각: 감사 부채가 새 제품에 복제됨).
- **프로필 = 기능 노출 게이트** (사용자 확인) — Plus 배선에서는 서브 개별 제어 UI
  (PMT 선택, visibleOn 서브 라우팅, 섹션 타깃, 서브 전용 송출, 서브 개별 영상)가
  나타나지 않는다. 코드는 하나, 노출만 프로필로 분기.
- **장비별 권장 매핑** (사용자 제안) — ATEM Extreme 초과·4모니터 = Pro,
  Extreme 이하 = Plus. 보충: 출력 1개 기종도 HDMI 분배기로 Plus 가능(서브=PGM 미러라서),
  Pro는 ATEM 기종 제한 없음(서브 직결) — 강제가 아닌 가이드로 §5-5에 기록.
- **프로필 C 후보 (vMix식 소프트웨어 합성)** — 사용자 이력: 오래 전 버전에서 ATEM 영상을
  맥으로 받아 앱에서 자막과 합성, 두 모니터 새 창 출력에 성공했었음. ATEM 없는 교회까지
  커버 가능한 구성이라 v2 후보로 §5-5에 기록. 단 "영상은 ATEM" 원칙(스터터 사고)과
  충돌하는 상시 합성이므로 부하·지연 검증 전 v1 진입 금지.

## 2026-07-09 — Phase 0 완료 + 시작 결정

- **in-place 리팩토링안 검토 후 기각** (사용자 제안 → 논의) — 현재 폴더는 매주 예배 운영 중이라
  "반쯤 바뀐" 중간 상태가 예배를 위협. 새 폴더 준비 비용(1~2일)이 리허설 게이트 비용보다 작다.
  현재 폴더는 보관이 아니라 **살아있는 운영본**으로 유지, pro 리허설 통과 시 전환.
- **UI 해석 확인 완료** — 인터랙티브 목업(5영역 + Pro/Plus 게이팅 + 편집/운영 모드)으로 사용자 확인.
- **레퍼런스에 구방식 새창 출력 복구** (운영 폴더 최소 변경) — MiddleTopMenu에 출력창 1(/main)·
  2(/output) 버튼 추가. 두 모니터 미러 방식 + 서브 직결 사전 체험에 사용.
- **Phase 0 스캐폴드 완료** (커밋 5df9c82) — Next 15 + 커스텀 서버(tsx) + socket.io 에코 +
  zod/vitest/eslint 경계 규칙 + UNOWORSHIP_FIELD_MODE. 검증 전부 통과:
  production 빌드 기동(:3100) + /health 200 + fieldMode=true (NODE_ENV 분리 확인),
  소켓 에코 2건, 경계 위반 lint 실패.
- **포트 규칙** — pro는 항상 :3100 (운영본 :3000과 분리). 프로세스 종료는 포트로 특정
  (`lsof -ti:3100`) — 광역 pkill 이 운영 서버를 잡은 사고(즉시 복구됨)에서 나온 수칙.
- **Plus 프로필 실장비 검증 완료** (2026-07-09) — DisplayLink 도착 전 금요기도회 대비 구성에서
  확인: Out1/Out2 → 메인·서브 모니터, Out2 소스를 Program 으로 바꾸는 것만으로 PGM 미러 동작.
  사용자 확인 멘트: "이 셋팅이 플러스 모드네요". 후속: 프로필 적용 시 Out2 라우팅 자동화
  (PRODUCT_PLAN §5-5 v1.1 후보), 임시 운영 커맨드는 UnoLive-필앤키+컴포즈-실행.
- 다음: Phase 1 — 소켓 zod 스키마 + 재조인 래퍼 + 상태 리플레이 + 렌더러 이식 + /out 라우트.

## 2026-07-19 — 찬양대 자막 요청 Supabase 저장 레이어

- `unoworship-pro-eight.vercel.app`에서 생성한 찬양대 자막 요청을 브라우저 로컬 저장에만 두지 않고
  Supabase에 저장하는 방향으로 확정.
- 저장 단위는 세 가지: `choir_requests`(원본 가사/요청), `choir_generated_images`(PNG Storage 메타),
  `choir_programs`(현장 Composer 가져오기용 프로그램 payload).
- 실제 PNG는 Supabase Storage bucket `choir-generated-images`에 저장.
- 2026-07-19 사용자가 새 Supabase URL `https://hwbzztfjzeismosjkmhe.supabase.co`를 제공.
  Vercel env의 `SUPABASE_URL`은 이 값이 기준. 다만 현재 로컬 Supabase CLI 계정에는 이전 프로젝트
  `blimpsrrphfstbbitblo`만 표시되고 새 프로젝트는 목록에 나오지 않아, DB 마이그레이션은 새 프로젝트가
  보이는 계정으로 CLI 로그인하거나 Dashboard SQL Editor에서 직접 실행해야 한다.
- 서버 route handler만 service role key를 사용한다. key는 Vercel env에만 저장하고 GitHub/브라우저 코드에 넣지 않는다.
- 세부 설계 문서: `docs/features/choir-requests/SUPABASE_STORAGE_PLAN.md`.

## 2026-07-20 — 전체저장→카카오톡 순차 활성화 + 공식 카카오 공유창

- Windows PC(F:\projects\unoworship-pro)에 GitHub 저장소 클론, 개발 환경 재구성 (npm install·typecheck·vitest 통과).
- **버튼 순서 강제** (사용자 지시) — 생성된 자막 이미지 패널에서 `① 전체 이미지 저장`이 먼저,
  완료 후에만 `② 카카오톡으로 보내기` 활성화. `downloadAllStatus` 상태로 게이팅하고
  생성/새 요청/지난 곡 수정 시 idle로 리셋.
- **카카오톡 공유 = 공식 JS SDK** (사용자 지시: "통상적인 웹사이트의 카카오 공유창 그대로") —
  SDK 2.8.1 `Kakao.Share.sendDefault`(feed) + `uploadImage`(첫 PNG 썸네일, 5MB 한도, 카카오 서버 100일 보관).
  구현: `lib/kakaoShare.ts`. 버튼은 카카오 노랑(#FEE500) 공식 스타일.
- **키 미설정 시 예비 경로** — `NEXT_PUBLIC_KAKAO_JS_KEY` 없으면 기존 `navigator.share` 파일 공유로 대체.
  키 발급·도메인 등록 절차는 `docs/features/choir-requests/KAKAO_SHARE.md`.
- 남은 사용자 작업: Kakao Developers 앱 생성 → JS 키를 Vercel env `NEXT_PUBLIC_KAKAO_JS_KEY`에 등록 +
  사이트 도메인(`unoworship-pro-eight.vercel.app`) 등록. Supabase 새 프로젝트 마이그레이션도 여전히 미적용.
