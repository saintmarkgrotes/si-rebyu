-- Durable work, atomic publication, and shared usage limits.
-- Apply after 0000 and 0001. No access tokens are stored in the queue.
begin;
create table public.processing_limits (
  id boolean primary key default true check(id),
  daily_generations integer not null default 10 check(daily_generations > 0),
  active_generations integer not null default 2 check(active_generations > 0),
  daily_ai_requests integer not null default 1000 check(daily_ai_requests > 0),
  ai_requests_per_minute integer not null default 12 check(ai_requests_per_minute > 0),
  max_files_per_user integer not null default 100 check(max_files_per_user > 0)
);
insert into public.processing_limits(id) values(true);
create table public.processing_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  study_set_id uuid references public.study_sets(id) on delete cascade,
  kind text not null check(kind in ('document','generation')),
  request_id uuid not null default gen_random_uuid(),
  options jsonb not null default '{}', title text,
  status text not null default 'queued' check(status in ('queued','running','completed','failed')),
  attempts integer not null default 0, ai_requests integer not null default 0,
  lease_token uuid, lease_until timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(user_id,request_id)
);
create index processing_jobs_claim_idx on public.processing_jobs(status,created_at);
create index processing_jobs_user_idx on public.processing_jobs(user_id,created_at);
create unique index processing_jobs_document_active_idx on public.processing_jobs(document_id)
where kind='document' and status in ('queued','running');
-- Quota history must survive deletion of a study set or document.
create table public.generation_usage (
  user_id uuid references public.profiles(id) on delete cascade,
  day date not null, generations integer not null default 0,
  primary key(user_id,day)
);
alter table public.generation_usage enable row level security;
revoke all on public.generation_usage from anon,authenticated;
grant all on public.generation_usage to service_role;
create table public.job_ai_responses (
  job_id uuid references public.processing_jobs(id) on delete cascade,
  request_hash text not null, response text not null, primary key(job_id,request_hash)
);
create table public.ai_usage (
  id boolean primary key default true check(id),
  day date not null default (now() at time zone 'UTC')::date,
  requests integer not null default 0, next_request_at timestamptz not null default now()
);
insert into public.ai_usage(id) values(true);
alter table public.processing_jobs enable row level security;
alter table public.processing_limits enable row level security;
alter table public.job_ai_responses enable row level security;
alter table public.ai_usage enable row level security;
revoke all on public.processing_jobs, public.processing_limits, public.job_ai_responses, public.ai_usage from anon,authenticated;
grant all on public.processing_jobs, public.processing_limits, public.job_ai_responses, public.ai_usage to service_role;

-- Persist the job and its visible status in the same transaction.
create function public.enqueue_document(p_document uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare d public.documents; j public.processing_jobs;
begin
  select * into d from public.documents where id=p_document and user_id=auth.uid() for update;
  if not found then raise sqlstate 'PT404' using message='Document not found.'; end if;
  if d.status='ready' then return jsonb_build_object('started',false,'status','ready'); end if;
  select * into j from public.processing_jobs where document_id=d.id and kind='document' and status in ('queued','running');
  if found then return jsonb_build_object('started',false,'status','processing'); end if;
  if (select count(*) from public.processing_jobs where document_id=d.id and kind='document'
      and created_at >= date_trunc('day',now() at time zone 'UTC') at time zone 'UTC') >= 5 then
    raise sqlstate 'PT429' using message='This document has reached its daily processing limit. Try again tomorrow.';
  end if;
  insert into public.processing_jobs(user_id,document_id,kind) values(auth.uid(),d.id,'document');
  update public.documents set status='processing',processing_stage='extracting',error_message=null,updated_at=now() where id=d.id;
  return jsonb_build_object('started',true,'status','processing');
end $$;

create function public.enqueue_generation(p_document uuid,p_options jsonb,p_title text,p_planned integer,p_request uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare d public.documents; j public.processing_jobs; s public.study_sets; lim public.processing_limits;
        cards integer; questions integer;
begin
  if auth.uid() is null then raise sqlstate 'PT404' using message='Document not found.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 1));
  select * into j from public.processing_jobs where user_id=auth.uid() and request_id=p_request;
  if found then
    if j.document_id<>p_document or j.options<>p_options or j.title is distinct from p_title or j.kind<>'generation' then
      raise sqlstate 'PT409' using message='This request was already used for different generation options.';
    end if;
    select * into s from public.study_sets where id=j.study_set_id;
    return jsonb_build_object('study_set_id',s.id,'planned_requests',s.progress_total);
  end if;
  select * into d from public.documents where id=p_document and user_id=auth.uid() for update;
  if not found then raise sqlstate 'PT404' using message='Document not found.'; end if;
  if d.status<>'ready' then raise sqlstate 'PT409' using message='This document is not ready to generate yet.'; end if;
  cards := (p_options->>'flashcards')::integer;
  questions := (p_options->>'questions')::integer;
  if cards is null or questions is null or cards not between 0 and 50 or questions not between 0 and 50
      or cards+questions=0 or p_planned is null or p_planned not between 1 and 60
      or p_options->>'difficulty' is null or p_options->>'difficulty' not in ('easy','medium','hard','mixed')
      or jsonb_typeof(p_options->'question_types') is distinct from 'array'
      or jsonb_typeof(p_options->'topics') is distinct from 'array' then
    raise sqlstate 'PT400' using message='Invalid generation options.';
  end if;
  if jsonb_array_length(p_options->'topics')>30 or (questions>0 and jsonb_array_length(p_options->'question_types')=0)
      or exists(select 1 from jsonb_array_elements_text(p_options->'question_types') x where x not in
        ('multiple_choice','true_false','identification','short_answer','scenario')) then
    raise sqlstate 'PT400' using message='Invalid generation options.';
  end if;
  select * into lim from public.processing_limits where id;
  if (select count(*) from public.processing_jobs where user_id=auth.uid() and kind='generation' and status in ('queued','running')) >= lim.active_generations then
    raise sqlstate 'PT429' using message='You already have study sets being generated. Wait for them to finish first.';
  end if;
  if coalesce((select generations from public.generation_usage where user_id=auth.uid()
       and day=(now() at time zone 'UTC')::date),0) >= lim.daily_generations then
    raise sqlstate 'PT429' using message='Your daily generation limit has been reached. Try again tomorrow.';
  end if;
  insert into public.generation_usage(user_id,day,generations) values(auth.uid(),(now() at time zone 'UTC')::date,1)
    on conflict(user_id,day) do update set generations=public.generation_usage.generations+1;
  insert into public.study_sets(user_id,document_id,title,settings,stage,progress_total)
    values(auth.uid(),d.id,left(coalesce(nullif(trim(p_title),''),d.title),120),p_options,'analyzing',p_planned) returning * into s;
  insert into public.processing_jobs(user_id,document_id,study_set_id,kind,request_id,options,title)
    values(auth.uid(),d.id,s.id,'generation',p_request,p_options,p_title);
  return jsonb_build_object('study_set_id',s.id,'planned_requests',p_planned);
end $$;
revoke all on function public.enqueue_document(uuid), public.enqueue_generation(uuid,jsonb,text,integer,uuid) from public,anon;
grant execute on function public.enqueue_document(uuid), public.enqueue_generation(uuid,jsonb,text,integer,uuid) to authenticated;

-- Every worker mutation checks an expiring, random lease. A stale worker cannot publish.
create function public.lock_job(p_job uuid,p_lease uuid) returns public.processing_jobs
language plpgsql security definer set search_path = '' as $$
declare j public.processing_jobs;
begin
  select * into j from public.processing_jobs where id=p_job and lease_token=p_lease
    and status='running' and lease_until>now() for update;
  if not found then raise sqlstate 'PT409' using message='Job lease lost.'; end if;
  return j;
end $$;
create function public.claim_job() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare j public.processing_jobs;
begin
  for j in select * from public.processing_jobs where status='running' and lease_until<=now() and attempts>=3 for update skip locked loop
    update public.processing_jobs set status='failed',updated_at=now() where id=j.id;
    if j.kind='document' then
      update public.documents set status='failed',processing_stage=null,error_message='Processing was interrupted repeatedly. Please retry.',updated_at=now() where id=j.document_id;
    else
      update public.study_sets set status='failed',stage=null,error_message='Generation was interrupted repeatedly. Please generate again.',updated_at=now() where id=j.study_set_id;
    end if;
  end loop;
  select * into j from public.processing_jobs where status='queued' or (status='running' and lease_until<=now() and attempts<3)
    order by created_at for update skip locked limit 1;
  if not found then return null; end if;
  update public.processing_jobs set status='running',attempts=attempts+1,lease_token=gen_random_uuid(),
    lease_until=now()+interval '2 minutes',updated_at=now() where id=j.id returning * into j;
  return to_jsonb(j);
end $$;
create function public.heartbeat_job(p_job uuid,p_lease uuid,p_done integer default null,p_total integer default null)
returns boolean language plpgsql security definer set search_path = '' as $$
declare j public.processing_jobs;
begin
  j := public.lock_job(p_job,p_lease);
  update public.processing_jobs set lease_until=now()+interval '2 minutes',updated_at=now() where id=j.id;
  if j.kind='document' then
    update public.documents set updated_at=now() where id=j.document_id;
  else
    update public.study_sets set updated_at=now(),stage='generating',
      progress_done=coalesce(p_done,progress_done),progress_total=coalesce(p_total,progress_total) where id=j.study_set_id;
  end if;
  return true;
end $$;
create function public.fail_job(p_job uuid,p_lease uuid,p_message text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare j public.processing_jobs;
begin
  j := public.lock_job(p_job,p_lease);
  update public.processing_jobs set status='failed',updated_at=now(),lease_until=null where id=j.id;
  if j.kind='document' then
    update public.documents set status='failed',processing_stage=null,error_message=left(p_message,500),updated_at=now() where id=j.document_id;
  else
    update public.study_sets set status='failed',stage=null,error_message=left(p_message,500),updated_at=now() where id=j.study_set_id;
  end if;
  return true;
end $$;

create function public.job_ai_step(p_job uuid,p_lease uuid,p_hash text,p_response text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare j public.processing_jobs; cached text; usage public.ai_usage; lim public.processing_limits;
begin
  j := public.lock_job(p_job,p_lease);
  if p_response is not null then
    insert into public.job_ai_responses values(j.id,p_hash,p_response) on conflict(job_id,request_hash) do nothing;
    return jsonb_build_object('saved',true);
  end if;
  select response into cached from public.job_ai_responses where job_id=j.id and request_hash=p_hash;
  if found then return jsonb_build_object('response',cached); end if;
  select * into lim from public.processing_limits where id;
  select * into usage from public.ai_usage where id for update;
  if usage.day<>(now() at time zone 'UTC')::date then usage.requests:=0; end if;
  if usage.requests>=lim.daily_ai_requests or j.ai_requests>=240 then
    raise sqlstate 'PT429' using message='The AI request budget has been reached. Please try again tomorrow.';
  end if;
  if usage.next_request_at>now() then
    return jsonb_build_object('wait',extract(epoch from usage.next_request_at-now()));
  end if;
  update public.ai_usage set day=(now() at time zone 'UTC')::date,requests=usage.requests+1,
    next_request_at=now()+make_interval(secs=>60.0/lim.ai_requests_per_minute) where id;
  update public.processing_jobs set ai_requests=ai_requests+1 where id=j.id;
  return jsonb_build_object('allowed',true);
end $$;

create function public.finish_document(p_job uuid,p_lease uuid,p_chunks jsonb,p_pages integer,p_size bigint,p_mime text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare j public.processing_jobs;
begin
  j := public.lock_job(p_job,p_lease);
  if j.kind<>'document' or jsonb_array_length(p_chunks)=0 then raise exception 'Invalid document results'; end if;
  perform 1 from public.documents where id=j.document_id and user_id=j.user_id for update;
  if not found then raise exception 'Document ownership changed'; end if;
  delete from public.document_chunks where document_id=j.document_id;
  insert into public.document_chunks(document_id,chunk_index,text,sources,heading,char_count)
    select j.document_id,(c->>'index')::integer,c->>'text',c->'sources',c->>'heading',length(c->>'text')
    from jsonb_array_elements(p_chunks) c;
  update public.documents set status='ready',processing_stage=null,error_message=null,page_count=p_pages,size_bytes=p_size,
    mime_type=p_mime,chunk_count=jsonb_array_length(p_chunks),char_count=(select sum(length(c->>'text')) from jsonb_array_elements(p_chunks) c),
    updated_at=now() where id=j.document_id;
  update public.processing_jobs set status='completed',lease_until=null,updated_at=now() where id=j.id;
  return true;
end $$;

create function public.finish_generation(p_job uuid,p_lease uuid,p_result jsonb) returns boolean
language plpgsql security definer set search_path = '' as $$
declare j public.processing_jobs; item jsonb; topic_id uuid; chunk_id uuid; is_card boolean;
begin
  j := public.lock_job(p_job,p_lease);
  if j.kind<>'generation' then raise exception 'Invalid job kind'; end if;
  perform 1 from public.study_sets s join public.documents d on d.id=s.document_id
    where s.id=j.study_set_id and s.user_id=j.user_id and d.user_id=j.user_id and d.id=j.document_id for update of s;
  if not found then raise exception 'Study set ownership changed'; end if;
  -- Serialize topic creation per user, avoiding case-variant duplicates.
  perform pg_advisory_xact_lock(hashtextextended(j.user_id::text, 2));
  delete from public.flashcards where study_set_id=j.study_set_id;
  delete from public.questions where study_set_id=j.study_set_id;
  foreach is_card in array array[true,false] loop
    for item in select value from jsonb_array_elements(p_result->(case when is_card then 'flashcards' else 'questions' end)) loop
      select id into topic_id from public.topics where user_id=j.user_id and lower(name)=lower(item->>'topic') limit 1;
      if topic_id is null then
        insert into public.topics(user_id,name) values(j.user_id,item->>'topic') returning id into topic_id;
      end if;
      select id into chunk_id from public.document_chunks where document_id=j.document_id and chunk_index=(item->>'chunk_index')::integer;
      if is_card then
        insert into public.flashcards(user_id,study_set_id,document_id,chunk_id,topic_id,front,back,difficulty,source)
          values(j.user_id,j.study_set_id,j.document_id,chunk_id,topic_id,item->>'question',item->>'answer',item->>'difficulty',item->'source');
      else
        insert into public.questions(study_set_id,document_id,chunk_id,topic_id,question_text,question_type,options,correct_answer,explanation,difficulty,source)
          values(j.study_set_id,j.document_id,chunk_id,topic_id,item->>'question',item->>'type',nullif(item->'choices','null'::jsonb),
            item->>'correct_answer',nullif(item->>'explanation',''),item->>'difficulty',item->'source');
      end if;
      insert into public.document_topics(document_id,topic_id) values(j.document_id,topic_id) on conflict do nothing;
    end loop;
  end loop;
  update public.study_sets set status='ready',stage=null,error_message=null,warnings=coalesce(p_result->'warnings','[]'),
    flashcard_count=jsonb_array_length(p_result->'flashcards'),question_count=jsonb_array_length(p_result->'questions'),
    progress_done=progress_total,updated_at=now() where id=j.study_set_id;
  update public.processing_jobs set status='completed',lease_until=null,updated_at=now() where id=j.id;
  -- Prompts are not persisted; discard cached model replies after successful publication.
  delete from public.job_ai_responses where job_id=j.id;
  return true;
end $$;

-- Lock down worker functions: PostgreSQL grants EXECUTE to PUBLIC by default.
revoke all on function public.lock_job(uuid,uuid),public.claim_job(),public.heartbeat_job(uuid,uuid,integer,integer),
 public.fail_job(uuid,uuid,text),public.job_ai_step(uuid,uuid,text,text),public.finish_document(uuid,uuid,jsonb,integer,bigint,text),
 public.finish_generation(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.lock_job(uuid,uuid),public.claim_job(),public.heartbeat_job(uuid,uuid,integer,integer),
 public.fail_job(uuid,uuid,text),public.job_ai_step(uuid,uuid,text,text),public.finish_document(uuid,uuid,jsonb,integer,bigint,text),
 public.finish_generation(uuid,uuid,jsonb) to service_role;

-- Browser clients cannot forge worker state or re-parent records to another user.
revoke insert,delete on public.profiles from authenticated;
revoke insert,update on public.study_sets,public.document_chunks,public.questions,public.topics,public.document_topics from authenticated;
revoke update on public.documents,public.profiles,public.study_sessions,public.flashcards from authenticated;
grant update(title) on public.documents to authenticated;
grant update(full_name) on public.profiles to authenticated;
grant update(ended_at) on public.study_sessions to authenticated;
grant update(due_at,interval_days,ease,repetitions,lapses,times_reviewed,times_correct,last_reviewed_at) on public.flashcards to authenticated;
revoke insert on public.documents,public.flashcards from authenticated;
grant insert(user_id,title,file_type,storage_path) on public.documents to authenticated;

-- Restrictive guards cover legacy permissive policies as well.
create policy study_sets_owner_guard on public.study_sets as restrictive to authenticated
  using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy flashcards_owner_guard on public.flashcards as restrictive to authenticated
  using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy chunks_owner_guard on public.document_chunks as restrictive to authenticated
  using(exists(select 1 from public.documents d where d.id=document_id and d.user_id=auth.uid()));
create policy reviews_owner_guard on public.flashcard_reviews as restrictive to authenticated
  using(user_id=auth.uid()) with check(user_id=auth.uid() and
    (session_id is null or exists(select 1 from public.study_sessions s where s.id=session_id and s.user_id=auth.uid())) and
    exists(select 1 from public.flashcards f where f.id=flashcard_id and f.user_id=auth.uid()));
create policy flags_owner_guard on public.question_flags as restrictive to authenticated
  using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy sessions_parent_guard on public.study_sessions as restrictive to authenticated
  using(user_id=auth.uid()) with check(user_id=auth.uid() and
    (document_id is null or exists(select 1 from public.documents d where d.id=document_id and d.user_id=auth.uid())) and
    (study_set_id is null or exists(select 1 from public.study_sets s where s.id=study_set_id and s.user_id=auth.uid())));
commit;
