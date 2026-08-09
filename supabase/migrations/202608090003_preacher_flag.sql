-- 설교대지를 쓸 수 있는 사람 — 목회자 표시.
--
--  설교대지는 팀이 아니라 개인이다. 담임목사도 부교역자도 각자 자기 것을 쓴다.
--  그래서 '팀 담당'으로 다룰 수 없고, 사람에게 붙는 표시가 필요하다.
--
--  role 을 늘리지 않고 별도 칼럼으로 둔 이유 — 한 사람이 목회자이면서 찬양팀
--  담당일 수 있다. role 은 하나뿐이라 그 둘을 같이 담지 못한다.
--
--  교회 관리자는 이 표시와 무관하게 어디든 쓸 수 있다.

alter table public.church_members
  add column if not exists is_preacher boolean not null default false;

-- 교회 관리자는 설교대지도 쓰므로 표시를 같이 켜 준다.
update public.church_members set is_preacher = true where role = 'admin';

select c.name as 교회, m.role as 역할, m.is_preacher as 목회자, p.full_name as 이름
from public.church_members m
join public.churches c on c.id = m.church_id
left join public.profiles p on p.id = m.user_id
order by c.name, m.role;
