-- 0005_custom_cards.sql
-- Lets users write their own flashcards and questions (no document needed).
-- A "custom set" is a study set whose document_id is null.
begin;

alter table public.study_sets alter column document_id drop not null;
alter table public.flashcards alter column document_id drop not null;
alter table public.questions  alter column document_id drop not null;

-- questions had no owner column (ownership came from the document), so custom questions need one
alter table public.questions
  add column if not exists user_id uuid references public.profiles(id) on delete cascade;
update public.questions q
   set user_id = d.user_id
  from public.documents d
 where d.id = q.document_id and q.user_id is null;

-- questions: owned through the document (as before) OR directly through user_id when there is no document
drop policy if exists owner_access on public.questions;
drop policy if exists owner_guard on public.questions;
create policy owner_access on public.questions to authenticated
  using (
    (document_id is null and user_id = (select auth.uid()))
    or (document_id is not null
        and (user_id is null or user_id = (select auth.uid()))
        and exists (select 1 from public.documents d where d.id = questions.document_id and d.user_id = (select auth.uid())))
  )
  with check (
    (document_id is null and user_id = (select auth.uid()))
    or (document_id is not null
        and (user_id is null or user_id = (select auth.uid()))
        and exists (select 1 from public.documents d where d.id = questions.document_id and d.user_id = (select auth.uid())))
  );
create policy owner_guard on public.questions as restrictive to authenticated
  using (
    (document_id is null and user_id = (select auth.uid()))
    or (document_id is not null
        and (user_id is null or user_id = (select auth.uid()))
        and exists (select 1 from public.documents d where d.id = questions.document_id and d.user_id = (select auth.uid())))
  )
  with check (
    (document_id is null and user_id = (select auth.uid()))
    or (document_id is not null
        and (user_id is null or user_id = (select auth.uid()))
        and exists (select 1 from public.documents d where d.id = questions.document_id and d.user_id = (select auth.uid())))
  );

-- study_sets: a set may now have no document
drop policy if exists study_sets_insert_own on public.study_sets;
create policy study_sets_insert_own on public.study_sets for insert
  with check ((select auth.uid()) = user_id
    and (document_id is null
         or exists (select 1 from public.documents d where d.id = study_sets.document_id and d.user_id = (select auth.uid()))));

-- flashcards: the card's document must match its set's document (both null for custom sets)
drop policy if exists flashcards_insert_own on public.flashcards;
create policy flashcards_insert_own on public.flashcards for insert
  with check ((select auth.uid()) = user_id
    and exists (select 1 from public.study_sets s where s.id = flashcards.study_set_id
                  and s.user_id = (select auth.uid()) and s.document_id is not distinct from flashcards.document_id)
    and (chunk_id is null or exists (
          select 1 from public.document_chunks c where c.id = flashcards.chunk_id and c.document_id = flashcards.document_id))
    and (topic_id is null or exists (
          select 1 from public.topics t where t.id = flashcards.topic_id and t.user_id = (select auth.uid()))));

commit;