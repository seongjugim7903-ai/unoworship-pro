# 첫 Electron 수동 배포 준비 기획서

> 2026-07-22 자체 점검 보완: 이 문서는 현장 체크리스트로 유지한다. 제품·클라우드·로컬 데이터의 최신 경계는 `unoworship-pro/docs/UNOWORSHIP_SAAS_ELECTRON_DATA_ARCHITECTURE_PLAN.md`가 우선한다. 현재 Electron 골격은 패키지 내부에서 `npm/tsx`를 실행하고 프로젝트 `data/`를 참조하므로 그대로 배포하지 않는다.

작성일: 2026-07-17
대상 프로젝트: `unoworship-pro/apps/atem-field` 클린 복제본
배포 성격: 첫 현장 안정판, 수동 업데이트, 예배 후 배포
권장 배포 시점: 클린 복제·standalone 패키징·현장 리허설 통과 후 예배가 없는 시간

## 1. 배포 목표

첫 Electron 배포의 목표는 새 기능을 많이 넣는 것이 아니라, 현재 예배 현장에서 검증된 ATEM Linear Key 운영 구조를 데스크탑 앱 형태로 안정적으로 고정하는 것이다.

핵심 기준은 다음과 같다.

- 방송 담당자가 바탕화면 아이콘 또는 앱 실행만으로 제어 화면을 열 수 있어야 한다.
- `Input 4 = Fill Source`, `Input 5 = Key Source`, `Key Type = Linear Key`, `ON AIR` 구조가 흔들리지 않아야 한다.
- 기존 프로그램, 찬송가, 찬양대 요청 파일, 성경/찬송 로컬 데이터가 사라지지 않아야 한다.
- 예배 직전에는 자동 업데이트가 절대 개입하지 않아야 한다.
- 문제 발생 시 이전 실행 방식으로 즉시 돌아갈 수 있어야 한다.
- 설치된 앱 본체와 `~/Documents/UnoWorship Library`의 교회 데이터를 완전히 분리해야 한다.

## 2. 현재 반드시 확인할 구조 차이

현재 현장에서 성공한 구조는 다음과 같다.

- 제어 화면: `/composer`
- Fill 화면: `/atemsignal/fill?mode=fill` → ATEM Input 4
- Key 화면: `/atemsignal/key?mode=key` → ATEM Input 5
- Sub 화면: `/atem-sub`
- 카메라 릴레이: `/cameras-source`
- 실행 스크립트: `scripts/UnoLive-Pro-4Screen-Start.command`

반면 현재 `electron/main.js`의 기본 창 배치는 아직 다음 구조에 가깝다.

- 제어 화면: `/`
- 프롬프트: `/prompt`
- 아웃풋: `/output`

따라서 첫 Electron 배포 전 다음 구조로 확정한다.

1. Electron 앱이 `/composer`, Fill, Key, `/atem-sub`, 카메라 릴레이 창을 직접 담당한다.
2. 기존 Chrome 4화면 스크립트는 비상 롤백 수단으로 유지한다.

단순 화면 좌표 정렬이 아니라 현장 EDID 프로필로 역할을 매핑하고, 장비 변경 시 설정 화면에서 다시 지정할 수 있어야 한다.

## 3. 배포 전 동결 기준

배포 전 마지막 커밋 이후에는 아래 항목만 수정한다.

- 예배 송출 사고를 막는 P0/P1 버그
- 프로그램 저장/불러오기, 송출그리드, Fill/Key, 말씀찾기 분할 같은 운영 핵심 오류
- Electron 패키징에 필요한 설정

배포 전에는 다음 작업을 보류한다.

- 대규모 UI 개편
- 새 기능 실험
- 데이터 구조 변경
- 자동 업데이트 적용
- 인증/구독 플로우 대규모 변경

## 4. 백업 대상

배포 전 기존 개발 폴더의 아래 자료를 `~/Documents/UnoWorship Library` 구조로 이관하기 위한 백업을 만든다.

- `data/programs/`
- `data/templates/`
- `data/bibles/`
- `data/hymns/`
- `FILES/01_HYMNS/`
- `FILES/02_PRAISE/`
- `generator/ppt-slides/`
- `public/generated/ppt-slides/`
- `scripts/UnoLive-Pro-4Screen-Start.command`
- `scripts/monitor-config.sh`
- 바탕화면 실행 아이콘
- `.env.local`은 별도 보안 백업만 하고 앱 데이터 백업에 포함하지 않는다.

주의: 현재 `package.json`은 `data/**/*`를 넓게 포함한 뒤 일부만 제외한다. 정식 패키지는 반대로 코드와 저작권 문제가 없는 기본 리소스만 명시적으로 포함해야 한다. 실제 교회 데이터는 공용 설치파일에 한 건도 포함하지 않는다.

## 5. 빌드 전 필수 검증

배포 전 최소 검증 명령은 다음이다.

- `npm run lint`
- `npm run build`
- `npm run electron:pack`
- `npm run electron:build`
- `npm audit --omit=dev` 결과 검토

2026-07-22 클린 복제 검사에서는 production 의존성 경고 21건(critical 1, high 10 포함)이 확인되었다. 기능 보존 없이 `npm audit fix --force`를 적용하지 말고, 별도 업그레이드 커밋과 현장 회귀 테스트 후 해소한다.

검증 중 특히 확인할 항목:

- Next.js standalone 서버가 패키지 안에서 `npm`과 `tsx` 없이 직접 기동하는지
- 앱 종료 시 내부 서버 프로세스가 같이 정리되는지
- 카메라/마이크/디스플레이 권한이 막히지 않는지
- `X-Device-Token` 주입이나 임시 인증 우회 상태가 운영 정책과 충돌하지 않는지
- `.dmg` 설치 후 앱이 `/Applications`에서 실행되는지
- 설치 앱이 `app.asar` 또는 `/Applications` 내부에 파일을 쓰지 않는지
- 프로그램 저장·PPT 변환·녹화가 외부 로컬 라이브러리 경로를 사용하는지

## 6. 현장 기능 체크리스트

### Composer

- `/composer` 진입
- 프로그램 리스트 로딩
- 섹션 선택
- 섹션 송출
- 디자인/PMT/프로그램 배경/모션 메뉴 기본 작동
- PPT 이미지 폴더 가져오기
- 같은 제목 저장 시 `(1)` 번호 저장

### 송출그리드

- 송출그리드모드 진입
- 찬송가 첫 섹션 장/제목 표시
- 찬송가 절 표시
- `말씀찾기(본문)` 번호 우선 송출
- `말씀찾기(인용)` 번호송출 고정 패널
- 긴급 말씀찾기 텍스트/이미지 추가 후 저장 유지
- Main/Sub/송출그리드 내용 검증 경고

### Bible / Hymn

- 로컬 성경 책/장/절 검색
- `말씀찾기(본문)` 생성
- `말씀찾기(인용)` 생성
- 본문 텍스트가 템플릿 박스를 넘칠 때 자동 섹션 분할
- `autoFit`으로 글자만 줄여 맞추지 않는지 확인

### ATEM Linear Key

- ATEM Input 4 = Fill Source
- ATEM Input 5 = Key Source
- Key Type = Linear Key
- DSK/Key `ON AIR`
- Camera 4: 원본 Fill 화면
- Camera 5: 흑백 Key 매트 화면
- Program: 검은 글자/음표가 빠지지 않는지 확인
- PNG 반투명 배경이 딱딱하게 뭉개지지 않는지 확인

### 라이브/녹화

- ATEM USB 클린피드 장치 선택
- 라이브 시작 버튼 활성화
- 제목/공개범위/비트레이트 설정 반영
- 녹화 시작/종료
- 녹화 파일 위치 열기
- 마커 녹화 저장

## 7. 수동 업데이트 흐름

첫 배포는 자동 업데이트를 넣지 않는다.

권장 흐름:

1. 예배 종료 후 현재 운영 폴더 전체 백업
2. Git 커밋 및 태그 생성
3. Electron build 생성
4. `.dmg` 또는 압축 파일로 보관
5. 새 앱 설치
6. 첫 실행에서 기존 데이터 폴더를 외부 로컬 라이브러리로 이관 또는 연결
7. 현장 체크리스트 전체 통과
8. 이전 앱/스크립트는 삭제하지 않고 백업으로 유지

버전명 예시:

- `UnoWorship-ATEM-Field-0.1.0-20260719`

## 8. 롤백 계획

문제가 생기면 즉시 아래 순서로 되돌린다.

1. Electron 앱 종료
2. 기존 개발 서버 또는 기존 Chrome 실행 스크립트 실행
3. `scripts/UnoLive-Pro-4Screen-Start.command`로 Composer/Fill/Key/Sub/Relay 재실행
4. ATEM에서 Input 4/5와 DSK ON AIR 확인
5. 필요하면 백업한 `data/`, `FILES/`, `public/generated/`를 복원

롤백 기준:

- 앱 실행 후 3분 안에 Composer가 안정적으로 열리지 않음
- Fill 또는 Key 화면 중 하나가 반복적으로 검정/바탕화면/컬러 오동작
- 프로그램 저장 데이터가 누락됨
- 예배 중 송출그리드 번호 송출이 예상과 다르게 작동함

## 9. 배포 전 놓치기 쉬운 항목

- macOS 보안 설정에서 미확인 개발자 앱 실행 허용
- Chrome 기반 기존 키오스크 창과 Electron 창이 동시에 같은 포트를 잡지 않게 정리
- 기존 개발 서버가 켜진 상태에서 Electron standalone 서버가 중복 실행되지 않는지 확인
- 맥미니 제어 모니터가 메인 디스플레이로 고정되어 있는지 확인
- HSC TV, Blackmagic 입력이 macOS 디스플레이 순서에서 바뀌지 않았는지 확인
- `UNOLIVE_ATEM_IP` 현장 IP 값 확인
- 예배 전 자동 절전, 디스플레이 절전, 화면보호기 끄기
- 설치 후 바탕화면 아이콘/앱 이름을 운영자가 헷갈리지 않게 정리
- 디스크 여유 공간, 로컬 라이브러리 백업 위치, 데이터 스키마 버전 확인

## 10. 이번 첫 배포의 완료 조건

첫 Electron 배포는 아래가 모두 통과되면 완료로 본다.

- 앱 설치 및 수동 실행 성공
- Composer 제어 화면 정상
- Fill/Key 출력 정상
- ATEM Program 합성 정상
- 송출그리드 번호 송출 정상
- 말씀찾기 본문/인용 저장 및 분할 정상
- PPT 변환 프로그램 로딩 정상
- 녹화/라이브 최소 1회 테스트 성공
- 앱 종료와 재실행 후 데이터 유지
- 기존 스크립트 롤백 경로 유지

## 11. 다음 단계

이번 첫 배포 이후에야 다음 작업을 검토한다.

- 앱 내부 수동 업데이트 버튼
- 릴리스 노트 표시
- 설정 화면에서 ATEM Input 4/5 안내
- 교회별 디스플레이 프로파일 저장
- 코드 서명/공증
- 정식 자동 업데이트
