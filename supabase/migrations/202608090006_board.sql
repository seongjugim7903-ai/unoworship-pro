-- 전 팀 공유 게시판.
--  글은 팀장급 이상(팀 담당자·교회 관리자)만, 보기·댓글은 모든 참여자.
--  예배준비(새신자 명단·긴급 준비·준비 항목)는 이 게시판의 카테고리로 담는다.
--
--  권한은 서버 라우트가 막는다(RLS 는 service role 로 우회). anon 공개 정책은 만들지 않는다.

create extension if not exists pgcrypto;

create table if not exists public.board_posts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  church_id uuid not null references public.churches(id) on delete cascade,
  author_user_id uuid references auth.users(id),
  /* 카톡 닉네임 말고 교회에서 부르는 이름 — 지운 뒤에도 남게 스냅샷으로 둔다 */
  author_name text not null default '',
  /* 일반 | 새신자 | 긴급 | 준비항목 — 화면 분류일 뿐 권한 축이 아니다 */
  category text not null default '일반',
  title text not null,
  body text not null default '',
  /* 급한 공지는 위로 올린다 */
  pinned boolean not null default false,
  comment_count integer not null default 0,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists board_posts_church_idx
  on public.board_posts (church_id, pinned desc, created_at desc);

create table if not exists public.board_comments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  church_id uuid not null references public.churches(id) on delete cascade,
  post_id uuid not null references public.board_posts(id) on delete cascade,
  author_user_id uuid references auth.users(id),
  author_name text not null default '',
  body text not null
);

create index if not exists board_comments_post_idx
  on public.board_comments (post_id, created_at);

-- updated_at 자동 갱신 (다른 마이그레이션에서 만든 함수 재사용)
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists board_posts_set_updated_at on public.board_posts;
create trigger board_posts_set_updated_at
before update on public.board_posts
for each row execute function public.set_updated_at();

-- 댓글수는 트리거로 항상 맞춘다 — 화면이 목록에서 바로 보여줄 수 있게.
create or replace function public.bump_board_comment_count()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    update public.board_posts set comment_count = comment_count + 1 where id = new.post_id;
  elsif tg_op = 'DELETE' then
    update public.board_posts set comment_count = greatest(0, comment_count - 1) where id = old.post_id;
  end if;
  return null;
end;
$$;

drop trigger if exists board_comments_count_ins on public.board_comments;
create trigger board_comments_count_ins after insert on public.board_comments
for each row execute function public.bump_board_comment_count();

drop trigger if exists board_comments_count_del on public.board_comments;
create trigger board_comments_count_del after delete on public.board_comments
for each row execute function public.bump_board_comment_count();

alter table public.board_posts enable row level security;
alter table public.board_comments enable row level security;
