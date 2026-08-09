# 로그인 · 교회 · 팀 (features/membership)

로그인부터 교회 참여, 팀 소속, 권한까지 **이 폴더 하나에** 모여 있습니다.
바깥에는 Next.js가 요구하는 라우트 껍데기와 API만 남겨 뒀습니다.

---

## 한눈에

```
로그인       카카오 (이메일+비밀번호도 남겨 둠)
   ↓
교회 참여    교회 참여 코드 — 최초 한 번
   ↓
담당자       담당자 코드 — 팀마다 1회용. 받은 사람만
```

권한은 **두 갈래**뿐입니다. 카테고리(설교대지·준비찬양·찬양대) 담당은 두지 않습니다 —
교회 관리자와 역할이 겹쳐 "누가 무엇을 할 수 있나"가 세 갈래가 됩니다.

| 누구 | 무엇을 |
|---|---|
| 교회 관리자 | 전부. 코드 발급, 팀 만들기, 목회자 지정 |
| 팀 담당자 | 그 팀 자료만 수정·삭제 |
| 목회자 | 설교대지를 쓴다. 남의 것은 못 고친다 |
| 그 외 참여자 | 보기만 |

---

## 파일

| 파일 | 하는 일 |
|---|---|
| `inviteCode.ts` | 코드 생성·정규화, 권한 판정 — **순수 함수만**. 테스트는 여기를 본다 |
| `store.ts` | DB를 만지는 쪽. 코드 확인, 교회·팀 가입, 소속 조회 (서버 전용) |
| `currentUser.ts` | 지금 요청을 보낸 로그인 사용자 (없으면 `null`) |
| `requireLogin.ts` | 쓰기 라우트의 로그인 강제. `UNOWORSHIP_REQUIRE_LOGIN` 으로 켠다 |
| `AuthGate.tsx` | 입력 화면 앞의 문. 미로그인·미참여를 걸러 참여 화면으로 |
| `AuthBadge.tsx` | 홈 우측 상단. 로그인 상태와 관리자 진입점 |
| `JoinPanel.tsx` | 참여 화면 — 이름 + 교회 참여 코드 |
| `LeaderPanel.tsx` | 담당자 코드 입력 — 참여를 마친 뒤 따로 |
| `AdminPanel.tsx` | 관리자 — 코드 발급·회수 |

**`server-only` 이 붙은 모듈은 vitest 가 읽지 못합니다.** 그래서 순수 함수를
`inviteCode.ts` 로 따로 뺐습니다. 테스트할 로직은 그쪽에 두세요.

## 바깥에 남아 있는 것

| 경로 | 왜 바깥인가 |
|---|---|
| `app/onboarding/` `app/onboarding/leader/` `app/admin/` | Next.js 라우트 규칙. 껍데기만 |
| `app/api/membership/*` | 라우트 핸들러. `join` `me` `codes` `members` |
| `app/api/teams/` | 팀 목록·생성·가입 |
| `middleware.ts` | 전면 로그인 차단. 루트에 있어야 동작한다 |
| `lib/churchScope.ts` | 교회 범위 — 다른 기능들도 쓴다 |
| `lib/authn/supabaseAuth.ts` `supabaseBrowser.ts` `deviceToken.ts` | 이 기능 이전부터 있던 것 |

---

## 판단이 갈렸던 곳

**왜 '처음 들어온 사람이 팀장'이 아닌가** — 코드는 십중팔구 단톡방에 뿌려집니다.
팀장에게 1:1로 보내도 그대로 복사해 팀원들에게 돌립니다. **팀장 자리만 1회용으로
닫아 두면** 코드가 돌아다녀도 사고가 나지 않습니다.

**교회 관리자는 첫 참여자입니다.** 구독을 결제한 사람이 가장 먼저 들어오므로 위험이
거의 없습니다. 위험한 건 팀 단위뿐입니다.

**이름을 따로 받습니다.** 카톡 닉네임은 `🌸행복🌸`, `ㅁㅁ`, `아빠` 같은 것이 흔해서
관리자가 누가 누구인지 알 수 없습니다. 참여할 때 '교회에서 부르는 이름'을 한 번 받습니다.

**설교대지는 팀이 아니라 개인입니다.** 담임목사도 부교역자도 각자 자기 것을 씁니다.
`church_members.is_preacher` 로 표시합니다 — `role` 은 하나뿐이라 목회자이면서 찬양팀
담당인 경우를 담지 못합니다.

**팀 가입은 자유입니다.** 팀 경계는 '자기 팀 것만 보이게 해서 화면을 단순하게' 하는
장치이지 훔쳐보기를 막는 잠금이 아닙니다.

**카카오 동의항목을 Supabase 기본 스코프에 맞춰야 합니다.** Supabase 는 자기 기본
스코프(`account_email profile_image profile_nickname`)에 우리 것을 **덧붙입니다.**
덮어쓰지 않습니다. 그래서 코드로 `account_email` 을 뺄 수 없고, 카카오 쪽에서
프로필 사진과 이메일을 **선택 동의**로 켜야 합니다. 안 켜면 `KOE205` 로 막힙니다.

더 자세한 배경은 [docs/features/auth-church-scope/context-notes.md](../../docs/features/auth-church-scope/context-notes.md)
에 있습니다.

---

## 아직 안 한 것

[docs/features/auth-church-scope/checklist.md](../../docs/features/auth-church-scope/checklist.md) 를 보세요.
