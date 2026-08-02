# 설교대지 협조문 → 프로그램 생성 체크리스트

PLAN.md 와 짝. 진행하며 체크한다.

**대원칙 — 기존 파일은 `app/WorkspaceTabs.tsx` 2줄 외에 건드리지 않는다.** 마지막에 `git diff --stat` 으로 확인한다.

## 1단계 — 파싱 (성경 데이터 불필요 · 어디서든 동작)

- [ ] `lib/sermon-compose/types.ts` — `ParsedSermonOutline`, `ParsedPoint`, `SermonMedia`
  - 검증: `npm run typecheck` 통과
- [ ] `lib/sermon-compose/serviceTypeHint.ts` — `주일 오전예배` → `주일낮예배` 매핑
  - 검증: 5개 예배 종류 + 매칭 실패 케이스 단위 테스트
- [ ] `lib/sermon-compose/parseSermonOutline.ts` — 협조문 원문 → 구조화
  - 판정 순서 준수 — 라벨 → 대지 → 인용 → 나머지
  - 대지 제목 끝 `(1)`, `(2-3)` 을 `verseRange` 로 분리
  - 중복 인용 자동 삭제 **안 함**
- [ ] `tests/parse-sermon-outline.test.ts` — PLAN.md 의 실제 협조문 샘플 고정 케이스
  - 검증: `npm test` — 제목 1 / 본문 `요14:1-3` / 대지 3 / 인용 15 / `unresolved` 는 첫 줄 1개만
  - 검증: 대지 1번 title 이 `마음에 근심하지 말라 하심` (괄호 제거됨), verseRange 가 `1`
  - 검증: 찬양 줄이 hymnNumbers `['310','493','382']` + praiseSongs `['주님 내 길 예비하시니']` 로 분해됨

## 2단계 — 참고자료 (사진 · 유튜브)

- [ ] `supabase/migrations/202608020001_sermon_outline_media.sql` — `sermon-outline-media` 버킷
  - 검증: **사용자가 Supabase 대시보드 SQL Editor 에서 실행** → 대시보드 Storage 에 버킷 보임
- [ ] `lib/sermon-compose/youtubeLink.ts` — URL → videoId + 썸네일
  - UnoLive `lib/youtube.ts` 와 같은 정규식 사용
  - 검증: `watch?v=` / `youtu.be/` / `embed/` / `shorts/` 4개 형식 단위 테스트
- [ ] `lib/sermon-compose/compressImage.ts` — 브라우저 리사이즈 + WebP 변환
  - 긴 변 1920px, 품질 0.9
  - 검증: 8MB 폰 사진이 4.5MB 미만으로 줄어드는지 실측
- [ ] `app/api/sermon-compose/media/route.ts` — WebP 업로드 → Storage
  - `ensureSupabaseBucket` → `uploadSupabaseObject`, 경로 `churches/{church_id}/{outlineId}/{n}.webp`
  - 검증: 업로드 후 `createSignedUrl` 로 열림
- [ ] `app/sermon-compose/SermonMediaPanel.tsx` — 사진 업로드 + 유튜브 링크 + 배치 선택
  - 사진 다중 선택, 미리보기, 삭제, 순서 이동
  - 유튜브 링크 입력 시 즉시 썸네일 표시, 잘못된 링크는 사유 표시
  - 항목마다 배치 토글 — `말씀찾기(인용) 맨 뒤`(기본) / `별도 프로그램`
  - 검증: 사진 3장 + 유튜브 2개 올리고 배치를 섞어 저장 → `metadata.media` 확인

## 3단계 — 검수 편집 UI

- [ ] `app/sermon-compose/ParsedOutlineEditor.tsx` — 대지·인용 목록 편집
  - 대지 추가·삭제·순서 이동
  - 인용구절 추가·삭제·다른 대지로 이동
  - 중복 인용에 배지 표시 (자동 삭제 없음)
  - `unresolved` 줄을 대지 또는 인용으로 배정하는 UI
  - 검증: 브라우저에서 샘플 붙여넣고 각 조작 1회씩 수행
- [ ] `app/sermon-compose/SermonComposePanel.tsx` — 붙여넣기 + 파싱 + 설교자 + 저장
  - 설교자 선택 (`한만상 목사` / `김동경 강도사` / 직접기입), 소속교회 입력
  - 최근 저장 대지 불러오기 (기존 `GET /api/sermon-outlines` 재사용 — 읽기만)
  - 기존 `globals.css` 클래스 재사용 — `site-shell`, `panel`, `field-grid`, `primary-button` 등
- [ ] `app/sermon-compose/SermonSection.tsx` — 소탭 래퍼
  - `원문 저장` 탭은 기존 `SermonOutlinePage` 를 **그대로 import 해서 렌더**
  - 검증: `git diff app/sermon/SermonOutlinePage.tsx` 가 비어 있음
- [ ] `app/WorkspaceTabs.tsx` — import 1줄 + 렌더 1줄 교체 **(유일하게 허용된 기존 파일 수정)**
  - 검증: 홈 → 설교대지 진입 시 소탭 2개, 기존 탭 동작 그대로

## 4단계 — 저장 API (신규 라우트)

- [ ] `app/api/sermon-compose/route.ts` — 파싱 구조 + 미디어를 `metadata` 에 기록
  - 같은 `sermon_outlines` 테이블에 쓰되 **기존 `/api/sermon-outlines` 는 수정하지 않는다**
  - `content` 원문 그대로 저장
  - 검증: 저장 후 Supabase 행의 `metadata.parsed` / `metadata.media` 확인
  - 검증: 기존 `원문 저장` 탭에서 저장해도 회귀 없음
- [ ] `GET` — `metadata` 포함한 목록 반환 (컴포저가 읽을 소스)
  - 검증: `curl localhost:PORT/api/sermon-compose?limit=1` 에 `metadata.parsed` 포함

## 5단계 — 프로그램 생성 (UnoLive-plus-atem-field · 현장 맥 브라우저)

- [ ] `app/api/imports/sermon-outlines/route.ts` — 클라우드 목록 GET 프록시
  - `https://unoworship-pro-eight.vercel.app/api/sermon-compose` 중계. **조립하지 않는다**
- [ ] `features/sermon-outline-import/types.ts` — 파싱 구조 타입
- [ ] `features/sermon-outline-import/buildSermonPrograms.ts` — **브라우저에서** 3개 조립
  - `말씀찾기(본문)` — 장 전체 절별, `bible`, `hiddenScripture: true`
  - `설교대지` — `wordTitle` / `meditation` / `titleScripture` / `preacher`
  - `말씀찾기(인용)` — 대지별 `pointTitle` + 인용 `bible` + `quote-tail` 자료 섹션
  - `applyTemplate` / `applyBibleTemplate` / `makeScriptureTemplateSections` 를 그대로 호출
  - 검증: `document` 가드 + 긴 절에서 넘침 분할이 실제로 발생하는지 확인
- [ ] `app/api/imports/sermon-outline-media/route.ts` — 사진 내려받아 `public/generated/sermon-outline/` 저장
  - 기존 `importChoirProgram.ts` 의 `PUBLIC_ASSET_ROOT` 방식 참고
- [ ] `features/sermon-outline-import/buildMediaSections.ts` — 사진·유튜브 → 섹션
  - 사진 → `ImageElement`, `objectFit: 'contain'`, 전체 화면
  - 유튜브 → `VideoElement` + `youtubeId` + `thumbnailUrl`, `autoplay: false`
  - `own-program` 항목은 `{YYYYMMDD}-설교참고자료-{n}` 로 분리
- [ ] `components/composer/setlist/SermonOutlineImportButton.tsx` — 진입 UI
  - 검증: 생성된 프로그램이 셋리스트에 뜨고 기존 워십과 같은 `worshipId` 로 묶임
  - 검증: 유튜브 섹션이 컴포저에서 실제로 재생됨

## 6단계 — 최종 검증

- [ ] `npm test` (unoworship-pro) 통과
- [ ] `npm run typecheck` (unoworship-pro) 통과
- [ ] `npm run lint` (unoworship-pro) 통과
- [ ] UnoLive `npx tsc --noEmit` 통과
- [ ] 샘플 협조문 + 사진 + 유튜브 전체 왕복 — 붙여넣기 → 저장 → 컴포저 가져오기 → 생성
- [ ] **육안 비교** — 생성된 자막이 기존 예배 자막 협조 폼 결과와 같은지
- [ ] Vercel 배포판에서 파싱·검수·업로드·저장 동작, 생성 버튼은 사유 표시하며 비활성
- [ ] **`git diff --stat` 에서 기존 파일 변경이 `app/WorkspaceTabs.tsx` 2줄뿐인지 확인**

## 커밋 단위

1. 파싱 로직 + 테스트
2. 사진·유튜브 참고자료 (마이그레이션 포함)
3. 검수 편집 UI + 소탭 래퍼 + WorkspaceTabs 연결
4. 저장 API
5. UnoLive 가져오기·생성 (별도 저장소이므로 별도 커밋)
