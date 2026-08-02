# 설교대지 협조문 → 프로그램 생성 · 컨텍스트 노트

작업 중 내린 결정과 그 이유를 계속 덧붙인다.

## 2026-08-02 — 사전 조사

### 대상 프로젝트 확인

사용자가 준 `https://unoworship-pro-eight.vercel.app/` 는 `unoworship-pro` 다. `.vercel/project.json` 의 `projectName` 으로 확인했다.

### 기존 설교대지 페이지의 실체

`app/sermon/SermonOutlinePage.tsx` 292줄. 하는 일은 **원문 저장뿐**이다.

- 예배 종류·일자·내용(원문)·찬양을 받아 `POST /api/sermon-outlines` → Supabase `sermon_outlines` 에 통짜 텍스트 저장
- 파싱은 `outlineTitle()` 하나뿐이고, 목록 표시용으로 `제목:` 줄만 뽑는다 (`:35`)
- 프로그램 생성 로직 없음

즉 이번 작업은 "개선"이 아니라 **신규 기능 추가**다.

### 이미 있던 클라우드 → 현장 파이프 (중요)

찬양대(헵시바) 쪽에 똑같은 구조가 이미 돌고 있었다. 새로 설계할 필요가 없었다.

- `unoworship-pro` 가 Supabase 저장 + `/api/choir-programs` 노출
- UnoLive `features/choir-supabase-import/importChoirProgram.ts:11` 에 상수
  `DEFAULT_CLOUD_API_BASE = 'https://unoworship-pro-eight.vercel.app/api'`
- UnoLive 컴포저 `components/composer/setlist/ServerWorshipLoader.tsx:143` 이 그 API를 호출해 "클라우드" 후보로 노출하고 가져온다

설교대지도 이 파이프를 탄다. **다만 프로그램 조립 위치만 다르다** — 아래 참조.

또 하나, `lib/field-program-export/programWriter.ts` 는 UnoLive 의 `data/programs` 를 절대경로로 직접 쓴다.

```
DEFAULT_PROGRAMS_DIR =
  '/Users/kimseongju/unogstack/projects/UnoLive-plus-atem-field/data/programs'
```

이 방식도 있지만 설교대지에는 쓰지 않는다. 이유는 다음 항목.

### 왜 서버에서 생성하면 안 되는가 (핵심 발견)

UnoLive `features/subtitle-template/templateOverflow.ts:29`

```ts
function getMeasureContext(): CanvasRenderingContext2D | null {
  if (typeof document === 'undefined') return null;
  if (!measureContext) measureContext = document.createElement('canvas').getContext('2d');
  return measureContext;
}
```

`document` 가 없으면 `measureTemplateBody()` → `null` → `templateBodyFits()` 가 무조건 `true` 를 반환한다. 그러면 `splitTemplateBody()` 가 `null` 을 돌려주고 **넘침 분할이 통째로 사라진다.**

기존 찬양대 임포트(`importChoirProgram.ts`)는 서버에서 조립하지만 문제가 없었다. 템플릿을 쓰지 않고 요소를 하드코딩하기 때문이다(`programWriter.ts` 의 `makeBasicMainElements` 도 같다).

설교대지는 성경 본문이 길고 등록 템플릿을 써야 하므로 이 경로를 쓸 수 없다.
**→ 조립은 UnoLive 컴포저 브라우저에서. API 라우트는 JSON 중계만.**

사용자 지시 "기존 말씀찾기(본문), 말씀찾기(인용), 설교대지 이 스타일 그대로 가져와서 갑시다" 를 지키려면 이 제약을 반드시 따라야 한다.

### 2단계 분리를 택한 이유

성경 팩(`data/bibles/local-bible.json`, 7MB)과 등록 템플릿(`data/templates/` 17개)이 UnoLive 프로젝트 폴더에만 있다. Vercel 서버는 맥 파일시스템에 접근할 수 없다.

하지만 **파싱은 성경 데이터가 전혀 필요 없다.** `요14:1-3` 이 성경 표기인지는 정규식으로 알 수 있고, 실제 본문 텍스트는 생성 단계에서만 쓴다.

그래서 파싱·검수·저장은 Vercel에서도 되고, 생성만 현장 맥에서 한다. 교역자가 밖에서 폰으로 협조문을 올려두고 방송실이 예배 전에 굽는 실제 운영 흐름과 맞는다.

성경 팩을 `unoworship-pro` 로 복사하는 안은 버렸다. 7MB 이중화 + 라이선스 관리 대상 증가 대비 얻는 게 없다. 어차피 프로그램 파일 쓰기는 맥에서만 되기 때문이다.

### 마이그레이션 없이 간다

`sermon_outlines` 에 `metadata jsonb not null default '{}'` 가 이미 있다 (`202607200002_sermon_outlines.sql`). 파싱 구조를 `metadata.parsed` 에 넣으면 SQL 마이그레이션이 필요 없다.

`context-notes.md:185` 기록을 보면 마이그레이션은 Supabase Dashboard 에서 수동 적용해야 한다. 그 수고를 이번엔 피한다. 조회 성능이 문제되면 나중에 `parsed jsonb` 전용 컬럼으로 승격한다.

`content` 원문은 그대로 유지한다. 파싱 규칙이 바뀌면 원문에서 다시 뽑아야 하기 때문이다.

### 파싱 판정 순서를 고정한 이유

샘플 협조문에서 두 번 걸린다.

1. `제목: 마음에 근심하지 말라!` — 라벨 판정을 대지 판정보다 먼저 해야 한다
2. `1. 마음에 근심하지 말라 하심(1)` — 대지 판정을 인용 판정보다 먼저 해야 한다

그래서 **라벨 → 대지 → 인용 → 나머지** 순서를 규격으로 못박았다.

참고로 UnoLive 의 기존 `isScriptureRefLine()` 만으로 샘플을 그대로 넣으면 `성경: 요14:1-3` 이 정규식에 안 걸려서 **대지타이틀 섹션으로 잘못 생성된다.** 기존 폼은 사용자가 필드를 직접 나눠 넣는 전제라 문제가 없었다. 이번 파서가 그 앞단을 메운다.

### 중복 인용을 자동으로 지우지 않기로 한 이유

샘플 2번 대지에 `롬8:1`, `행16:31` 이 두 번 나온다. 협조문 작성 실수일 가능성이 높지만, 설교자가 실제로 재인용하는 경우도 있다. 자동으로 지우면 되돌릴 방법이 없고, 남겨두면 자막이 한 장 더 생길 뿐이다.

**되돌릴 수 없는 쪽을 기본값으로 두지 않는다** — 원문 순서 보존 + 검수 화면에서 중복 배지 표시.

### 협조문에 없는 정보

- **설교자** — 협조문 어디에도 없다. 검수 화면에서 입력받는다. 기본값은 기존 폼과 맞춰 `한만상 목사`
- **소속교회** — 기본값 `울주교회`
- **예배 종류** — 첫 줄 `주일 오전예배` 에서 힌트를 뽑되, 시스템 표기는 `주일낮예배` 라 매핑이 필요하다

### 기존 파일을 건드리지 않는 방법

사용자 지시가 "별도 폴더에 별도 파일" 이라 다음처럼 격리한다.

- `SermonOutlinePage.tsx` 는 **한 줄도 수정하지 않는다**
- 새 `app/sermon/SermonSection.tsx` 가 소탭(`원문 저장` / `자막 생성`)을 갖고 둘 중 하나를 렌더한다
- `WorkspaceTabs.tsx` 는 import 한 줄과 렌더 한 줄만 바뀐다
- UnoLive 쪽도 `worshipServiceGenerator.ts` 를 수정하지 않는다. `features/subtitle-template` 의 공개 함수만 호출한다

### 사진·유튜브 참고자료 (2026-08-02 추가 요구)

사용자 요구는 "설교 참고용으로 이미지, 영상을 자주 사용한다. 각각 프로그램이 되어도 되고 말씀찾기(인용) 프로그램 맨 하단 섹션에 추가해도 된다" 였다. 이어서 **"영상 업로드를 제외하고 유튜브 링크로 대체"** 로 확정됐다.

**영상 파일 업로드를 뺀 이유** (사용자가 직접 결정했고, 기술적으로도 맞다)

- Vercel API 라우트의 요청 본문 상한이 4.5MB 다. 기존 찬양대·준비찬양이 multipart 를 라우트로 통과시키는 방식을 그대로 쓸 수 없다
- 우회하려면 signed upload URL 이 필요한데, Supabase 무료 플랜 스토리지가 1GB 라 영상 몇 개로 찬다
- UnoLive 는 이미 유튜브를 완전히 지원한다 — `lib/canvasTypes.ts:345` 의 `VideoElement.youtubeId`, `lib/youtube.ts` 의 `extractYoutubeId()`, `lib/youtubeRouting.ts` 출력 라우팅, `lib/videoAutoplay.ts` 재생 제어. 링크만 받으면 끝난다

**사진은 브라우저에서 WebP 변환 후 올린다**

이 프로젝트가 이미 쓰는 패턴이다. `202607190002_choir_webp_storage.sql` 커밋 메시지가 "찬양대 장문 요청의 전송 용량을 줄이기 위해 고품질 WebP 저장을 허용한다" 이다. 폰 사진 원본은 4.5MB 를 넘기 쉽지만 1920px + WebP 0.9 로 변환하면 안전하게 들어온다. signed upload URL 같은 새 메커니즘이 필요 없다.

**버킷은 새로 만들어야 한다**

기존 두 버킷 모두 부적합하다.

- `choir-generated-images` — png/webp 만, 10MB
- `worship-prep-sheets` — png/jpeg/webp/pdf, 10MB

이미지만 쓸 거면 재사용도 가능하지만, 자료 성격이 다른 것을 한 버킷에 섞으면 나중에 정리(예배 후 삭제)가 어려워진다. `sermon-outline-media` 를 새로 만든다. 이 프로젝트 관례상 버킷 생성은 마이그레이션의 `insert into storage.buckets` 이므로 **사용자가 Supabase 대시보드에서 SQL 한 번 실행해야 한다.** 테이블 변경은 여전히 없다.

**배치 기본값을 `quote-tail` 로 둔 이유**

사용자가 "각각 프로그램" 과 "말씀찾기(인용) 맨 하단" 둘 다 허용했다. 기본값은 후자로 잡았다. 프로그램 개수가 늘지 않아 예배 중 방송실이 찾을 것이 적기 때문이다. 길거나 독립적으로 띄워야 하는 자료만 항목별 토글로 `own-program` 으로 바꾼다.

### 기존 파일 수정 금지와 "설교대지 페이지 이용" 의 충돌

사용자 지시가 두 개 있었다.

1. "기존 파일에 절대로 구현하지 말고 별도 폴더로 갑시다"
2. "입력페이지는 unoworship-pro-eight.vercel.app 여기 설교대지 페이지를 이용합시다"

이 앱의 설교대지 화면은 `app/page.tsx` → `WorkspaceTabs` 의 클라이언트 뷰 스위처로만 도달한다. 별도 라우트를 만들면 (1)은 완벽히 지켜지지만 (2)의 "설교대지 페이지"에서 못 들어간다.

최소 접점은 하나뿐이다 — `WorkspaceTabs.tsx` 의 **import 1줄 + 렌더 1줄**. 새 폴더의 `SermonSection` 이 소탭을 갖고, `원문 저장` 탭은 기존 `SermonOutlinePage` 를 그대로 import 해서 렌더한다. 기존 페이지 파일은 0줄 수정이다.

저장 API 도 같은 이유로 기존 `/api/sermon-outlines` 를 확장하지 않고 `/api/sermon-compose` 를 새로 만든다. 같은 테이블에 쓰되 `metadata.parsed` / `metadata.media` 만 추가로 채운다. 기존 라우트의 zod 스키마·응답 형태를 건드리면 원문 저장 탭이 회귀할 위험이 있다.

체크리스트 마지막에 `git diff --stat` 확인 항목을 넣어 이 원칙이 지켜졌는지 기계적으로 검증한다.

### 부속 프로그램 4종으로 확장 (2026-08-02)

사용자 요구가 이어지며 '설교대지에 딸린 별도 프로그램'이 네 종류가 됐다.

| kind | 입력 | 현장에서 채우는 것 |
|---|---|---|
| `image` | 사진 파일 | (없음 — 여기서 Storage 에 완결) |
| `youtube` | 링크 + 설명 | (없음 — videoId 만으로 임베드) |
| `hymn` | 장 번호 | 가사 — UnoLive `data/hymns/local-new-hymn-lyrics.json`, `GET /api/hymn?num=N` |
| `praise` | 곡명 | 슬라이드 — UnoLive `GET /api/programs?type=slide-images` 를 `findSlideProgram()` 이 부분 일치 검색 |

`hymn`·`praise` 는 이 앱에 원본 데이터가 아예 없다. **무엇을 쓸지만 적어 보내는 주문서**다.

테이블 이름을 `sermon_media_programs` → **`sermon_sub_programs`** 로 바꿨다. 찬송가 장 번호를 'media' 라고 부르는 건 거짓말이기 때문이다. 마이그레이션을 아직 적용 전이라 자유롭게 바꿀 수 있었다.

**찬송가·찬양도 서버에서 조립할 수 있다.** 브라우저 조립이 필요한 이유는 성경 본문의 넘침 분할 측정뿐인데, 찬송가는 `applyTemplate` 만 쓰고(측정 없음) 찬양은 기존 슬라이드 프로그램의 요소를 복사한다. 결국 브라우저가 꼭 필요한 건 설교대지 3종뿐이다.

### 원문 저장 탭을 새 구현으로 교체 (2026-08-02)

"원문 저장 탭 메뉴 개선 — 찬양을 찬송가와 찬양(PPT) 둘로 나누고 각각 프로그램이 되게" 요구가 왔다. 그런데 그 탭은 기존 `SermonOutlinePage.tsx` 이고 수정 금지 대상이다.

새 폴더에 `SermonOutlinePanel.tsx` 를 만들어 탭이 그것을 렌더하게 했다. 기존 파일은 디스크에 그대로 있고 한 줄도 안 바뀌었다. 저장 API 도 같은 이유로 `/api/sermon-compose/outline` 을 새로 만들었다 — 기존 `/api/sermon-outlines` 의 zod 스키마를 건드리면 회귀 위험이 있다. 같은 `sermon_outlines` 테이블에 쓴다.

새 패널이 기존 대비 나아진 점.

- 도래하는 정기예배 자동 인식 (기존은 `주일낮예배` 고정)
- 원문을 붙여넣는 즉시 제목·본문·대지·인용으로 나뉜 결과를 오른쪽에 미리보기
- 찬양 칸 하나 → 찬송가(장 번호) + 찬양(곡명) 둘로 분리, 각각 자기 프로그램
- 장 번호로 못 읽은 입력(`999장`, `사과`)을 사유와 함께 알려 준다

### ServiceFields 의 제목 칸을 끌 수 있게 한 이유

원문 저장 탭은 프로그램을 **둘** 만든다(찬송가·찬양). 단일 제목 입력칸을 그대로 두면 사용자가 입력해도 아무 데도 반영되지 않는다. 입력해도 무시되는 칸은 두지 않는다는 원칙으로 `showTitle` 옵션을 넣고, 대신 만들어질 이름 두 개를 안내로 보여 준다.

### 범위를 설교대지 3종으로 묶은 이유

사용자가 "설교대지 관련만" 을 택했다. 찬송가·찬양은 기존 "예배 자막 협조" 폼이 이미 처리하고, 협조문의 `찬양:` 줄은 파싱해서 **표시만** 하고 프로그램은 만들지 않는다. 두 입력 경로가 같은 프로그램을 중복 생성하는 사고를 막는다.
