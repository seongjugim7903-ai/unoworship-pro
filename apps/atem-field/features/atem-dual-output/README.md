# ATEM Fill/Key + Dual Output Control

## Goal

M4 Mac mini + ATEM field setup에서 두 가지 축을 분리해 준비한다.

1. ATEM Linear Key용 입력 소스 쌍: `/atem-fill` + `/atem-key`
2. ATEM Output 1/2 목적지 분리: `/atem-main` + `/atem-sub`

기존 출력 번호를 바꾸지 않는다. 앱은 ATEM 입력 소스와 ATEM 출력 목적지를 논리적으로만 제어한다.

## Linear Key Experiment

우선 실험 기준 네이밍은 아래처럼 고정한다.

```text
제어 모니터
→ Composer 제어 화면

확장 모니터 1
→ /atem-fill
→ USB-C to HDMI → HDMI to SDI → ATEM Input 4

확장 모니터 2
→ /atem-key
→ USB-C to HDMI → HDMI to SDI → ATEM Input 5
```

ATEM Software Control 설정:

```text
Input 4 = Fill Source
Input 5 = Key Source
Key Type = Linear Key
ON AIR
```

운영 조건:

- 해상도: 1920x1080
- 주사율: ATEM 기준과 동일, 보통 59.94 또는 60
- 색상/동적 범위: `/atem-fill`과 `/atem-key` 모두 동일
- 컨버터: 같은 모델 2개 권장

이 구조는 기존 Luma Key 한계를 줄이는 핵심 실험이다.

- 검정 글자 가능
- 컬러 자막 가능
- PPT 원본 색상 유지 가능
- 반투명 배경 가능
- 로고/디자인 요소 정확도 상승

## Output Destinations

ATEM 최종 출력 목적지는 아래 이름으로 둔다.

- MAIN / 강대상: ATEM Output 1, UnoLive target `output`, route `/atem-main`
- SUB / 중상층: ATEM Output 2, UnoLive target `prompt`, route `/atem-sub`

`/atem-fill`과 `/atem-key`는 ATEM 입력 소스이고, `/atem-main`과 `/atem-sub`는 ATEM 출력 목적지다. 이름이 비슷하지만 담당 축이 다르다.

## Hardware Constraint

Fill/Key 한 쌍은 "하나의 Linear Key 합성 소스"를 만드는 구조다. 따라서 이 한 쌍만으로 MAIN과 SUB에 서로 다른 자막을 동시에 얹을 수 있는지는 ATEM 모델과 keyer/output routing 지원 여부에 달려 있다.

두 ATEM 출력에 서로 다른 키 자막을 진짜로 만들려면 아래 중 하나가 필요하다.

1. MAIN용 Fill/Key와 SUB용 Fill/Key를 따로 넣고, ATEM에서 두 키 경로를 독립 운용한다.
2. ATEM 출력 1/2가 독립 Aux/Key 경로를 지원하고, 각 출력에 다른 keyed source를 라우팅할 수 있다.
3. ATEM DSK 공유 키잉을 쓰지 않고, Mac/브라우저가 각 화면의 완성 영상을 따로 만들어 보낸다.

이 폴더의 1차 준비는 Linear Key 입력 소스 쌍과 앱 레벨의 독립 채널 모델이다. 현장 적용 전에는 실제 ATEM 모델의 keyer/output routing 가능 여부를 확인한다.

## MVP Functions

- `linear-key`: `/atem-fill`은 원본 색상, `/atem-key`는 흰색 알파 마스크를 출력한다.
- `mirror`: 같은 가사/섹션을 MAIN과 SUB에 동시에 보낸다.
- `mirror + style override`: 같은 내용이지만 SUB는 큰 글자, 흰색/검정 배경, 위치 변경 등 별도 스타일을 적용한다.
- `independent`: MAIN과 SUB가 서로 다른 텍스트 또는 다른 섹션을 유지한다.
- `target send`: 현재 섹션을 MAIN만, SUB만, 또는 둘 다로 보낸다.
- `channel clear/blackout`: MAIN/SUB 개별 지우기와 전체 지우기를 지원한다.
- `safe fallback`: SUB 설정이 없으면 MAIN과 같은 내용을 표시한다.

## PMT Routing Rule

기존 확장 모니터 PMT 기능은 아래처럼 분리해서 유지한다.

- PMT 레이아웃 선택(`black-white`)은 SUB 화면 스타일 오버라이드다.
- `프롬프트 전용 송출`이 켜진 경우에만 SUB만 업데이트한다.
- 일반 송출에서는 MAIN은 기존 회중용 자막으로 업데이트하고, SUB는 선택된 PMT 스타일로 렌더링한다.

## Existing Anchors

- `app/atem-fill/page.tsx`: ATEM Input 4 / Fill Source. 현재 `AtemKeyCanvas target="output" signalMode="fill"` 사용.
- `app/atem-key/page.tsx`: ATEM Input 5 / Key Source. 현재 `AtemKeyCanvas target="output" signalMode="key"` 사용.
- `app/atem-main/page.tsx`: MAIN 출력 페이지. 현재 `AtemKeyCanvas target="output"` 사용.
- `app/atem-sub/page.tsx`: SUB 출력 페이지. 현재 `AtemKeyCanvas target="prompt"` 사용.
- `components/atem-key/AtemKeyCanvas.tsx`: ATEM 키 출력 캔버스. target별 렌더링 분기 가능.
- `lib/canvasTypes.ts`: `CanvasRenderTarget = 'output' | 'prompt' | 'broadcast'`.
- `lib/socketEvents.ts`: 소켓 메시지 `targets`로 화면별 라우팅 가능.
- `components/composer/setlist/SectionCueMacroModal.tsx`: 이미 MAIN만/SUB만/전체 송출 선택 UI가 있음.
- `scripts/UnoLive-ATEM-LinearKey-Start.command`: `/atem-fill`, `/atem-key`, `/composer` 3화면 실험 런처.
- `scripts/UnoLive-ATEM-3Screen-Start.command`: `/atem-main`, `/atem-sub`, `/composer` 3화면 실행 준비가 있음.

## Proposed Structure

```text
features/atem-dual-output/
  README.md              # 설계와 구현 범위
  linearKeyModel.ts      # /atem-fill + /atem-key 입력 소스 타입/매핑
  dualOutputModel.ts     # MAIN/SUB 채널 타입, 하드웨어 매핑, 기본 상태
  index.ts               # 앱 연결용 public export
```

## Field Test Order

1. M4 Mac mini에 확장 화면 2개 추가 인식.
2. 확장 화면 A에 `/atem-fill` 전체화면.
3. 확장 화면 B에 `/atem-key` 전체화면.
4. ATEM Input 4/5에 각각 들어오는지 확인.
5. ATEM Software Control에서 Linear Key 설정.
6. Composer에서 섹션 송출 테스트.

## Next Implementation Steps

1. `scripts/UnoLive-ATEM-LinearKey-Start.command`로 Composer + Fill + Key 3화면을 띄운다.
2. `/atem-fill`과 `/atem-key`가 같은 섹션을 정확히 동기 렌더링하는지 확인한다.
3. Fill/Key 입력이 ATEM Input 4/5로 안정적으로 들어오는지 확인한다.
4. Linear Key 성공 후 `dualOutputModel.ts`의 `main/sub` 채널 모델을 composer 송출 로직에 연결한다.
5. SUB 전용 스타일 프로필과 독립 송출 상태를 저장소에 추가한다.
