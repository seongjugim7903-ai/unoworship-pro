# UnoWorship Pro Electron 이행 점검 및 개선 판단

작성일: 2026-07-22
점검 기준 커밋: `79688c0` (chore: add clean ATEM field desktop workspace)
점검 방법: 커밋에 포함된 문서 20건 정독 + `apps/atem-field` 실제 코드 대조

## 1. 총평

기획 방향성은 타당하다. 특히 아래 원칙들은 그대로 유지한다.

- 4영역 분리: Vercel 입력 웹 / Supabase 교회별 클라우드 / GitHub 소스 / Electron 로컬 자료
- 코드와 교회 데이터의 완전 분리, 저작권 원본(성경·찬송가·CCM) 공용 배포 금지
- 클라우드 자료의 자동 동기화 금지, 방송 담당자의 명시적 "가져오기" 유지
- 첫 배포는 수동 업데이트만, 기존 Chrome 스크립트를 비상 롤백 수단으로 보존
- dual-output 폐기 기록(맥미니 두 출력 동시 렌더 불가) 히스토리 보존

문서의 자체 진단(RUNBOOK §8, PLAN §10)은 코드로 검증한 결과 전부 사실과 일치했다.

| 문서의 주장 | 코드 확인 결과 |
|---|---|
| Electron이 npm/tsx로 서버 기동 | 사실. `electron/main.js` `spawnNextServer()`가 `spawn('npm', ['run', start])`, start = `tsx server.ts` |
| Next standalone 미적용 | 사실. `next.config.ts`에 `output: 'standalone'` 없음 |
| 패키지에 `data/**/*` 포함 | 사실. `package.json` build.files가 `data/**/*` + 소스 원본까지 포함 |
| 창 배치가 구형 3창 구조 | 사실. `/`, `/prompt`, `/output`을 띄움. 현장 구조(Composer/Fill/Key/Sub/Relay)와 불일치 |
| `process.cwd()/data` 참조 산재 | 사실. 14개 파일 16곳 (bible/hymn/programs/templates/designs/media/ppt-slides API 등) |

## 2. 설치 파일 전 차단 요소 (심각도 순)

### ① 빌드 환경 — 문서에 없던 신규 이슈

DMG 생성과 macOS 서명·공증은 macOS에서만 가능하다. 현재 개발 PC는 Windows다.

- 해결 (a): 맥미니에서 직접 빌드
- 해결 (b, 권장): GitHub Actions macOS 러너 — 태그 푸시 → 자동 빌드 → GitHub Release에 DMG 첨부. RUNBOOK §10의 "Release 자산 배포" 계획과 자연스럽게 결합된다.
- Windows 개발 PC에서는 NSIS 설치 파일을 빌드해 패키징 파이프라인 자체를 먼저 검증할 수 있다.

### ② 패키징된 앱에서 서버 기동 불가능

현재 구조는 설치 후 100% 실패한다.

- `tsx`는 devDependency라 패키지에 포함되지 않는다.
- asar 내부에서 `npm run`은 동작하지 않는다.
- Socket.io 커스텀 서버(`server.ts`)라 Next 기본 standalone `server.js`로 대체 불가.

해결: 빌드 시 `server.ts`를 esbuild로 JS 번들 → Next standalone 출력과 함께 패키징 → Electron `utilityProcess.fork()`(내장 Node)로 직접 기동. 사용자 컴퓨터에 Node 설치 불필요.

### ③ LocalLibraryPath 미구현 — 다른 작업의 전제조건

14개 파일이 `process.cwd()/data`를 참조한다. 패키지 앱의 cwd는 asar 내부(읽기 전용)라 프로그램 저장·PPT 변환·성경/찬송 검색·녹화가 전부 깨진다.

해결: 공통 모듈 1개 (`UNOLIVE_LIBRARY_DIR` 환경변수 기반).
- 개발 모드: 기존 `./data`, `./FILES`, `./public/generated` 그대로
- 패키지 앱: `~/Documents/UnoWorship Library` (Windows: `%USERPROFILE%\Documents\UnoWorship Library`)

**가장 먼저 할 작업.** standalone 전환·builder 정리가 모두 이 모듈을 전제한다.

### ④ builder files 목록 위험

GitHub 클론은 `data/`가 placeholder라 안전하지만, 맥미니 원본 폴더에서 빌드하면 실제 교회 데이터가 DMG에 들어간다 (`bibles/hymns/ccm/lyrics`만 제외되고 programs/templates 등은 포함). "코드만 명시적 포함" 화이트리스트로 뒤집어야 한다.

### ⑤ 창 배치 재구현 + 디스플레이 프로필

- 현장 검증 구조는 5창: Composer, Fill(`/atemsignal/fill?mode=fill`), Key(`/atemsignal/key?mode=key`), Sub(`/atem-sub`), Relay(`/atem-usb-relay-v2`)
- `main.js` `resolveMonitors()`가 x좌표 정렬인데 Blackmagic 2개는 동일 EDID라 재부팅 시 순서가 바뀔 수 있다 → Fill/Key 뒤바뀜은 방송 사고 직결.
- 첫 배포 필수: 각 창에 FILL/KEY/SUB 라벨 오버레이 + 창별 디스플레이 지정을 저장하는 프로필.

## 3. 그 외 발견 문제

- **고아 프로세스**: `nextProcess.kill()`은 `shell: true`로 띄운 npm만 죽이고 실제 node 서버가 남을 수 있다. RUNBOOK §11 "앱 종료 후 서버 프로세스 정리" 검증이 현 코드로는 실패할 가능성이 크다. ②의 utilityProcess 전환으로 자연 해결.
- **포트 3000 고정**: 기존 개발 서버와 충돌 시 안내/대체 포트 로직 미구현 (문서에 과제로만 존재).
- **제품명 불일치**: `productName: "UnoLive"`, appId `io.unolive.app` vs 문서상 "UnoWorship Pro". productName은 userData 경로를 결정하므로 설치 실적이 생기기 전( = 지금)에 확정해야 한다. 나중에 바꾸면 인증 토큰·설정이 사라진 것처럼 보인다.
- **Windows 호환**: `start` 스크립트의 `NODE_ENV=production tsx ...` 인라인 문법은 Windows cmd에서 실패. cross-env로 통일 필요 (향후 Windows 지원 계획과 연결).
- **인증의 클라우드 의존**: 디바이스 토큰 검증이 Vercel API 의존. 첫 설치 시 인터넷 문제로 로그인에서 막히면 예배 리스크 → 오프라인 grace 경로를 설치 전 실제 테스트. (tokenStore의 safeStorage 암호화는 잘 구현됨.)
- **DSK 클린피드 스플릿 미검증 활성화 상태** (features/atem-dual-output/context-notes.md): Electron과 별개로 다음 ATEM 연결 시 라이브 예배 밖에서 첫 검증 필요.
- **npm audit 21건(critical 1, high 10)**: RUNBOOK 방침대로 `--force` 금지, 별도 업그레이드 브랜치에서 회귀 테스트 후 해소. 첫 내부 설치의 차단 요소는 아님.

## 4. 더 좋은 방향 제안

1. **서명·공증은 첫 내부 설치에서 제외.** 본인 맥미니 첫 설치는 미서명 DMG + 우클릭 열기로 충분하다. "코드 서명·공증"을 1차 배포 필수에서 "외부 교회 배포 전 필수"로 옮기면 첫 설치가 몇 주 빨라진다.
2. **church_id 이관은 병행 트랙.** 이는 구독 교회 *확대*의 전제조건이지 첫 Electron *설치*의 전제조건이 아니다. 단일 교회 상태에서 설치판을 먼저 안정화한다.
3. **Windows 개발 PC 활용 범위**: Composer UI, LocalLibraryPath, 서버 번들, 창 배치 로직 개발·테스트와 NSIS 빌드 검증까지 가능. 맥미니는 최종 DMG 설치와 ATEM 실기 리허설에만 사용.
4. **권장 작업 순서**:
   1. LocalLibraryPath 도입 (③)
   2. builder files 화이트리스트 + 제품명 확정 (④)
   3. standalone + 서버 번들 + utilityProcess 기동 (②)
   4. 5창 배치 + 디스플레이 프로필 (⑤)
   5. Windows NSIS로 패키징 파이프라인 검증 → GitHub Actions macOS 빌드 (①)
   6. 맥미니 설치 + 예배 외 시간 리허설
   7. (외부 배포 시점) 서명·공증 + npm audit 업그레이드 브랜치

## 5. 진행 기록

- 2026-07-22: 본 문서 작성. 개선 작업 착수 (LocalLibraryPath → builder 정리 → standalone 번들 → Windows NSIS 첫 빌드).
