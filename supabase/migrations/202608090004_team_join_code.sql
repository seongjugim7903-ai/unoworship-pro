-- 팀 코드 — 사용자가 코드를 하나만 넣게 한다.
--
--  코드는 이미 교회에 매여 있다(church_id). 그래서 팀 코드 하나면 교회 구분도
--  팀 배정도 함께 끝난다 — 교회 코드와 팀 코드를 둘 다 받아 적게 하면 번거롭기만 하다.
--
--  church_join  교회 부트스트랩. 구독할 때 관리자에게 한 번
--  team_join    팀 코드. 여러 번 쓴다 (팀원 모두)
--  team_leader  담당자 코드. 1회용
--
--  담당자 자리만 1회용으로 닫아 둔다. 코드는 십중팔구 단톡방에 뿌려지는데,
--  그래도 먼저 쓴 사람 뒤로는 아무도 담당자가 될 수 없다.

create unique index if not exists invite_codes_team_join_idx
  on public.invite_codes (church_id, team)
  where kind = 'team_join' and revoked_at is null;
