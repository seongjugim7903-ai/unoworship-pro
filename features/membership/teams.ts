// 팀 카테고리 — 화면과 API 가 같은 목록을 봐야 한다.
//
// 카테고리는 화면을 나누는 이름이지 권한 축이 아니다. 권한은 팀과 작성자 둘로 갈린다.
// 설교대지는 여기 없다 — 팀이 아니라 개인이라 church_members.is_preacher 로 다룬다.
//
// 팀 '이름'은 교회마다 다르므로 관리자가 직접 만든다(worship_teams).
// 카테고리만 제품이 정한다.

export const TEAM_CATEGORIES = ['준비찬양', '찬양대', '방송실', '예배준비'] as const;

export type TeamCategory = (typeof TEAM_CATEGORIES)[number];
