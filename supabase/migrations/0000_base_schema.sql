-- Fresh-project baseline. Existing tables/data are retained.
-- Apply before 0001; never run *_rollback.sql during deployment.
begin;
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text, full_name text, created_at timestamptz not null default now()
);
alter table public.profiles add column if not exists email text, add column if not exists full_name text;
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null, file_type text not null, storage_path text not null,
  status text not null default 'processing' check (status in ('processing','ready','failed')),
  page_count integer, created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.topics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null, created_at timestamptz not null default now(), unique(user_id,name)
);
create table if not exists public.document_topics (
  document_id uuid references public.documents(id) on delete cascade,
  topic_id uuid references public.topics(id) on delete cascade, primary key(document_id,topic_id)
);
create table if not exists public.questions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  topic_id uuid references public.topics(id) on delete set null,
  question_text text not null, question_type text not null, options jsonb,
  correct_answer text not null, explanation text, created_at timestamptz not null default now()
);
create table if not exists public.study_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  document_id uuid references public.documents(id) on delete set null,
  started_at timestamptz not null default now(), ended_at timestamptz
);
create table if not exists public.study_session_topics (
  session_id uuid references public.study_sessions(id) on delete cascade,
  topic_id uuid references public.topics(id) on delete cascade, primary key(session_id,topic_id)
);
create table if not exists public.question_attempts (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.study_sessions(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  user_answer text, is_correct boolean, attempted_at timestamptz not null default now()
);
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null, note text, due_date date, is_done boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists documents_user_created_idx on public.documents(user_id,created_at desc);
create index if not exists tasks_user_idx on public.tasks(user_id);
create or replace function public.create_user_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id,email) values(new.id,new.email) on conflict(id) do nothing;
  return new;
end $$;
revoke all on function public.create_user_profile() from public;
drop trigger if exists si_rebyu_create_profile on auth.users;
create trigger si_rebyu_create_profile after insert on auth.users
for each row execute function public.create_user_profile();
insert into public.profiles(id,email) select id,email from auth.users on conflict(id) do nothing;

-- Restrictive guards also constrain any permissive policies on an existing project.
do $$
declare t text; condition text;
begin
  foreach t in array array['profiles','documents','topics','tasks','study_sessions',
                            'questions','document_topics','question_attempts','study_session_topics'] loop
    execute format('alter table public.%I enable row level security', t);
    condition := case
      when t = 'profiles' then 'id = (select auth.uid())'
      when t in ('documents','topics','tasks','study_sessions') then 'user_id = (select auth.uid())'
      when t = 'questions' then 'exists (select 1 from public.documents d where d.id = questions.document_id and d.user_id = (select auth.uid()))'
      when t = 'document_topics' then 'exists (select 1 from public.documents d where d.id = document_topics.document_id and d.user_id = (select auth.uid())) and exists (select 1 from public.topics t where t.id = document_topics.topic_id and t.user_id = (select auth.uid()))'
      when t = 'question_attempts' then 'exists (select 1 from public.study_sessions s where s.id = question_attempts.session_id and s.user_id = (select auth.uid())) and exists (select 1 from public.questions q where q.id = question_attempts.question_id)'
      else 'exists (select 1 from public.study_sessions s where s.id = study_session_topics.session_id and s.user_id = (select auth.uid())) and exists (select 1 from public.topics t where t.id = study_session_topics.topic_id and t.user_id = (select auth.uid()))'
    end;
    execute format('drop policy if exists owner_access on public.%I',t);
    execute format('create policy owner_access on public.%I to authenticated using (%s) with check (%s)',t,condition,condition);
    execute format('drop policy if exists owner_guard on public.%I',t);
    execute format('create policy owner_guard on public.%I as restrictive to authenticated using (%s) with check (%s)',t,condition,condition);
    execute format('grant select,insert,update,delete on public.%I to authenticated',t);
  end loop;
end $$;
commit;
