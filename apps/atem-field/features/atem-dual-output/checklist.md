<!-- ATEM 두 출력 독립 제어 기능의 구현 체크리스트 -->
# ATEM 두 출력 독립 제어 — 구현 체크리스트

기획: [docs/UNOLIVE_DUAL_OUTPUT_INDEPENDENT_CONTROL_BRIEF_2026-07-02.md](../../docs/UNOLIVE_DUAL_OUTPUT_INDEPENDENT_CONTROL_BRIEF_2026-07-02.md)

## Phase 1 — 스토어 채널별 상태 (기반, 후방호환) ✅ 완료 2026-07-02
- [x] `lib/store.ts` 현재 구조 파악 (전역 단일 상태 키 확인)
- [x] `dualOutputModel` 을 store 에 import
- [x] `outputChannels: { main, sub }` 상태 추가 (기본값 = 미러)
- [x] 채널별 액션: `setChannelSection`, `setChannelStyle`, `setChannelBlackout`, `setChannelContentMode`, `resetChannelsToMirror`
- [x] 기본값이 미러라 기존 송출이 100% 동일하게 동작 (아무 경로도 outputChannels 미참조 = 순수 추가)
- [x] 타입체크 통과 (`tsc --noEmit` 에러 0)
- [ ] persist 제외 확인 (partialize 미포함 = 런타임 상태, 의도됨)

## Phase 2 — 운영자 채널 선택 + 독립 송출 ✅ 코어 완료 2026-07-02
- [x] OperatorPanel 상단 [회중][무대][양쪽] 탭 (status bar 아래 배치)
- [x] 선택 채널 → `targets` 배선 (`applyOperatorChannelTargets` 로 messageTargets 변환)
- [x] 무대만 송출 시 회중 미변경 (sub→['prompt']→isPromptOnlySend→블랙아웃/broadcastSection 미변경, 기존 게이팅 재사용)
- [x] "선택 출력에만 송출" 시각 표시 (channel≠both 일 때 amber 안내)
- [x] 타입체크 0 에러 + 3000 실서버가 신규 코드 컴파일 확인 (.next 청크에 applyOperatorChannelTargets/송출 대상 존재)
- [ ] (남음) SetlistPanel 등 OperatorPanel 밖 송출 경로도 채널 반영 — 현재 activeChannel 은 OperatorPanel 로컬 상태라 키보드/버튼 송출(sendToOutput)만 적용됨
- [ ] (권장) 브라우저 시각 확인 — 이번엔 도구(preview MCP/browse 데몬) 문제로 자동 검증 못 함, 운영 composer 새로고침으로 육안 확인 가능

## Phase 3 — 요소 가시성 매트릭스 + 스타일
- [x] 요소 편집 패널에 회중/무대 가시성 토글 — **이미 존재**(ElementPanel "출력" Row, visibleOn 토글). 2026-07-02 라벨을 회중/무대/방송으로 통일 (canvasTypes CANVAS_RENDER_TARGET_OPTIONS)
- [x] S3(한쪽 유튜브·한쪽 자막) / S5(다른 레이어) — 요소 라우팅으로 이미 가능
- [ ] 채널별 스타일 프로파일 선택 (같은 가사·다른 디자인 = S1, mirror-with-style) — **미구현, 다음 핵심**
- [ ] (선택) 레이어×출력 매트릭스 뷰 — 기능은 요소 토글로 충족, 시각화는 후순위
- [ ] activeChannel 스토어 승격 → SetlistPanel 등 모든 송출 경로 반영 (Phase 2 잔여)

## Phase 4 — 무대 콘텐츠↔스테이지 전환
- [ ] 무대 채널 `콘텐츠 ↔ 스테이지` 토글
- [ ] `/atem-sub` 스테이지 레이아웃 (다음가사/다음곡/타이머/메모)
- [ ] 검증: S2·S3 무대측

## 제품화 (Plus)
- [ ] 기본 제공 템플릿 5~8개 (브리프 §6-7)
- [ ] "내 템플릿" 저장/불러오기 (정적 프리셋)
- [ ] ProgramMirror 회중/무대 미리보기 분리

## Pro (범위 밖, 기록만)
- [ ] Looks 프리셋 + Cue 엔진 (동적 자동 전환)
- [ ] N출력 확장 (로비/온라인) — 채널 배열 일반화
