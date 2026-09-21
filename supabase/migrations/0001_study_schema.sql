-- 0001_study_schema.sql
-- AI study features: study sets, document chunks, flashcards (with spaced repetition), review log,
-- question flags. Extends documents / questions / study_sessions. Additive and re-runnable.
-- Row Level Security follows the same pattern as your existing tables.
-- Run in the Supabase SQL editor. It runs as ONE transaction: if anything fails, nothing is changed.

begin;

-- ============================================================================
-- 1. documents: PowerPoint support + processing details
-- ============================================================================
alter table public.documents drop constraint if exists documents_file_type_check;
alter table public.documents add constraint documents_file_type_check
  check (file_type = any (array['pdf'::text, 'docx'::text, 'pptx'::text]));

alter table public.documents
  add column if not exists mime_type text,
  add column if not exists size_bytes bigint,
  add column if not exists char_count integer,
  add column if not exists chunk_count integer,
  add column if not exists processing_stage text,   -- null when idle; 'extracting' or 'saving' while processing
  add column if not exists error_message text;      -- shown to the user when status = 'failed'

alter table public.documents drop constraint if exists documents_processing_stage_check;
alter table public.documents add constraint documents_processing_stage_check
  check (processing_stage is null or processing_stage = any (array['extracting'::text, 'saving'::text]));

-- ============================================================================
-- 2. study_sets: one per generation run (a document can have several)
-- ============================================================================
create table if not exists public.study_sets (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  document_id     uuid not null references public.documents(id) on delete cascade,
  title           text not null,
  settings        jsonb not null default '{}'::jsonb,       -- the options the user chose
  status          text not null default 'generating'
                    check (status = any (array['generating'::text, 'ready'::text, 'failed'::text])),
  stage           text check (stage is null or stage = any (array['analyzing'::text, 'generating'::text, 'saving'::text])),
  progress_done   integer not null default 0,
  progress_total  integer not null default 0,
  error_message   text,
  warnings        jsonb not null default '[]'::jsonb,
  flashcard_count integer not null default 0,
  question_count  integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists study_sets_user_created_idx on public.study_sets (user_id, created_at desc);
create index if not exists study_sets_document_idx on public.study_sets (document_id);

-- ============================================================================
-- 3. document_chunks: the extracted text, kept so "View source" and re-generation work
-- ============================================================================
create table if not exists public.document_chunks (
  id          uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  chunk_index integer not null,
  text        text not null,
  sources     jsonb not null default '[]'::jsonb,
  heading     text,
  char_count  integer not null,
  created_at  timestamptz not null default now(),
  constraint document_chunks_doc_index_key unique (document_id, chunk_index)
);

-- ============================================================================
-- 4. questions: new question types, difficulty, source, link to study set / chunk
-- ============================================================================
alter table public.questions drop constraint if exists questions_question_type_check;
alter table public.questions add constraint questions_question_type_check
  check (question_type = any (array['multiple_choice'::text, 'true_false'::text, 'identification'::text,
                                    'short_answer'::text, 'scenario'::text]));

alter table public.questions
  add column if not exists study_set_id uuid references public.study_sets(id) on delete cascade,
  add column if not exists chunk_id uuid references public.document_chunks(id) on delete set null,
  add column if not exists difficulty text not null default 'medium',
  add column if not exists source jsonb not null default '{}'::jsonb;

alter table public.questions drop constraint if exists questions_difficulty_check;
alter table public.questions add constraint questions_difficulty_check
  check (difficulty = any (array['easy'::text, 'medium'::text, 'hard'::text]));

create index if not exists questions_study_set_idx on public.questions (study_set_id);
create index if not exists questions_document_idx on public.questions (document_id);
create index if not exists questions_topic_idx on public.questions (topic_id);

-- ============================================================================
-- 5. study_sessions: what kind of session, and for which study set
-- ============================================================================
alter table public.study_sessions
  add column if not exists mode text,
  add column if not exists study_set_id uuid references public.study_sets(id) on delete set null;

alter table public.study_sessions drop constraint if exists study_sessions_mode_check;
alter table public.study_sessions add constraint study_sessions_mode_check
  check (mode is null or mode = any (array['flashcards'::text, 'quiz'::text, 'review'::text]));

create index if not exists study_sessions_user_started_idx on public.study_sessions (user_id, started_at desc);
create index if not exists question_attempts_session_idx on public.question_attempts (session_id);
create index if not exists question_attempts_question_idx on public.question_attempts (question_id);

-- ============================================================================
-- 6. flashcards, with SM-2 spaced-repetition state (scheduling is done by the app, never by the AI)
-- ============================================================================
create table if not exists public.flashcards (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles(id) on delete cascade,
  study_set_id     uuid not null references public.study_sets(id) on delete cascade,
  document_id      uuid not null references public.documents(id) on delete cascade,
  chunk_id         uuid references public.document_chunks(id) on delete set null,
  topic_id         uuid references public.topics(id) on delete set null,
  front            text not null,
  back             text not null,
  difficulty       text not null default 'medium'
                     check (difficulty = any (array['easy'::text, 'medium'::text, 'hard'::text])),
  source           jsonb not null default '{}'::jsonb,
  due_at           timestamptz not null default now(),      -- next review
  interval_days    integer not null default 0,
  ease             numeric(4,2) not null default 2.50,
  repetitions      integer not null default 0,
  lapses           integer not null default 0,
  times_reviewed   integer not null default 0,
  times_correct    integer not null default 0,
  last_reviewed_at timestamptz,
  created_at       timestamptz not null default now()
);
create index if not exists flashcards_user_due_idx on public.flashcards (user_id, due_at);
create index if not exists flashcards_study_set_idx on public.flashcards (study_set_id);
create index if not exists flashcards_topic_idx on public.flashcards (topic_id);
create index if not exists flashcards_document_idx on public.flashcards (document_id);

-- ============================================================================
-- 7. flashcard_reviews: one row per rating (drives progress, streaks and weak topics)
-- ============================================================================
create table if not exists public.flashcard_reviews (
  id                  uuid primary key default gen_random_uuid(),
  flashcard_id        uuid not null references public.flashcards(id) on delete cascade,
  user_id             uuid not null references public.profiles(id) on delete cascade,
  session_id          uuid references public.study_sessions(id) on delete set null,
  rating              text not null check (rating = any (array['again'::text, 'hard'::text, 'good'::text, 'easy'::text])),
  interval_days_before integer,
  interval_days_after  integer,
  ease_after          numeric(4,2),
  reviewed_at         timestamptz not null default now()
);
create index if not exists flashcard_reviews_user_time_idx on public.flashcard_reviews (user_id, reviewed_at desc);
create index if not exists flashcard_reviews_card_idx on public.flashcard_reviews (flashcard_id);

-- ============================================================================
-- 8. question_flags: "Report a problem" on a bad AI-generated item
-- ============================================================================
create table if not exists public.question_flags (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  question_id  uuid references public.questions(id) on delete cascade,
  flashcard_id uuid references public.flashcards(id) on delete cascade,
  reason       text not null default 'other'
                 check (reason = any (array['wrong_answer'::text, 'unclear'::text, 'not_in_source'::text,
                                            'duplicate'::text, 'other'::text])),
  note         text check (note is null or char_length(note) <= 500),
  created_at   timestamptz not null default now(),
  constraint question_flags_one_target check ((question_id is not null)::int + (flashcard_id is not null)::int = 1)
);
create index if not exists question_flags_user_idx on public.question_flags (user_id);

-- ============================================================================
-- 9. Row Level Security
-- ============================================================================
alter table public.study_sets        enable row level security;
alter table public.document_chunks   enable row level security;
alter table public.flashcards        enable row level security;
alter table public.flashcard_reviews enable row level security;
alter table public.question_flags    enable row level security;

-- study_sets: yours only, and only for a document you own
drop policy if exists study_sets_select_own on public.study_sets;
create policy study_sets_select_own on public.study_sets for select
  using ((select auth.uid()) = user_id);
drop policy if exists study_sets_insert_own on public.study_sets;
create policy study_sets_insert_own on public.study_sets for insert
  with check ((select auth.uid()) = user_id
    and exists (select 1 from public.documents d where d.id = study_sets.document_id and d.user_id = (select auth.uid())));
drop policy if exists study_sets_update_own on public.study_sets;
create policy study_sets_update_own on public.study_sets for update
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists study_sets_delete_own on public.study_sets;
create policy study_sets_delete_own on public.study_sets for delete
  using ((select auth.uid()) = user_id);

-- document_chunks: through the parent document, like your questions table
drop policy if exists document_chunks_select_own on public.document_chunks;
create policy document_chunks_select_own on public.document_chunks for select
  using (exists (select 1 from public.documents d where d.id = document_chunks.document_id and d.user_id = (select auth.uid())));
drop policy if exists document_chunks_insert_own on public.document_chunks;
create policy document_chunks_insert_own on public.document_chunks for insert
  with check (exists (select 1 from public.documents d where d.id = document_chunks.document_id and d.user_id = (select auth.uid())));
drop policy if exists document_chunks_delete_own on public.document_chunks;
create policy document_chunks_delete_own on public.document_chunks for delete
  using (exists (select 1 from public.documents d where d.id = document_chunks.document_id and d.user_id = (select auth.uid())));

-- questions: same as before, but an inserted question may only point at YOUR study set, chunk and topic
drop policy if exists questions_insert_own on public.questions;
create policy questions_insert_own on public.questions for insert
  with check (
    exists (select 1 from public.documents d where d.id = questions.document_id and d.user_id = (select auth.uid()))
    and (study_set_id is null or exists (
          select 1 from public.study_sets s where s.id = questions.study_set_id and s.user_id = (select auth.uid())))
    and (chunk_id is null or exists (
          select 1 from public.document_chunks c where c.id = questions.chunk_id and c.document_id = questions.document_id))
    and (topic_id is null or exists (
          select 1 from public.topics t where t.id = questions.topic_id and t.user_id = (select auth.uid())))
  );

-- flashcards: yours only; may only point at your study set, chunk and topic
drop policy if exists flashcards_select_own on public.flashcards;
create policy flashcards_select_own on public.flashcards for select
  using ((select auth.uid()) = user_id);
drop policy if exists flashcards_insert_own on public.flashcards;
create policy flashcards_insert_own on public.flashcards for insert
  with check ((select auth.uid()) = user_id
    and exists (select 1 from public.study_sets s where s.id = flashcards.study_set_id
                  and s.user_id = (select auth.uid()) and s.document_id = flashcards.document_id)
    and (chunk_id is null or exists (
          select 1 from public.document_chunks c where c.id = flashcards.chunk_id and c.document_id = flashcards.document_id))
    and (topic_id is null or exists (
          select 1 from public.topics t where t.id = flashcards.topic_id and t.user_id = (select auth.uid()))));
drop policy if exists flashcards_update_own on public.flashcards;
create policy flashcards_update_own on public.flashcards for update
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists flashcards_delete_own on public.flashcards;
create policy flashcards_delete_own on public.flashcards for delete
  using ((select auth.uid()) = user_id);

-- flashcard_reviews: append-only log of your own reviews of your own cards
drop policy if exists flashcard_reviews_select_own on public.flashcard_reviews;
create policy flashcard_reviews_select_own on public.flashcard_reviews for select
  using ((select auth.uid()) = user_id);
drop policy if exists flashcard_reviews_insert_own on public.flashcard_reviews;
create policy flashcard_reviews_insert_own on public.flashcard_reviews for insert
  with check ((select auth.uid()) = user_id
    and exists (select 1 from public.flashcards f where f.id = flashcard_reviews.flashcard_id and f.user_id = (select auth.uid())));

-- question_flags: your own reports about items you can see
drop policy if exists question_flags_select_own on public.question_flags;
create policy question_flags_select_own on public.question_flags for select
  using ((select auth.uid()) = user_id);
drop policy if exists question_flags_insert_own on public.question_flags;
create policy question_flags_insert_own on public.question_flags for insert
  with check ((select auth.uid()) = user_id
    and (question_id is null or exists (select 1 from public.questions q where q.id = question_flags.question_id))
    and (flashcard_id is null or exists (select 1 from public.flashcards f where f.id = question_flags.flashcard_id)));
drop policy if exists question_flags_delete_own on public.question_flags;
create policy question_flags_delete_own on public.question_flags for delete
  using ((select auth.uid()) = user_id);

-- ============================================================================
-- 10. Table privileges (RLS above still decides which rows anyone can touch)
-- ============================================================================
grant select, insert, update, delete on
  public.study_sets, public.document_chunks, public.flashcards, public.flashcard_reviews, public.question_flags
  to authenticated;

commit;
