// 카카오에 요청할 동의항목.
//
// 닉네임 하나만 요청한다. Supabase 의 카카오 기본 스코프에는 account_email 이 들어 있는데,
// 우리는 카카오 동의항목에서 이메일을 '사용 안함'으로 껐다(이메일은 비즈 앱 전환을 요구한다).
// 쓸 수 없는 항목을 요청하면 카카오가 KOE205 로 막는다 — 실제로 그렇게 막혔다.
//
// 이메일이 없어 생기는 일은 감수하기로 한 부분이다
// (docs/features/auth-church-scope/context-notes.md).

export const KAKAO_SCOPES = 'profile_nickname';
