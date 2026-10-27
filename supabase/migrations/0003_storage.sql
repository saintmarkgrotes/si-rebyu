begin;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('documents','documents',false,20971520,array[
 'application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
 'application/vnd.openxmlformats-officedocument.presentationml.presentation','application/octet-stream'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create policy documents_storage_read on storage.objects for select to authenticated
 using(bucket_id='documents' and (storage.foldername(name))[1]=auth.uid()::text);
create policy documents_storage_upload on storage.objects for insert to authenticated
 with check(bucket_id='documents' and (storage.foldername(name))[1]=auth.uid()::text);
create policy documents_storage_delete on storage.objects for delete to authenticated
 using(bucket_id='documents' and (storage.foldername(name))[1]=auth.uid()::text);
create policy documents_storage_guard on storage.objects as restrictive to authenticated
 using(bucket_id<>'documents' or (storage.foldername(name))[1]=auth.uid()::text)
 with check(bucket_id<>'documents' or (storage.foldername(name))[1]=auth.uid()::text);
-- Immutable uploads prevent an existing file being swapped while a job is processing it.
create policy documents_no_overwrite on storage.objects as restrictive for update to authenticated
 using(bucket_id<>'documents') with check(bucket_id<>'documents');
create function public.check_document_upload() returns trigger
language plpgsql security definer set search_path = '' as $$
declare max_files integer;
begin
  if new.bucket_id<>'documents' or auth.uid() is null then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,3));
  select max_files_per_user into max_files from public.processing_limits where id;
  if (select count(*) from storage.objects where bucket_id='documents' and (storage.foldername(name))[1]=auth.uid()::text)>=max_files then
    raise sqlstate 'PT429' using message='Your file limit has been reached. Delete an unused document before uploading another.';
  end if;
  return new;
end $$;
revoke all on function public.check_document_upload() from public;
create trigger si_rebyu_upload_quota before insert on storage.objects for each row execute function public.check_document_upload();
create policy document_path_guard on public.documents as restrictive for insert to authenticated
 with check(split_part(storage_path,'/',1)=auth.uid()::text and storage_path not like '%/../%');
commit;
