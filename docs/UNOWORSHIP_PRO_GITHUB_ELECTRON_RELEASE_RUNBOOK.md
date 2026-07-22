# UnoWorship Pro GitHub·Electron 이관 및 설치 절차서

작성일: 2026-07-22

## 1. 문서 목적

이 문서는 현재 맥미니에서 개발·운영 중인 ATEM 자막 프로그램을 안전하게 GitHub에 보존하고, 향후 Electron 설치형 `UnoWorship Pro`로 빌드하여 같은 맥미니 또는 다른 교회 컴퓨터에 설치하는 전체 절차를 정의한다.

이 절차는 다음 네 영역을 혼동하지 않는 것을 최우선으로 한다.

1. Vercel에서 서비스하는 구독 교회 입력 웹
2. Supabase에 저장되는 교회별 클라우드 자료
3. GitHub에 저장되는 소스 코드
4. Electron 설치 컴퓨터에만 저장되는 교회 로컬 자료

제품·데이터 구조의 상세 기준은 `UNOWORSHIP_SAAS_ELECTRON_DATA_ARCHITECTURE_PLAN.md`를 함께 따른다.

## 2. 확정된 주소와 저장소

```text
GitHub
  seongjugim7903-ai/unoworship-pro

Vercel 입력 웹
  https://unoworship-pro-eight.vercel.app

Supabase 프로젝트
  hwbzztfjzeismosjkmhe

기존 현장 운영 원본
  /Users/kimseongju/unogstack/projects/UnoLive-plus-atem-field

GitHub 클린 복제본
  /Users/kimseongju/unogstack/projects/unoworship-pro/apps/atem-field
```

Supabase URL과 프로젝트 ref는 공개 식별자지만 `SUPABASE_SERVICE_ROLE_KEY` 값은 문서·브라우저·Electron·GitHub에 기록하지 않는다.

## 3. 한 저장소 안의 두 제품

```text
unoworship-pro/
  app/                    구독 교회 입력 웹, Vercel 배포 대상
  lib/
  supabase/
  docs/
  apps/
    atem-field/           Electron 현장 자막 프로그램 소스
```

### 웹 입력 서비스

구독이 활성화된 개별 교회가 사용하는 SaaS다.

- 헵시바 선교단 자막 입력
- 설교대지 입력
- 준비찬양·찬양콘티·악보 입력
- 생성 이미지와 프로그램 payload 저장
- 향후 자막협조, 캔버스, 대시보드, 설정 연결

웹 입력 서비스는 Vercel에서 실행되고 자료는 Supabase에 교회별로 저장한다. 로그인, 교회 소속, 역할, 구독 상태가 확인되어야 한다.

### Electron 현장 프로그램

교회 방송실 컴퓨터에 설치한다.

- Composer
- Fill: `/atemsignal/fill?mode=fill`
- Key: `/atemsignal/key?mode=key`
- Sub: `/atem-sub`
- Relay: `/cameras-source`
- Broadcast, 라이브, 녹화
- 클라우드 준비자료 조회와 수동 가져오기

Electron 앱은 Vercel 페이지를 단순 포장하는 앱이 아니다. 현장 장치, 내부 서버, 로컬 파일, 다중 디스플레이와 ATEM 출력을 담당하는 별도 데스크탑 제품이다.

## 4. GitHub 업로드 기준

### 반드시 포함

- 앱 소스와 테스트
- 독립된 `package.json`과 lockfile
- Electron 메인·preload·권한 코드
- 빌드 설정과 아이콘
- 운영 스크립트와 watchdog
- Supabase 마이그레이션과 RLS 정책
- `.env.example`
- 설치·복구·현장 점검 문서
- 저작권 문제가 없는 기본 UI 정의

### 반드시 제외

- `.env.local`, 인증 토큰, API 비밀키
- `node_modules`, `.next`, `dist`, `out`, DMG
- 성경·찬송가·CCM 원문
- 교회가 보유한 PPT, Keynote, 악보, 이미지, 영상
- 실제 `data/programs` 내용
- `FILES`, `public/generated`, 변환·분석 중간 파일
- 녹화, 라이브 청크, 로그와 캐시
- 특정 교회 담당자의 개인정보

GitHub 커밋 전에 `git status`, 비밀정보 문자열 검사, 대용량 파일 검사를 수행한다. `git add .` 대신 경로를 지정해 스테이징한다.

## 5. 교회별 클라우드 자료

### 저장 가능

- 헵시바 가사와 곡 정보
- 설교대지와 인용 자료
- 준비찬양 곡 정보, 교회가 업로드한 악보
- 생성 이미지와 프로그램 payload
- 작성·수정·가져오기 이력

### 필수 교회 분리

모든 소유 데이터는 `church_id`, `created_by`, 상태, revision을 가진다. Storage 경로도 다음과 같이 교회별로 분리한다.

```text
churches/{church_id}/choir/{request_id}/...
churches/{church_id}/sermons/{request_id}/...
churches/{church_id}/praise/{request_id}/...
```

현재 헵시바 테이블에는 `church_id`가 없어 단일 교회 시험판이다. 정식 구독 교회 확대 전에 기존 데이터를 실제 소유 교회에 이관하고 RLS와 API 교회 범위를 적용한다.

### 클라우드에 넣지 않는 원본

성경·찬송가 전체 원문은 일반 교회 입력자료와 다르다. 공용 Supabase, GitHub, 공용 설치파일에 넣지 않는다. 권리 계약에 따라 별도 배포 체계가 확정되기 전까지 각 교회의 적법한 로컬 설치 자료로 관리한다.

## 6. Electron 설치 후 로컬 자료

권장 사용자 관리 경로:

```text
~/Documents/UnoWorship Library/
  Bibles/
  Hymns/
  Programs/
  PPT/
  Media/
  Recordings/
  Backups/
```

운영체제 내부 앱 데이터:

```text
~/Library/Application Support/UnoWorship/
  settings/
  cache/
  device-profile/
  auth-store
  migrations/
```

### 로컬 저장 대상

- 교회가 설치한 성경·찬송가 데이터
- PPT/Keynote 원본과 변환 이미지
- 클라우드에서 가져온 프로그램과 에셋
- 현장에서 수정한 프로그램과 디자인
- 대용량 미디어와 녹화
- ATEM IP, 입력 번호, EDID·디스플레이 역할

### 금지 사항

- `/Applications/UnoWorship Pro.app` 내부에 사용자 자료 저장
- `app.asar` 또는 번들된 프로젝트 `data/`에 쓰기
- 앱 업데이트가 로컬 라이브러리를 교체·초기화
- 다른 교회 로그인 후 이전 교회의 클라우드 캐시 표시

## 7. 기존 맥미니 자료 이관

Electron 첫 설치 전에 기존 운영 폴더를 그대로 백업한다. 이 단계에서는 원본을 이동하거나 삭제하지 않는다.

이관 대상 예시:

```text
기존 data/bibles       → Library/Bibles
기존 data/hymns        → Library/Hymns
기존 data/programs     → Library/Programs
기존 FILES             → Library/PPT 또는 호환 폴더
기존 data/media        → Library/Media
기존 녹화 폴더         → Library/Recordings
```

실제 이관은 `LocalLibraryPath` 모듈과 데이터 마이그레이션 도구가 구현된 뒤 수행한다. 그 전에는 기존 개발모드가 원래 경로를 계속 사용한다.

이관 도구는 다음을 지켜야 한다.

- 원본 읽기 전용 검사
- 대상 용량 확인
- 파일 checksum 검증
- 중복 파일 보고
- 임시 폴더 복사 후 원자적 완료 처리
- 이관 보고서와 롤백 위치 기록

## 8. Electron 적용 전 필수 코드 작업

현재 클린 복제본은 설치파일 완성본이 아니다. 다음 작업을 별도 커밋으로 진행한다.

1. Next.js `output: 'standalone'` 적용
2. `npm`·`tsx` 없이 패키지 내부 서버 직접 기동
3. 모든 파일 API에 공통 `LocalLibraryPath` 적용
4. `electron-builder.files`에서 실제 `data/**/*` 제거
5. Composer/Fill/Key/Sub/Relay 다중 창 구현
6. EDID 기반 화면 역할과 교회별 장치 프로필
7. 카메라·마이크 권한과 릴레이 background throttling 방지
8. 포트 충돌, 서버 health, 프로세스 종료·재기동 처리
9. Apple Silicon 패키징, 코드 서명, 공증
10. 설치 후 현장 리허설과 기존 Chrome 스크립트 롤백 확인

### 의존성 보안 점검

2026-07-22 클린 복제본에서 `npm audit --omit=dev`를 실행한 결과 production 의존성에 21건의 경고가 확인되었다.

```text
critical 1
high 10
moderate 8
low 2
```

주요 대상은 Next.js, protobufjs, ws/engine.io, sharp 등이다. 현재 운영 기능을 예고 없이 바꿀 수 있으므로 `npm audit fix --force`는 실행하지 않는다. Electron 정식 DMG 전에 별도 업그레이드 브랜치에서 다음 순서로 처리한다.

1. lockfile 백업과 보안 전용 커밋
2. 자동 적용 가능한 패치 업데이트 검토
3. Next.js 권장 안전 버전 수동 업그레이드
4. Socket.IO/WebRTC, ATEM, PPT, Supabase 회귀 테스트
5. 전체 현장 리허설
6. 재감사 결과가 허용 기준에 들어온 뒤 DMG 배포

따라서 이번 GitHub 푸시는 소스 보존과 개발 이동에는 사용할 수 있지만, 현재 상태를 최종 고객 설치판으로 선언하지 않는다.

## 9. 커밋과 푸시 순서

### 1차: 원본 현장판 체크포인트

- 원본 경로에서 운영 코드만 선별
- 로컬 데이터 제외 `.gitignore` 반영
- 빌드 확인
- 체크포인트 커밋

2026-07-22 기준 체크포인트:

```text
aff37466 chore: checkpoint ATEM field operations
```

원본 저장소에는 remote가 없으므로 이 커밋은 현장 복구 기준점으로 남긴다.

### 2차: GitHub 클린 복제 커밋

- `apps/atem-field` 추가
- 웹 루트가 하위 Electron 앱을 빌드하지 않도록 경계 설정
- 통합 데이터·설치 문서 추가
- 저작권·대용량·비밀정보 제외 검사
- ATEM 소스 빌드와 웹 루트 빌드 모두 확인
- 커밋 내용을 사용자와 검토

### 3차: 푸시

- `main`에 push
- Vercel 웹 재배포 상태 확인
- 입력 웹 저장·검색·이미지 생성 회귀 테스트
- GitHub에서 `apps/atem-field` 파일과 제외 목록 확인

이 푸시는 현재 실행 중인 맥미니 개발 서버를 중단하지 않는다. Vercel 웹만 자동 재배포될 수 있다.

## 10. DMG 생성과 설치

GitHub에 소스를 올린다고 Electron 앱이 자동 설치되는 것은 아니다.

권장 첫 배포 흐름:

1. Electron 적용 커밋 완성
2. `npm ci`, 웹 빌드, Electron pack 검증
3. Apple Silicon DMG 생성
4. 버전 태그 생성
5. GitHub Release에 DMG와 checksum, 릴리스 노트 첨부
6. 맥미니에서 웹 또는 GitHub Release로 DMG 다운로드
7. `UnoWorship Pro.app`을 `/Applications`에 설치
8. 첫 실행 마법사로 로컬 라이브러리와 장치 설정
9. 실제 ATEM이 아닌 테스트 패턴으로 Fill/Key 확인
10. 현장 전체 리허설 후 운영 전환

첫 안정판은 수동 업데이트만 제공한다. 예배 직전이나 실행 중 자동 업데이트하지 않는다.

## 11. 설치 후 검증

### 앱

- 앱 실행과 종료
- 내부 서버 health
- Composer 재실행
- 앱 종료 후 서버·카메라 프로세스 정리

### ATEM

- Input 4 Fill
- Input 5 Key
- Sub 출력
- Linear Key 검은 글자·반투명 PNG 보존
- 카메라 릴레이와 PGM

### 데이터

- 프로그램 저장·수정·재실행 유지
- PPT 변환과 동일 제목 처리
- 성경·찬송가 로컬 검색
- 클라우드 자료 수동 가져오기
- 인터넷 단절 후 기존 프로그램 송출
- 앱 업데이트 후 데이터 유지

### 구독과 교회 분리

- 승인된 교회 자료만 표시
- 만료·권한 없는 계정 차단
- 다른 교회 URL과 API 직접 호출 차단
- 로그아웃 시 클라우드 캐시 격리

## 12. 롤백

새 Electron 앱에 문제가 생기면 다음 순서로 복구한다.

1. Electron 앱 종료
2. 기존 `UnoLive-plus-atem-field` 폴더는 수정하지 않은 상태로 유지
3. 기존 개발 서버와 `UnoLive-Pro-4Screen-Start.command` 실행
4. ATEM Fill/Key/Sub/Relay 확인
5. 새 앱만 이전 버전으로 교체
6. 로컬 라이브러리는 삭제하거나 되돌리지 않음

롤백 성공을 확인하기 전에는 기존 폴더, 기존 바탕화면 실행 아이콘, 기존 Chrome 프로필을 삭제하지 않는다.

## 13. 완료 기준

- GitHub에 코드만 존재하고 교회 실데이터가 없음
- Vercel 입력 웹이 푸시 전과 동일하게 작동
- Supabase 교회별 격리가 적용됨
- Electron이 standalone 내부 서버로 실행됨
- 설치 앱과 로컬 라이브러리가 분리됨
- 기존 자료 이관과 백업·복원이 검증됨
- ATEM 전체 리허설 통과
- 수동 업데이트와 롤백 절차를 방송 담당자가 수행 가능

이 조건을 모두 통과하기 전에는 기존 개발모드를 폐기하지 않는다.
