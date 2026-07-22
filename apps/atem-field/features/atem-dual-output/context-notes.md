<!-- ATEM 두 출력 독립 제어 구현 중 내려진 결정과 근거를 계속 append 하는 노트 -->
# ATEM 두 출력 독립 제어 — 컨텍스트 노트

작성 시작: 2026-07-02

## ⛔ 폐기됨 (2026-07-02) — 다시 시도하지 말 것
이 문서의 "두 출력(회중/무대) 독립 제어" 전 방식(채널 선택 UI·store outputChannels·ATEM Aux 스위칭·DSK 클린피드 스플릿·output PMT 렌더 분기)은 **전부 코드에서 제거·원복됨.**
- 사유: 현장 맥미니가 두 출력 동시 렌더를 못 버팀 — **버벅임 + 페이지 크래시**(기존엔 없던 크래시 발생).
- 대체 방향: **맥미니에서 무대 모니터로 확장 디스플레이 직접 출력**하고 거기에 prompt(PMT) 창을 띄워 별도 자막 확보. 새 코드 불필요 — 기존 /atem-sub(prompt)+black-white PMT 로 커버.
- 아래 기록은 히스토리(왜 이 길로 안 가는지)로만 보존.

## 확정된 제품 결정 (사용자 합의)
- 무대 모니터(Output 2)는 `콘텐츠 ↔ 스테이지 디스플레이` 런타임 전환식.
- Looks 프리셋(동적 자동 전환)은 Pro로 미룸. Plus는 정적 템플릿까지.
- 설계 원칙: 시나리오를 나열하지 않고 **직교 축(출력·레이어·가시성·스타일·콘텐츠모드·소스)의 조합**으로 표현. 템플릿은 그 매트릭스 엔진의 "제품화 포장"(점진적 공개).

## 아키텍처 사실 (Explore 매핑, 2026-07-02)
- 이미 구현·사용 중: 요소 `visibleOn`([lib/canvasTypes.ts](../../lib/canvasTypes.ts) 79,96-127), 소켓 `targets`([lib/socketEvents.ts](../../lib/socketEvents.ts) 24,63-94), 큐매크로 타겟해석([lib/sectionCueMacro.ts](../../lib/sectionCueMacro.ts) 38-46), 출력별 렌더필터([components/output/OutputCanvas.tsx](../../components/output/OutputCanvas.tsx):71, [components/atem-key/AtemKeyCanvas.tsx](../../components/atem-key/AtemKeyCanvas.tsx):49).
- 정의됐으나 미사용: [dualOutputModel.ts](dualOutputModel.ts) (main/sub 채널·스타일 프로파일·contentMode·blackout 전부 정의).
- 비어있음: `lib/store.ts` 채널별 상태(현재 전역 단일), OperatorPanel 채널선택 UI, 매트릭스 UI, 스테이지 모드.
- 출력 페이지: [app/atem-main/page.tsx](../../app/atem-main/page.tsx)=target output(회중), [app/atem-sub/page.tsx](../../app/atem-sub/page.tsx)=target prompt(무대).

## 후방호환 원칙 (필수)
- 모든 채널 기본값은 미러. 이 기능 안 쓰는 현장은 기존과 100% 동일해야 함. Phase 1은 UI 없이 데이터 계층만.

## Phase 1 구현 결정 (2026-07-02)
- `outputChannels: Record<'main'|'sub', AtemOutputChannelState>` 를 store 에 추가. 초기값은 `createDefaultAtemOutputState`(main=mirror, sub=mirror-with-style + sub-large-white-on-black 프로파일).
- 액션 5종 추가: setChannelContentMode / setChannelSection / setChannelStyle / setChannelBlackout / resetChannelsToMirror. 모든 액션은 `source:'operator'` + `lastUpdatedAt` 기록.
- **persist 안 함**: partialize 에 outputChannels 미포함. broadcastSection/isBlackout 과 같은 런타임 송출 상태로 취급. 리로드 시 미러로 초기화 = 안전.
- 순수 additive: 기존 어떤 경로도 outputChannels 를 읽지 않아 후방호환 100%. tsc 에러 0.
- Date.now() 사용은 앱 코드라 정상(워크플로우 스크립트 아님).

## Phase 2 구현 결정 (2026-07-02)
- OperatorPanel 에 로컬 상태 `activeChannel: 'both'|'main'|'sub'` (기본 both). status bar 아래 [회중][무대][양쪽] 세그먼트 탭.
- `applyOperatorChannelTargets(channel, targets)`: both→그대로(후방호환), main→['output','broadcast'](회중+온라인미러), sub→['prompt'](무대). sendToOutput 의 messageTargets 계산에 주입.
- 핵심 이점: sub 선택 시 targets=['prompt']→기존 `isPromptOnlyTargets` 게이팅이 자동으로 블랙아웃/broadcastSection/YT standby 를 안 건드림. 새 분기 로직 불필요.
- **한계(의도적 스코프)**: activeChannel 은 OperatorPanel 로컬. 키보드 nav/버튼(sendToOutput 경유)은 반영되지만, SetlistPanel 등 다른 송출 경로는 아직 미반영. 전면 적용하려면 store 로 승격 필요 → Phase 3 또는 후속.
- 검증: tsc 0 에러. 3000 실서버 .next 청크에 applyOperatorChannelTargets/outputChannels/'송출 대상' 컴파일 확인. 브라우저 시각검증은 도구 문제(preview MCP가 carrot-management에 바인딩, browse 데몬 기동 실패, Next dev 락으로 2nd 인스턴스 불가)로 자동화 못 함.

## 환경 메모
- preview MCP 도구는 세션 primary project(carrot-management=WDAM)에 묶여 UnoLive를 못 띄움. UnoLive 검증은 이미 떠 있는 3000 인스턴스를 직접 읽어야 함.
- carrot-management: git 아님·817MB 실제 프로젝트. 사용자 지시로 **삭제 안 함**(프리뷰만 정리).

## ★ 핵심 발견 — 물리 출력 토폴로지 (2026-07-02 테스트 후)
- 증상: 회중 송출→두 모니터 다 나옴, 무대 송출→아무데도 안 나옴, 양쪽→나옴.
- 원인(코드 버그 아님): 현재 LinearKey rig의 실제 출력 창인 `/atemsignal/fill`·`/atemsignal/key`가 **둘 다 target="output"(회중) 구독**. `prompt`(무대)를 듣는 창이 rig에 없음.
  - 회중=['output',...] → Fill/Key 수신 → ATEM 리니어키 프로그램 갱신 → 물리 출력에 나옴.
  - 무대=['prompt'] → 듣는 창 없음 → 무반응.
- 결론: 지금 rig엔 **콘텐츠 표면이 "회중" 하나뿐**. 리니어키 1채널이 ATEM 프로그램으로 합성돼 나가므로, 회중≠무대 독립 콘텐츠는 **소프트웨어만으로 불가**. 무대용 독립 표면(별도 창/출력)이 물리적으로 필요.
- 선택지: (A) 무대=맥미니 확장 디스플레이 직접 출력(/atem-sub 등 prompt 구독), ATEM 안 거침, 자막/스테이지 정보만. (B) 무대=ATEM 2번째 키/Aux, 카메라+독립 자막 합성, ATEM 입력·설정 추가.
- 미결정: 사용자에게 토폴로지 확인 요청함.

## ★ 확정 근본원인 — prompt(무대)는 Fill&Key ATEM 체인에 경로 없음 (2026-07-02)
- 소켓 전달: 모든 수신 창이 `output` 방 join, 전체 broadcast 후 클라이언트가 target으로 필터([useSocketReceiver.ts:35](../../hooks/useSocketReceiver.ts)). → 브라우저 /atem-sub는 prompt 메시지 수신 가능.
- 그러나 현재 Fill&Key rig에서 ATEM으로 들어가는 창은 /atemsignal/fill·/atemsignal/key(둘 다 target=output)뿐. **prompt를 ATEM에 넣는 표면이 없음.** → 무대 송출이 ATEM 체인에 낄 자리 없어 물리 출력에 안 나옴.
- PMT/prompt·dual-output 콘텐츠 기능은 확장모니터(/prompt 직접 표시) 전제로 만들어짐. Fill&Key(ATEM)로 이행하며 무대 경로가 끊김.
- 해결: 무대 전용 출력 표면을 ATEM 체인에 신설 필요. 무대 콘텐츠(예: black-white PMT)는 불투명 → 리니어키 불필요 → 단순 풀프레임 소스로 ATEM 입력 1개 + Aux 라우팅으로 무대 출력에 연결이면 됨. 하드웨어 제약(맥미니 출력 개수, ATEM 입출력 여유) 확인 필요.

## ★ 요구 확정 + 하드웨어 한계 (2026-07-02)
- 사용자 확정: **두 출력 다 카메라 영상 필요**, 무대는 **다른/큰 자막**(회중은 항상 원본 작은 자막 유지). 많은 교회가 이걸 원할 것으로 예상 → 제품 기능으로 준비.
- 하드웨어 한계: ATEM은 **M/E 1개 = 합성본 1벌**. "두 출력 각각 카메라+서로 다른 자막"은 1대로 네이티브 불가. Aux는 크로스포인트(입력/PGM/클린피드) 선택만, "카메라+특정 키" 커스텀 합성 못 만듦. 4 USK/2 DSK도 전부 같은 PGM에 스택됨.
- 제안서 Aux=Fill 트릭: 무대=Fill(검정배경 글자, **카메라 없음**)만 가능 → "무대 카메라" 요구 미충족.
- 현실 옵션: (A) 무대 창에 카메라를 소프트웨어 합성(WebRTC 카메라 + 텍스트 오버레이 → ATEM 입력 → Aux → 무대). 1 ATEM 가능, 지연/카메라소스 이슈. (B) 2 M/E 스위처(상위 하드웨어) 네이티브. (C) 타협: 무대=PGM 미러(카메라+같은 자막) 또는 카메라 없는 프롬프트.
- 미확인: 카메라가 시스템에 어떻게 들어오나(ATEM SDI 카메라 vs 브라우저 WebRTC 웹캠) — (A) 실현성 좌우.

## ★ 최종 아키텍처 확정 — DSK 클린피드 스플릿 (2026-07-02)
- 요구: 양쪽 카메라 유지 + PMT시 회중=깨끗한 카메라, 무대=카메라+큰글자.
- 정답: 자막은 DSK1(다운스트림)에 두고, PMT시 **회중 Aux 소스만 PGM→Clean Feed 1**로 전환(DSK 빠져 격리). 무대=PGM(카메라+DSK 큰글자). DSK/USK 토글 없음, 캡처장치 없음, Fill4/Key5 배선 불변.
- USK 안 쓰는 이유: 업스트림이라 PGM에 박혀 회중 격리 불가.
- 현장 확인됨: 회중=라우팅가능 Aux, Clean Feed 1 존재(DSK 제외 카메라).
- 구현 완료: [AtemKeyCanvas.tsx:414](../../components/atem-key/AtemKeyCanvas.tsx) output+black-white 대형렌더 분기, [atemBridge.ts](../../lib/atemBridge.ts) setCongregationClean(Aux PGM↔CleanFeed1) + 소스상수. tsc 0.
- 남음: congregationAuxBus 실제번호(사용자), /api/atem aux 액션, sendToOutput 트리거(+PMT off 플래시 순서), 브라우저/현장 검증.
- 상세: [docs/UNOLIVE_DUAL_OUTPUT_DSK_CLEANFEED_SPLIT_BRIEF_2026-07-02.md](../../docs/UNOLIVE_DUAL_OUTPUT_DSK_CLEANFEED_SPLIT_BRIEF_2026-07-02.md)

## DSK 클린피드 스플릿 구현 완료 (2026-07-02)
- 전체 배선 완료, tsc 0. 안전 게이트 dualOutputAuxEnabled=false 기본(라이브 보호).
- 파일: AtemKeyCanvas(output+black-white 렌더), atemBridge(setCongregationClean+config), api/atem(aux 액션), lib/dualOutputAux.ts(헬퍼), OperatorPanel/SetlistPanel(트리거).
- 사용자 확정: 회중 모니터 = ATEM **출력 2번**. congregationAuxBus는 그 출력이 물린 Aux 버스 번호−1로 설정 필요(출력번호≠Aux버스번호 주의).
- 활성화: config로 congregationAuxBus 지정 + dualOutputAuxEnabled=true, 라이브 밖에서 검증.
- 미검증: 실제 ATEM 전환/렌더(브라우저·현장), Key 매트의 다음가사 회색 반투명 가능성.

## 활성화 (2026-07-02)
- 사용자 확인: Output 2 = Aux 2 (물리포트=Aux 1:1 매핑). congregationAuxBus=1, dualOutputAuxEnabled=true 로 DEFAULT_ATEM_CONFIG 설정.
- ★ 적용 주의: AtemBridge 싱글턴의 this.config 는 **마지막 connect 시점** 값. 코드 리로드만으론 안 바뀜 → 새 기본값 적용하려면 **ATEM 재연결**(또는 /api/atem?action=config 로 푸시).
- ★ 미검증 상태로 켜짐 → 최초 테스트는 반드시 라이브 예배 밖에서.

## 진행 로그
- 2026-07-02: 기획 브리프 확정, checklist/context-notes 생성.
- 2026-07-02: Phase 1(스토어 채널 상태) 구현 완료, 타입체크 통과.
- 2026-07-02: Phase 2(운영자 채널 탭 + 타겟 배선) 코어 완료. 실서버 컴파일 확인. SetlistPanel 반영은 후속.
