begin;

-- Heartbeats contain no credentials, document text or user data.
create table public.worker_heartbeats (
  id uuid primary key,
  last_seen timestamptz not null default now()
);
alter table public.worker_heartbeats enable row level security;
revoke all on public.worker_heartbeats from public, anon, authenticated;
grant all on public.worker_heartbeats to service_role;
grant select on public.documents, public.document_chunks, public.study_sets to service_role;

create function public.worker_heartbeat(p_worker uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.worker_heartbeats(id,last_seen) values(p_worker,now())
    on conflict(id) do update set last_seen=now();
  delete from public.worker_heartbeats where last_seen<now()-interval '1 day';
  return true;
end $$;

create function public.deployment_status() returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise insufficient_privilege using message='Sign in to check readiness.'; end if;
  return jsonb_build_object(
    'schema_version',4,
    'worker_available',exists(select 1 from public.worker_heartbeats where last_seen>now()-interval '1 minute')
  );
end $$;

revoke all on function public.worker_heartbeat(uuid),public.deployment_status() from public,anon,authenticated;
grant execute on function public.worker_heartbeat(uuid) to service_role;
grant execute on function public.deployment_status() to authenticated;
commit;
