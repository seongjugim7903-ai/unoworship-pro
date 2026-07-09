# UnoWorship Pro — 작업 체크리스트

> 진행하며 체크. Phase 검증 기준(DEV_PLAN.md §6) 통과 전 다음 Phase 착수 금지.

## 착수 전 (사용자 확인 필요)
- [x] 자막 시스템 구조 확정 (2026-07-08 — PRODUCT_PLAN.md §5. 필앤키 유지 + 서브 직결 + 제어 로컬 + 리모트 특화)
- [x] PRODUCT_PLAN.md §6 UI 영역 해석 확인 (2026-07-09 — 인터랙티브 목업으로 사용자 확인 완료)
- [ ] v1.0 기능 범위 확정 (PRODUCT_PLAN.md §7)
- [ ] 제품명 확정 (현재 가칭 UnoWorship Pro)
- [ ] HDMI↔DisplayLink 할당 최종 확정 (권장: 서브=HDMI, 제어=DisplayLink — Phase 6 리허설)
- [ ] 사전 체험 실험 — HDMI 서브 직결 + IP 컴포저 조작 (PRODUCT_PLAN §5-6 절차, 주중 실험 후 예배 전 복원)

## Phase 0 — 스캐폴드 ✅ (2026-07-09 완료)
- [x] Next.js 15 + 커스텀 서버 + socket.io 초기화 → 검증: 소켓 에코 2건 통과 (vitest)
- [x] zod, vitest, eslint boundary(renderer↛editor) 설정 → 검증: 위반 파일 lint 실패 확인
- [x] `UNOWORSHIP_FIELD_MODE` env 체계 → 검증: production 빌드 기동(:3100) + /health 200 + fieldMode=true
- [x] git 초기화 + 첫 커밋 (5df9c82)

## Phase 1 — 코어 런타임 이식
- [ ] 소켓 페이로드 zod 스키마 정의 (레퍼런스 socketEvents.ts 기반)
- [ ] 소켓 클라이언트 래퍼 — 재조인 내장 → 검증: 서버 재시작 후 자동 재조인 테스트
- [ ] 소켓 서버 이식 + 상태 리플레이 → 검증: 늦게 연 창이 현재 상태 표시
- [ ] canvasRenderer/subtitleRenderer 이식 (+hexToRgba 가드)
- [ ] AtemOutputCanvas 이식 (+렌더 루프 try/catch) → 검증: 비정상 페이로드 주입 생존
- [ ] black-white promptLayout 이식
- [ ] `/out/fill|key|sub` 라우트 → 검증: 송출 1건 3창 각자 도달 (headless 브라우저)

## Phase 2 — 송출 모듈 + 오퍼레이터
- [ ] features/broadcast 단일 송출 모듈 → 검증: 마운트 시 송출 0건 자동 테스트
- [ ] 상단 바 + 우측 오퍼레이터 패널 (운영 모드)
- [ ] 리모트 오퍼레이터 스텁 (`/remote` — 송출/다음/이전/블랙아웃 큰 버튼)
- [ ] 블랙아웃 → 검증: 블랙아웃 중 리로드해도 유지

## Phase 3 — 멀티뷰 + PGM 프리뷰
- [ ] 하단 3분할 멀티뷰 → 검증: 3개 뷰포트 스크롤 없음
- [ ] PGM 리니어 키 합성 → 검증: 테스트 패턴 실키 동일
- [ ] 캡처/WebRTC 소스 선택

## Phase 4 — 에디터
- [ ] 새 스토어 (셀렉터 강제, persist 디바운스, 바이너리 분리, 라이브 상태 포함)
- [ ] 세트리스트 + 편집 캔버스 + 모드 전환
- [ ] → 검증: 드래그 중 IDB 쓰기 ≤1/초, 리로드 완전 복원, iPad 실기기

## Phase 5 — 임포터 + 템플릿
- [ ] 성경/찬송/PPT/유튜브 이식 → 검증: 각 1건 엔드투엔드
- [ ] 성가 시나리오 템플릿

## Phase 6 — 운영 패키징
- [ ] 자동실행/전체종료/진단 스크립트 (프로덕션 기동)
- [ ] 로그 로테이션, 오프라인 전 기능 확인
- [ ] DisplayLink 배치 리허설 (영상 프레임 드랍 확인, HDMI↔DisplayLink 비교 → 최종 배치 확정)
- [ ] → 검증: 맥미니 실장비 리허설 통과
