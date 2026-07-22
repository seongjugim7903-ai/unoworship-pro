# UnoLive ATEM Linear Key 성공 기록

작성일: 2026-06-30
프로젝트: UnoLive-plus-atem-field
현장 구조명: ATEM Linear Key 3화면 구조

## 1. 결론

2026년 6월 30일 현장 테스트에서 ATEM Linear Key 방식으로 검은 글자/악보가 투명하게 빠지는 문제를 해결했다.

성공한 핵심은 맥미니에서 ATEM으로 나가는 두 개의 입력을 명확히 분리한 것이다.

- ATEM Input 4 = Fill Source
- ATEM Input 5 = Key Source
- Key Type = Linear Key
- DSK/Key ON AIR

기존 Luma Key 방식에서는 검정색 글자, 음표, 그림자가 배경처럼 인식되어 투명하게 빠졌다. Linear Key 방식에서는 Fill 화면과 Key 화면을 따로 보내기 때문에 검정색 글자도 정상적으로 보존할 수 있다.

## 2. 화면과 입력 역할

### 제어 화면

- 역할: 방송 담당자가 사용하는 Composer 제어 화면
- 주소: `/composer`
- 위치: 제어 모니터

### Fill 화면

- 역할: 실제 자막/악보/이미지의 원본 색상 화면
- 주소: `/atemsignal/fill?mode=fill`
- ATEM 입력: Input 4
- ATEM 설정: Fill Source

### Key 화면

- 역할: ATEM이 투명도를 판단하기 위한 흑백 매트 화면
- 주소: `/atemsignal/key?mode=key`
- ATEM 입력: Input 5
- ATEM 설정: Key Source

Key 화면은 배경을 완전 검정으로 두고, 송출되어야 할 자막/악보/이미지 영역만 흰색 또는 흰색 기반 매트로 만든다. 이 화면이 ATEM에서 알파 채널 역할을 한다.

## 3. 이번 성공의 직접 원인

문제의 핵심은 5번 입력 창이 Key 모드로 동작하지 않고 Fill과 같은 화면을 내보내는 상황이었다.

이를 해결하기 위해 다음 두 가지를 고정했다.

1. 실행 스크립트에서 Fill과 Key 창의 URL을 다르게 연다.
2. `AtemKeyCanvas`가 URL의 `?mode=key` 또는 `?mode=fill`을 직접 읽어서 렌더링 모드를 결정한다.

즉, 5번 HSC TV 확장 디스플레이 창은 반드시 `/atemsignal/key?mode=key`로 열려야 한다.

## 4. 수정된 주요 파일

### `components/atem-key/AtemKeyCanvas.tsx`

- URL 파라미터에서 `mode=key`, `mode=fill`, `mode=luma`를 읽는 로직 추가
- `resolvedSignalMode`를 기준으로 Fill/Key 렌더링 분기
- Key 모드에서 이미지/텍스트/도형을 Key 매트용으로 렌더링
- 디버그 모드에서 현재 모드를 `mode: key` 또는 `mode: fill`로 표시

### `scripts/UnoLive-ATEM-LinearKey-Start.command`

- 4번 Fill 창 주소를 `/atemsignal/fill?mode=fill`로 고정
- 5번 Key 창 주소를 `/atemsignal/key?mode=key`로 고정
- Composer, Fill, Key 3개 창을 전용 Chrome 프로필로 실행

### `scripts/mac-atem-fill-kiosk.sh`

- Fill 단독 실행 주소를 `/atemsignal/fill?mode=fill`로 고정

### `scripts/mac-atem-key-kiosk.sh`

- Key 단독 실행 주소를 `/atemsignal/key?mode=key`로 고정

### `app/display/page.tsx`

- `/display?mode=fill` 또는 `/display?mode=key` 형태도 받을 수 있는 호환 라우트 추가

## 5. 바탕화면 실행 아이콘

새 Linear Key 전용 실행 아이콘:

`/Users/kimseongju/Desktop/UnoLive-ATEM-LinearKey-실행.command`

기존 `UnoLive-ATEM-3화면-실행.command`는 Main/Sub 확장모니터 중심 구조에 가까우므로, ATEM Linear Key 테스트와 운영에서는 새 아이콘을 사용한다.

## 6. 현장 재현 절차

1. 맥미니 제어 모니터를 메인 디스플레이로 둔다.
2. 맥미니의 출력 2개를 각각 HDMI to SDI 컨버터를 거쳐 ATEM Input 4, Input 5로 연결한다.
3. ATEM Software Control에서 DSK/Key 설정을 다음처럼 맞춘다.
   - Fill Source: Camera 4
   - Key Source: Camera 5
   - Key Type: Linear Key
   - ON AIR
4. 바탕화면에서 `UnoLive-ATEM-LinearKey-실행.command`를 실행한다.
5. ATEM 멀티뷰에서 확인한다.
   - Camera 4: 원본 Fill 화면
   - Camera 5: Key 매트 화면
6. Composer에서 섹션을 송출한다.
7. Program 화면에서 검정 글자/음표가 빠지지 않고 카메라 영상 위에 합성되는지 확인한다.

## 7. 문제가 다시 생길 때 체크할 것

### Camera 5가 컬러 화면으로 보일 때

- 5번 창 URL 끝에 `?mode=key`가 붙었는지 확인
- 잘못된 바탕화면 아이콘을 실행한 것은 아닌지 확인
- HSC TV 디스플레이가 확장 모드인지 확인

### 검정 글자가 다시 빠질 때

- ATEM에서 Luma Key로 되어 있지 않은지 확인
- Fill Source와 Key Source가 같은 입력으로 잡혀 있지 않은지 확인
- Input 4와 Input 5가 서로 바뀌지 않았는지 확인
- DSK/Key가 ON AIR인지 확인

### 브라우저 주소창이나 바탕화면이 보일 때

- 키오스크 실행이 실패했을 가능성이 있다.
- Chrome 창을 닫고 새 Linear Key 실행 아이콘으로 다시 실행한다.
- 필요하면 해당 창에서 전체화면 상태를 다시 확인한다.

## 8. 이번 구조의 의미

이제 UnoLive는 단순 확장모니터 송출 방식뿐 아니라 ATEM SDI 스위처 환경에서도 자막기 역할을 할 수 있는 기반을 확보했다.

이번 구조는 향후 UnoWorship Pro/Premium 방향의 중요한 출발점이다.

- Plus: 저예산 확장모니터 기반 운영
- Pro/Premium: ATEM/SDI/Linear Key 기반 전문 방송실 운영

이번 성공으로 검은 글자와 악보 이미지가 포함된 예배 자막도 ATEM 카메라 영상 위에 안정적으로 합성할 수 있는 가능성이 확인되었다.

## 9. 다음 개발 메모

- Fill/Key 창 상태를 Composer에서 진단할 수 있는 상태 표시 추가
- Input 4/5 매핑을 설정 화면에서 교회별로 저장
- ATEM Software Control 설정 체크리스트를 앱 내부 안내로 제공
- PPT 이미지 변환 결과가 Fill/Key 구조에서 안정적으로 보이는지 추가 검증
- Main/Sub 출력 구분과 Fill/Key 입력 구분을 문서와 UI에서 계속 분리해서 관리
