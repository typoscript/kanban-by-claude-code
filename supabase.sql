-- ============================================================
-- Supabase 대시보드 > SQL Editor 에서 실행하세요
-- ============================================================

create table if not exists cards (
  id          uuid        default gen_random_uuid() primary key,
  column_name text        not null check (column_name in ('todo', 'in-progress', 'done')),
  text        text        not null,
  position    integer     not null default 0,
  created_at  timestamptz default now()
);

alter table cards enable row level security;

-- 인증 없이 누구나 읽기/쓰기 가능 (공유 칸반 보드)
create policy "public read"   on cards for select using (true);
create policy "public insert" on cards for insert with check (true);
create policy "public update" on cards for update using (true);
create policy "public delete" on cards for delete using (true);
