# 설교대지 협조문 → 컴포저 프로그램 자동 생성

작성일 2026-08-02

## 목표

교역자가 카카오톡 등으로 받은 **설교대지 협조문 원문을 그대로 붙여넣으면**, 제목·본문·대지타이틀·인용구절로 자동 분리되고, 현장 맥에서 버튼 한 번으로 UnoLive 컴포저 프로그램 3개가 생성된다.

## 입력 예시 (실제 협조문)

```
주일 오전예배 대지 참조구절 및 찬양입니다.
성경: 요14:1-3
제목: 마음에 근심하지 말라!
1. 마음에 근심하지 말라 하심(1)
빌4:6-7
고후7:10
2. 하나님을 믿으니 또 나를 믿으라하심(1)
롬8:1
행16:31
요14:27
롬8:1
행16:31
3. 내 아버지의 집에 거할 곳이 많다 하심(2-3)
딤전3:15
히6:20
눅10:17-20
히11:16
계21:1
고후12:2
눅17:20-21
계21:4
찬양: 310장, 493장, 382장, 주님 내 길 예비하시니
```

## 확정된 결정 (사용자 승인)

| 항목 | 결정 |
|---|---|
| 구현 위치 | `unoworship-pro` 의 **기존 설교대지 페이지**에서 진입 |
| 생성 범위 | 설교대지 관련 프로그램만 — 찬송가·찬양은 기존 "예배 자막 협조" 폼 담당 |
| 프로그램 분할 | UnoLive와 동일하게 3개 |
| 흐름 | 붙여넣기 → 파싱 → **검수 편집** → 생성 |
| 실행 환경 | 2단계 분리 (파싱·저장은 클라우드, 생성은 현장 맥) |
| 자막 스타일 | 기존 말씀찾기(본문)·말씀찾기(인용)·설교대지 스타일 **그대로** |
| 코드 | 별도 폴더·별도 파일로 신규 구현. 기존 코드는 참고만 |
| 참고자료 | **사진 업로드 + 유튜브 링크**. 영상 파일 업로드는 하지 않는다 |
| 참고자료 배치 | 항목마다 선택 — 말씀찾기(인용) 맨 하단 섹션(기본) 또는 별도 프로그램 |

### 기존 파일 수정 범위

사용자 지시는 "기존 파일에 절대로 구현하지 말고 별도 폴더로" 이고, 동시에 "기존 설교대지 페이지를 이용" 이다. 두 요구를 동시에 만족시키는 최소 지점은 하나뿐이다.

- `app/sermon/SermonOutlinePage.tsx` — **0줄 수정.** 기존 원문 저장 탭으로 그대로 남는다
- `app/WorkspaceTabs.tsx` — **import 1줄 + 렌더 1줄만** 교체. `SermonOutlinePage` 대신 새 폴더의 `SermonSection` 을 렌더한다
- 그 외 모든 로직·UI·API 는 신규 폴더에만 둔다

`SermonSection` 은 소탭 두 개(`원문 저장` / `자막 생성`)를 갖고, `원문 저장` 은 기존 `SermonOutlinePage` 를 **그대로 import 해서 렌더**한다. 기존 동작은 한 글자도 바뀌지 않는다.

## 왜 2단계로 나누는가

성경 본문 텍스트와 자막 템플릿이 **UnoLive 프로젝트 폴더에만** 있다.

- `UnoLive-plus-atem-field/data/bibles/local-bible.json` (7MB, 교회 라이선스 로컬 팩)
- `UnoLive-plus-atem-field/data/templates/` (등록 템플릿 17개)
- `UnoLive-plus-atem-field/data/programs/` (생성 결과 저장 위치)

Vercel 서버는 맥 파일시스템에 접근할 수 없다. 기존 `programWriter.ts` 도 `process.env.VERCEL === '1'` 이면 409로 거부한다.

반면 **파싱 자체는 성경 데이터가 필요 없다.** `요14:1-3` 이 성경 표기라는 건 정규식으로 판정되고, 실제 본문 텍스트는 생성 단계에서만 필요하다. 따라서 파싱·검수·저장은 Vercel에서도 완전히 동작한다.

### 결정적 제약 — 생성은 반드시 브라우저에서

`features/subtitle-template/templateOverflow.ts:29` 의 본문 박스 측정이 `document.createElement('canvas')` 를 쓴다.

```ts
function getMeasureContext(): CanvasRenderingContext2D | null {
  if (typeof document === 'undefined') return null;   // ← 서버에서는 null
  ...
}
```

`document` 가 없으면 `templateBodyFits()` 가 무조건 `true` 를 반환해 **넘침 분할이 통째로 사라진다.** 긴 성경 절이 자막 박스 밖으로 삐져나간 채 생성된다.

따라서 프로그램 생성은 **UnoLive 컴포저 브라우저에서** 돌려야 한다. Node API 라우트에서 생성하면 안 된다.

## 아키텍처

```
[unoworship-pro · Vercel 또는 로컬]         [UnoLive-plus-atem-field · 현장 맥 브라우저]

 설교대지 페이지
   협조문 붙여넣기
      ↓ parseSermonOutline()      ← 순수 문자열 처리, 성경 불필요
   검수 편집 화면
      ↓ POST /api/sermon-outlines
   Supabase sermon_outlines
   (metadata.parsed 에 구조 저장)
      ↓
   GET /api/sermon-outlines  ────────→  컴포저 "설교대지 가져오기"
   (기존 엔드포인트 재사용)                  ↓ /api/bible 로 본문·인용 조회
                                            ↓ 등록 템플릿 적용 (브라우저 측정)
                                            ↓ POST /api/programs
                                         data/programs/ 3개 생성
                                            ↓
                                         컴포저 셋리스트에 등록
```

### 선례

찬양대(헵시바)가 이미 이 파이프로 돌고 있다.

- `unoworship-pro` 가 Supabase에 저장 → `/api/choir-programs` 로 노출
- UnoLive `features/choir-supabase-import/importChoirProgram.ts:11` 이 `https://unoworship-pro-eight.vercel.app/api` 를 직접 호출
- 컴포저 `components/composer/setlist/ServerWorshipLoader.tsx:143` 에 "클라우드" 후보로 표시

설교대지는 이 흐름을 그대로 따르되, **프로그램 조립만 서버가 아닌 브라우저에서** 한다.

## 파싱 규격

### 출력 타입

```ts
interface ParsedSermonOutline {
  serviceTypeHint: string;   // '주일낮예배' — 못 찾으면 ''
  sermonTitle: string;       // '마음에 근심하지 말라!'
  scriptureRef: string;      // '요14:1-3'
  points: ParsedPoint[];
  praiseLine: string;        // '찬양:' 원문 (참고 표시용, 프로그램 생성 안 함)
  hymnNumbers: string[];     // ['310', '493', '382']
  praiseSongs: string[];     // ['주님 내 길 예비하시니']
  unresolved: string[];      // 분류 실패한 줄 — 검수 화면에서 사용자가 처리
}

interface ParsedPoint {
  number: string;            // '1'
  title: string;             // '마음에 근심하지 말라 하심'  ← 끝의 (1) 제거됨
  verseRange: string;        // '1'  ← 원문 괄호 안 값 (자막에는 안 나감)
  quotes: string[];          // ['빌4:6-7', '고후7:10']
}
```

### 판정 순서 (순서가 중요하다)

줄 단위로 trim 후 빈 줄 제거. 각 줄마다 위에서부터 판정한다.

1. **라벨 줄** — 대지 판정보다 **먼저** 해야 한다. `제목: 마음에 근심하지 말라!` 가 대지로 잘못 잡히면 안 된다.
   - `^(성경|본문)\s*[:：]` → `scriptureRef`
   - `^제목\s*[:：]` → `sermonTitle`
   - `^(찬양|찬송)\s*[:：]` → `praiseLine`
2. **대지 줄** — 인용 판정보다 **먼저** 해야 한다.
   - `^(\d+)\s*[.)]\s*(.+)$` → 새 `ParsedPoint`
   - 제목 끝의 `\(([\d\-~,\s]+)\)$` 는 `verseRange` 로 떼어내고 `title` 에서 제거
3. **인용 줄** — 성경 표기 정규식 매칭
   - 직전 point 의 `quotes` 에 push. point 가 아직 없으면 `unresolved`
4. **나머지**
   - 첫 줄이고 `예배` 를 포함하면 `serviceTypeHint` 추출 시도
   - 그 외 `unresolved`

### 성경 표기 판정

UnoLive `lib/generators/worshipServiceGenerator.ts:266` 의 `isScriptureRefLine()` 규칙을 그대로 옮긴다.

```
/^[가-힣A-Za-z0-9]+(\s+\d+)?\s*\d*\s*:\s*\d+(\s*[-~,]\s*\d+)*$/
```

샘플의 `요14:1-3`, `빌4:6-7`, `딤전3:15`, `눅10:17-20`, `계21:1` 모두 통과한다. 공백 없는 표기는 UnoLive `lib/bible/referenceParser.ts` 가 긴 별칭 우선 매칭으로 처리하므로 생성 단계에서 문제없다.

### 예배 종류 매핑

협조문의 `주일 오전예배` 와 시스템의 `주일낮예배` 가 다르다.

| 협조문 표기 포함 | 매핑 |
|---|---|
| `주일 오전` / `주일오전` / `주일 낮` / `주일낮` | 주일낮예배 |
| `주일 오후` / `주일오후` | 주일오후예배 |
| `수요` | 수요예배 |
| `금요` | 금요기도회 |
| `월삭` | 월삭감사예배 |

매칭 실패 시 힌트를 비우고 페이지의 기존 선택값을 유지한다.

### 찬양 줄 분해

`찬양: 310장, 493장, 382장, 주님 내 길 예비하시니` 를 `,` 로 나눈 뒤

- `^(\d+)\s*장$` → `hymnNumbers`
- 그 외 → `praiseSongs`

이번 범위에서는 **프로그램을 만들지 않고 검수 화면에 참고 표시만** 한다. 찬송가·찬양은 기존 "예배 자막 협조" 폼 담당이다.

### 중복 인용구절은 자동 삭제하지 않는다

샘플 2번 대지에 `롬8:1`, `행16:31` 이 두 번 반복된다. 설교자가 실제로 재인용할 수도 있으므로 **원문 순서를 그대로 보존**하고, 검수 화면에서 중복 항목에 배지를 달아 사용자가 판단해 지우게 한다.

## 생성 규격 — 프로그램 3개

기존 UnoLive `worshipServiceGenerator.ts` 가 만드는 것과 **같은 템플릿 카테고리·같은 섹션 구성**을 쓴다. 코드는 새로 쓰되 출력은 동일해야 한다.

공통

- `worshipId` = `{YYYYMMDD}-worship` — 기존 예배 자막 협조와 같은 워십에 합류한다
- `worshipName` = `{YYYY.MM.DD} {예배종류}`
- `SavedProgram.type` = `worship`, `formData.generator` = `sermon-outline-import-v1`

### A. `{YYYYMMDD}-말씀찾기(본문)`

- `hiddenScripture: true`, `promptLayout: 'bible'`
- 본문 요절이 `요14:1-3` 이어도 **요한복음 14장 전체**를 1절부터 끝절까지 절별 섹션화
- 템플릿 카테고리 `bible`, `splitStrategy: 'balanced'`
- `reference` = `요 14:{절}`, `verse` = `{절}`

참고 원본 — `worshipServiceGenerator.ts:554-590`

### B. `{YYYYMMDD}-설교대지`

- `promptLayout: 'none'`
- 섹션 순서
  1. **말씀타이틀** — 카테고리 `wordTitle`, 필드 `title`/`reference`/`scriptureRef` = 요절, `speaker` = 설교자
  2. **본문묵상** — 카테고리 `meditation`, 요절 범위(1-3절)를 절별로, `splitStrategy: 'balanced'`
  3. **제목/본문** — 카테고리 `titleScripture`, `title` = 설교제목, `scriptureRef`/`reference` = 요절, `body` = 요절 본문 전체
  4. **설교자** — 카테고리 `preacher`, `name` = 설교자, `church` = 소속교회

참고 원본 — `worshipServiceGenerator.ts:793-870`

### C. `{YYYYMMDD}-말씀찾기(인용)`

- `promptLayout: 'bible'`
- 대지 순서대로
  - **대지타이틀** — 카테고리 `pointTitle`, `point` = 대지 제목, `pointNumber` = 번호
  - 그 대지의 **인용구절들** — 카테고리 `bible`, 절별 섹션, `splitStrategy: 'balanced'`, `verse` 는 빈 문자열 (여러 책장절이 섞이므로 헤더의 전체 책장절만 표시)
- 구절 조회 실패 시 표기만 넣고 경고를 남긴다

참고 원본 — `worshipServiceGenerator.ts:872-931`

### 설교자 정보

협조문에 설교자가 **없다.** 검수 화면에서 입력받는다.

- 설교자 기본값 `한만상 목사` (선택지 `한만상 목사` / `김동경 강도사` / 직접기입)
- 소속교회 기본값 `울주교회`

## 사진·유튜브 참고자료

설교 참고용으로 이미지와 영상을 자주 쓴다. **영상은 파일 업로드 대신 유튜브 링크**로 받는다.

### 왜 영상 파일 업로드를 하지 않는가

- Vercel API 라우트의 요청 본문 상한이 **4.5MB** 다. 영상은 이 방식으로 통과할 수 없다
- 우회하려면 signed upload URL 이 필요하고, Supabase 무료 플랜 스토리지는 1GB 라 영상 몇 개로 찬다
- UnoLive 는 이미 유튜브를 완전히 지원한다 — `VideoElement.youtubeId`, `lib/youtube.ts` 의 `extractYoutubeId()`, 출력 라우팅(`lib/youtubeRouting.ts`), 재생 제어(`lib/videoAutoplay.ts`)

링크만 받으면 기존 유튜브 경로에 그대로 얹힌다. 스토리지 비용도 0이다.

### 사진 업로드

브라우저에서 **리사이즈 + WebP 변환 후** 업로드한다. 이 프로젝트의 확립된 패턴이다 (`202607190002_choir_webp_storage.sql` — "장문 요청의 전송 용량을 줄이기 위해 고품질 WebP 저장").

- 긴 변 1920px 로 리사이즈, WebP 품질 0.9
- 폰 사진 원본은 4.5MB 를 넘기 쉽지만 변환 후에는 안전하게 들어온다
- 새 버킷 `sermon-outline-media` — `image/png`, `image/jpeg`, `image/webp`, 10MB 상한

버킷 생성은 이 프로젝트 관례대로 마이그레이션(`insert into storage.buckets`)으로 한다. **Supabase 대시보드에서 SQL 한 번 실행이 필요하다.**

### 유튜브 링크

- `watch?v=`, `youtu.be/`, `embed/`, `shorts/` 형식을 모두 받는다 (UnoLive `lib/youtube.ts` 와 같은 정규식)
- 링크 입력 즉시 videoId 를 뽑아 썸네일(`https://img.youtube.com/vi/{id}/mqdefault.jpg`)로 미리보기
- 링크가 여러 개면 순서대로 보관

### 저장 위치

`sermon_outlines.metadata.media` 에 넣는다. 새 테이블을 만들지 않는다.

```jsonc
{
  "media": {
    "images": [
      { "path": "churches/{church_id}/{outlineId}/1.webp", "width": 1920, "height": 1080,
        "placement": "quote-tail", "caption": "" }
    ],
    "youtube": [
      { "url": "https://youtu.be/xxxxxxxxxxx", "videoId": "xxxxxxxxxxx",
        "placement": "quote-tail", "caption": "" }
    ]
  }
}
```

### 배치 규칙 — 사진은 항상 별도 프로그램 (2026-08-02 확정)

사용자 결정으로 **사진은 예외 없이 자기 프로그램**이 된다. 항목별 배치 토글은 만들지 않는다.

- 한 번 올린 이미지 묶음 = 프로그램 한 개
- 제목을 비우면 `{YYYYMMDD}-{예배종류}-참고이미지` 로 자동 생성
- 저장 위치는 새 테이블 `sermon_image_programs` — 협조문(`sermon_outlines`)과 독립이라 협조문 없이도 쓸 수 있다
- 한 프로그램당 최대 30장 (실수로 수백 장을 올리는 사고 방지)

유튜브 링크의 배치는 아직 정하지 않았다. 설교대지 파싱 UI 를 붙일 때 함께 정한다.

### 사진은 서버에서 조립해도 된다

프로그램 조립을 브라우저에서 해야 하는 이유는 성경 본문의 **넘침 분할 측정** 때문이었다. 이미지는 템플릿도 성경 조회도 필요 없고 섹션당 `ImageElement` 하나뿐이라 그 제약을 받지 않는다. 기존 찬양대 임포트(`importChoirProgram.ts`)가 서버에서 조립하는 것과 같다.

### 생성 시 요소 매핑 (UnoLive 측)

- 사진 → `ImageElement` — signed URL 로 내려받아 `public/generated/sermon-outline/` 에 저장하고 그 경로를 `src` 로 쓴다. 기존 `importChoirProgram.ts` 의 `PUBLIC_ASSET_ROOT` 방식과 동일
- 유튜브 → `VideoElement` — `youtubeId`, `thumbnailUrl`, `loop: false`, `muted: false`, `autoplay: false`

두 경우 모두 섹션 하나에 요소 하나. 전체 화면(`x:0, y:0, width:100, height:100`), 이미지는 `objectFit: 'contain'`.

## 파일 구조 (전부 신규)

### unoworship-pro

```
lib/sermon-compose/                    # 신규 폴더 — 파싱·미디어 로직
  types.ts                     # ParsedSermonOutline, ParsedPoint, SermonMedia
  parseSermonOutline.ts        # 협조문 원문 → 구조화 (순수 함수, 의존성 없음)
  serviceTypeHint.ts           # '주일 오전예배' → '주일낮예배'
  youtubeLink.ts               # 유튜브 URL → videoId + 썸네일
  compressImage.ts             # 브라우저 리사이즈 + WebP 변환
app/sermon-compose/                    # 신규 폴더 — UI + API
  SermonSection.tsx            # 소탭 래퍼 — '원문 저장'(기존) / '자막 생성'(신규)
  SermonComposePanel.tsx       # 붙여넣기 + 파싱 + 설교자 + 저장
  ParsedOutlineEditor.tsx      # 대지·인용 목록 편집 (추가·삭제·순서·중복 배지)
  SermonMediaPanel.tsx         # 사진 업로드 + 유튜브 링크 + 배치 선택
app/api/sermon-compose/
  route.ts                     # 파싱 구조 + 미디어 저장 (기존 sermon-outlines 와 별도)
  media/route.ts               # 사진 업로드 → Storage
supabase/migrations/
  202608020001_sermon_outline_media.sql   # sermon-outline-media 버킷 생성
tests/
  parse-sermon-outline.test.ts # 위 샘플 협조문 고정 케이스
```

기존 파일 중 바뀌는 것은 `app/WorkspaceTabs.tsx` 의 **import 1줄 + 렌더 1줄뿐**이다. `app/sermon/SermonOutlinePage.tsx` 와 `app/api/sermon-outlines/route.ts` 는 **한 줄도 수정하지 않는다.**

저장 API 를 기존 `/api/sermon-outlines` 에 얹지 않고 `/api/sermon-compose` 로 새로 만드는 이유도 같다 — 기존 라우트를 건드리지 않기 위해서다. 같은 `sermon_outlines` 테이블에 쓰되 `metadata.parsed` / `metadata.media` 만 추가로 채운다.

### UnoLive-plus-atem-field

```
features/sermon-outline-import/
  types.ts                     # unoworship-pro 와 공유하는 ParsedSermonOutline 형태
  fetchSermonOutlines.ts       # 클라우드 목록 조회 (서버측 프록시)
  buildSermonPrograms.ts       # 브라우저에서 3개 프로그램 조립 ← 핵심
  buildMediaSections.ts        # 사진·유튜브 → ImageElement / VideoElement 섹션
app/api/imports/sermon-outlines/route.ts        # GET 프록시 (JSON만 중계, 조립 안 함)
app/api/imports/sermon-outline-media/route.ts   # 사진 내려받아 public/generated/sermon-outline/ 에 저장
components/composer/setlist/SermonOutlineImportButton.tsx   # 진입 UI
```

`worshipServiceGenerator.ts` 는 **수정하지 않는다.** 템플릿 로딩·섹션 빌더는 `features/subtitle-template` 의 공개 함수(`applyTemplate`, `applyBibleTemplate`, `makeScriptureTemplateSections`)를 그대로 호출한다.

## 데이터 저장

기존 `sermon_outlines` 테이블을 **스키마 변경 없이** 쓴다. `metadata jsonb` 컬럼이 이미 있다.

```jsonc
{
  "appUrl": "...",
  "savedBy": "sermon-compose",
  "parserVersion": 1,
  "parsed": { /* ParsedSermonOutline */ },
  "preacher": "한만상 목사",
  "churchName": "울주교회",
  "media": { "images": [ /* ... */ ], "youtube": [ /* ... */ ] }
}
```

`content` 에는 원문을 그대로 유지한다. 파싱 규칙이 바뀌어도 원문에서 다시 뽑을 수 있어야 한다.

나중에 조회 성능이 문제되면 `parsed jsonb` 전용 컬럼으로 승격한다.

### 필요한 SQL 한 번

테이블 변경은 없지만 **Storage 버킷은 새로 만들어야 한다.** 사용자가 Supabase 대시보드에서 한 번 실행한다.

```sql
-- supabase/migrations/202608020001_sermon_outline_media.sql
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('sermon-outline-media', 'sermon-outline-media', false, 10485760,
        array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
```

## 범위 밖 (이번에 하지 않는 것)

- **영상 파일 업로드** — 유튜브 링크로 대체 (Vercel 4.5MB 상한 + 스토리지 1GB)
- 찬송가·찬양 프로그램 생성 — 기존 "예배 자막 협조" 폼 담당
- 주보 OCR 연동 — 이미 별도로 동작 중
- `worshipServiceGenerator.ts` 리팩터링
- 기존 `SermonOutlinePage.tsx` · `/api/sermon-outlines` 수정
- Vercel에서 프로그램 생성 (구조적으로 불가능)

## 성공 기준

1. 위 샘플 협조문을 붙여넣으면 제목 1개 / 본문 1개 / 대지 3개 / 인용 15개(중복 2개 포함)로 분리된다 — 고정 테스트로 검증
2. 검수 화면에서 대지·인용을 추가·삭제·이동할 수 있다
3. 폰 사진(4.5MB 초과 원본)을 올려도 WebP 변환 후 업로드가 성공한다
4. 유튜브 링크 4개 형식(`watch?v=`, `youtu.be/`, `embed/`, `shorts/`)이 모두 videoId 로 파싱되고 썸네일이 뜬다
5. 현장 맥 컴포저에서 가져오기를 누르면 프로그램 3개(+ `own-program` 자료 수만큼)가 `data/programs/` 에 생성된다
6. 생성된 자막이 기존 예배 자막 협조 폼 결과와 **육안으로 구분되지 않는다** — 같은 템플릿, 같은 넘침 분할
7. `quote-tail` 자료가 `말씀찾기(인용)` 맨 뒤 섹션으로 붙고, 유튜브 섹션이 컴포저에서 실제로 재생된다
8. Vercel 배포판에서 파싱·검수·업로드·저장까지 정상 동작하고, 생성 버튼은 사유와 함께 비활성 표시된다
9. `git diff` 에서 기존 파일 변경이 `app/WorkspaceTabs.tsx` **2줄뿐**이다
