# UnoWorship Pro — 문서 시작점

**여기부터 읽으세요.** 작업을 이어갈 때 이 문서 하나만 열면 지금 어디까지 왔고
다음에 뭘 해야 하는지 알 수 있게 둡니다.

---

## 이 제품이 하는 일

교회 예배 자료를 **입력웹에서 넣으면 현장 맥이 송출 프로그램으로 만들어** 줍니다.

```
입력웹 (unoworship-pro · Vercel)        현장 맥 (UnoLive-plus-atem-field)
  헵시바 선교단  찬양대 자막      →      컴포저 프로그램
  설교대지      설교 대지·주보    →      설교대지 · 말씀찾기 · 찬송가 · 찬양
  준비찬양      팀별 곡·악보      →      찬양 PPT 프로그램
                                        + 예배 당일 자동 배치
```

두 저장소가 Supabase를 사이에 두고 만납니다. 입력웹은 Vercel에 배포되고,
현장 맥은 리모트 없는 로컬 저장소라 그 맥에서만 돕니다.

| | 어디 | 배포 |
|---|---|---|
| 입력웹 | `unoworship-pro` | Vercel — https://unoworship-pro-eight.vercel.app |
| 현장 맥 | `UnoLive-plus-atem-field` | 없음. 컴포저 새로고침이면 반영 |

---

## 지금 상태 (2026-08-09)

### 되는 것

- 세 기능(헵시바·설교대지·준비찬양) 입력과 저장
- 설교대지 → 현장 맥 프로그램 5종 생성
- 준비찬양 → 곡마다 PPT 변환본 프로그램. 없는 곡은 브라우저 검색 후 자동감지
- 예배 당일 컴포저를 열면 도래하는 정기예배가 자동으로 올라옴
- 연주용 악보 보기 — 아이패드 전체화면, 발 페달, 여백 자동 잘라내기
- **카카오 로그인 · 교회 참여** (오늘 완료, 첫 로그인 성공 확인)
- **초대 링크** — 팀원은 링크만 누르면 들어옵니다. 코드를 적을 일이 없습니다

### 다음에 할 것

**권한 검사를 자료 저장에 붙이는 일**이 다음입니다. 지금은 담당자든 아니든 저장이 됩니다 —
판정 함수(`canEditTeam` · `canWriteSermon`)는 있는데 아무 데서도 부르지 않습니다.

그다음이 [팀 페이지](./features/team-workspace/context-notes.md)입니다.
자세한 목록은 [auth-church-scope/checklist.md](./features/auth-church-scope/checklist.md).

---

## 기능별 문서

작업 전에 해당 문서를 먼저 읽으세요. **왜 그렇게 했는지**가 적혀 있어서,
같은 함정을 다시 밟지 않습니다.

| 무엇 | 문서 |
|---|---|
| 로그인 · 교회 · 팀 권한 | [auth-church-scope/context-notes.md](./features/auth-church-scope/context-notes.md) · [checklist](./features/auth-church-scope/checklist.md) |
| 준비찬양 라이브러리 · 악보 | [worship-prep-library/context-notes.md](./features/worship-prep-library/context-notes.md) · [checklist](./features/worship-prep-library/checklist.md) |
| 팀 페이지 (아직 안 만듦) | [team-workspace/context-notes.md](./features/team-workspace/context-notes.md) |

현장 맥(UnoLive) 쪽 문서는 그 저장소의 `docs/features/` 아래에 있습니다.

- `upcoming-worship-autoload/NOTE.md` — 예배 당일 자동 불러오기
- `sermon-compose-import/DUPLICATE-FIX.md` — 찬송가가 여러 개 딸려오던 문제
- `subtitle-template-sets/DECISION.md` — 교회별 자막 템플릿 세트

---

## 작업 방식

이 저장소에서 지키고 있는 것들입니다.

**문서를 먼저 씁니다.** 기능마다 `context-notes.md`(왜)와 `checklist.md`(무엇을)를 둡니다.
결정을 바꿨으면 **바꾼 이유까지** 적습니다 — 되돌린 판단이 문서에 남아 있어야
다음 사람이 같은 길을 다시 가지 않습니다.

**모든 파일 첫 줄에 한국어 한 줄 주석**을 답니다. 그 파일이 무엇을 하는 파일인지
바로 알 수 있어야 합니다.

**검증하고 커밋합니다.** `npx tsc --noEmit` · `npm test` · `npx eslint` · **`npx next build`** 넷을
돌립니다. 화면 변화는 브라우저로 직접 확인합니다.

**`next build` 를 빼면 안 됩니다.** 라우트 파일(`app/api/**/route.ts`)은 Next.js 가 정한
것(`runtime` · `GET` · `POST` …)만 내보낼 수 있는데, 거기에 상수를 하나 내보내면
`tsc` 도 `eslint` 도 통과하고 **`next build` 에서만 걸립니다.** 실제로 그렇게 빌드가 깨져
새 API 가 배포되지 않은 채 옛 배포본이 서빙된 적이 있습니다(2026-08-09).

**커밋 하나에 한 가지 변경**입니다. 커밋 메시지에 **무엇을 왜 바꿨는지** 적습니다.

---

## 자주 쓰는 명령

개발 서버

```bash
cd /Users/kimseongju/unogstack/projects/unoworship-pro && npx next dev -p 3100
```

검증

```bash
cd /Users/kimseongju/unogstack/projects/unoworship-pro && npx tsc --noEmit && npm test && npx eslint app lib features tests && npx next build
```

배포 확인 (푸시하면 Vercel이 자동 배포)

```bash
cd /Users/kimseongju/unogstack/projects/unoworship-pro && gh api "repos/seongjugim7903-ai/unoworship-pro/deployments?per_page=1" --jq '.[0].sha[0:7]'
```

---

## 바깥 설정 — 코드로 못 바꾸는 것들

| 무엇 | 어디 | 메모 |
|---|---|---|
| Supabase 프로젝트 | ref `hwbzztfjzeismosjkmhe` | SQL Editor에서 마이그레이션 적용 |
| 카카오 앱 | `uljucommunity` (890593) | 동의항목·Redirect URI |
| Vercel | unoworship-pro | 환경변수 |
| Anthropic | 주보 OCR (`claude-opus-4-8`) | 주 1회 60~110원 |

자세한 절차는 [auth-church-scope/context-notes.md](./features/auth-church-scope/context-notes.md)
의 「바깥 설정」 절에 있습니다.
