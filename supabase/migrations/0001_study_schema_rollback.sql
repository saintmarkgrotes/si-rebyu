-- 0001_study_schema_rollback.sql
-- Undoes 0001_study_schema.sql. WARNING: this permanently deletes all generated study sets, chunks,
-- flashcards, reviews and flags, and removes the added columns. It fails (changing nothing) if any
-- PowerPoint documents or the new question types already exist, because the old constraints forbid them.

begin;

drop table if exists public.question_flags;
drop table if exists public.flashcard_reviews;
drop table if exists public.flashcards;

-- questions created by study sets would violate the restored constraints, so remove them first
delete from public.questions where study_set_id is not null;

drop policy if exists questions_insert_own on public.questions;
create policy questions_insert_own on public.questions for insert
  with check (exists (select 1 from public.documents d where d.id = questions.document_id and d.user_id = auth.uid()));

alter table public.questions
  drop column if exists study_set_id,
  drop column if exists chunk_id,
  drop column if exists difficulty,
  drop column if exists source;
alter table public.questions drop constraint if exists questions_question_type_check;
alter table public.questions add constraint questions_question_type_check
  check (question_type = any (array['multiple_choice'::text, 'short_answer'::text, 'true_false'::text]));

drop index if exists public.questions_document_idx;
drop index if exists public.questions_topic_idx;
drop index if exists public.question_attempts_session_idx;
drop index if exists public.question_attempts_question_idx;
drop index if exists public.study_sessions_user_started_idx;
alter table public.study_sessions drop constraint if exists study_sessions_mode_check;
alter table public.study_sessions drop column if exists mode, drop column if exists study_set_id;

drop table if exists public.document_chunks;
drop table if exists public.study_sets;

alter table public.documents drop constraint if exists documents_processing_stage_check;
alter table public.documents
  drop column if exists mime_type, drop column if exists size_bytes, drop column if exists char_count,
  drop column if exists chunk_count, drop column if exists processing_stage, drop column if exists error_message;
alter table public.documents drop constraint if exists documents_file_type_check;
alter table public.documents add constraint documents_file_type_check
  check (file_type = any (array['pdf'::text, 'docx'::text]));

commit;
