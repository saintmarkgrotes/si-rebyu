import { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
import { test } from 'node:test'

const u1 = '11111111-1111-1111-1111-111111111111'
const u2 = '22222222-2222-2222-2222-222222222222'
const d1 = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const d2 = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const options = {flashcards: 1, questions: 1, question_types: ['identification'], difficulty: 'mixed', topics: []}

async function setup() {
  const db = new PGlite()
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema storage;
    grant usage on schema public, auth, storage to authenticated, anon, service_role;
    alter default privileges in schema public grant all on tables to service_role;
    create table auth.users(id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb);
    alter table storage.objects enable row level security;
    grant all on storage.objects to authenticated,service_role;
    create function storage.foldername(text) returns text[] language sql immutable as $$ select string_to_array($1,'/') $$;
  `)
  for (const name of ['0000_base_schema.sql','0001_study_schema.sql','0002_durable_jobs.sql','0003_storage.sql']) {
    await db.exec(await readFile(new URL('../supabase/migrations/' + name, import.meta.url), 'utf8'))
  }
  await db.query('insert into auth.users(id,email) values($1,$2),($3,$4)', [u1,'one@example.test',u2,'two@example.test'])
  await db.query(`insert into public.documents(id,user_id,title,file_type,storage_path,status)
    values($1,$2,'Notes','pdf',$3,'ready'),($4,$5,'Other','pdf',$6,'ready')`, [d1,u1,u1+'/notes.pdf',d2,u2,u2+'/notes.pdf'])
  return db
}
async function asUser(db, uid, fn) {
  await db.exec('set role authenticated')
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [uid])
  try { return await fn() } finally { await db.exec('reset role') }
}
async function rpc(db, name, params = []) {
  const slots = params.map((_,i) => '$' + (i+1)).join(',')
  return (await db.query(`select public.${name}(${slots}) as result`, params)).rows[0].result
}
async function enqueue(db, request = 'cccccccc-cccc-cccc-cccc-cccccccccccc') {
  return asUser(db,u1,()=>rpc(db,'enqueue_generation',[d1,options,'Revision',2,request]))
}

test('fresh migrations, private rows, queue permissions, and idempotent enqueue', async () => {
  const db = await setup()
  try {
    assert.equal((await db.query('select count(*)::int as n from profiles')).rows[0].n,2)
    await asUser(db,u1,async()=>{
      assert.equal((await db.query('select id from documents')).rows.length,1)
      await assert.rejects(rpc(db,'enqueue_document',[d2]), /Document not found/)
      await assert.rejects(rpc(db,'claim_job'), /permission denied/)
      await assert.rejects(db.query("update documents set status='ready' where id=$1",[d1]), /permission denied/)
      await assert.rejects(db.query('insert into study_sets(user_id,document_id,title) values($1,$2,$3)',[u1,d1,'Bypass']), /permission denied/)
      await assert.rejects(db.query('select * from processing_jobs'), /permission denied/)
    })
    const first=await enqueue(db)
    assert.deepEqual(await enqueue(db),first)
    assert.equal((await db.query('select count(*)::int as n from processing_jobs')).rows[0].n,1)
    await asUser(db,u1,()=>assert.rejects(rpc(db,'enqueue_generation',[d1,options,'Different',2,'cccccccc-cccc-cccc-cccc-cccccccccccc']), /different generation options/))
    await enqueue(db,'dddddddd-dddd-dddd-dddd-dddddddddddd')
    await assert.rejects(enqueue(db,'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'), /already have study sets/)
    await asUser(db,u2,async()=>assert.equal((await db.query('select * from study_sets')).rows.length,0))
  } finally { await db.close() }
})

test('expired leases recover and fence the previous worker', async()=>{
  const db=await setup()
  try {
    await enqueue(db)
    const old=await rpc(db,'claim_job')
    assert.equal(await rpc(db,'claim_job'),null)
    await db.query("update processing_jobs set lease_until=now()-interval '1 second' where id=$1",[old.id])
    const next=await rpc(db,'claim_job')
    assert.equal(next.id,old.id); assert.notEqual(next.lease_token,old.lease_token)
    await assert.rejects(rpc(db,'heartbeat_job',[old.id,old.lease_token,null,null]), /lease lost/)
    assert.equal(await rpc(db,'heartbeat_job',[next.id,next.lease_token,1,2]),true)
    await db.exec("update processing_jobs set attempts=3,lease_until=now()-interval '1 second'")
    assert.equal(await rpc(db,'claim_job'),null)
    assert.equal((await db.query('select status from study_sets')).rows[0].status,'failed')
  } finally {await db.close()}
})

test('result publication rolls back partial saves, then commits all items together', async()=>{
  const db=await setup()
  try {
    await enqueue(db)
    const job=await rpc(db,'claim_job')
    const card={question:'Q?',answer:'A',topic:'Topic',difficulty:'easy',source:{},chunk_index:null}
    const question={question:'Q2?',correct_answer:'A',type:'identification',topic:'Topic',difficulty:'invalid',source:{},choices:null,chunk_index:null}
    const result={flashcards:[card],questions:[question],warnings:[]}
    await assert.rejects(rpc(db,'finish_generation',[job.id,job.lease_token,result]), /difficulty_check/)
    assert.equal((await db.query('select * from flashcards')).rows.length,0)
    assert.equal((await db.query('select status from study_sets')).rows[0].status,'generating')
    question.difficulty='medium'
    assert.equal(await rpc(db,'finish_generation',[job.id,job.lease_token,result]),true)
    assert.equal((await db.query('select * from flashcards')).rows.length,1)
    assert.equal((await db.query('select * from questions')).rows.length,1)
    assert.equal((await db.query('select status from study_sets')).rows[0].status,'ready')
    await assert.rejects(rpc(db,'finish_generation',[job.id,job.lease_token,result]), /lease lost/)
  } finally {await db.close()}
})

test('shared AI rate/budget limits and durable response checkpoints',async()=>{
  const db=await setup()
  try {
    await enqueue(db)
    const job=await rpc(db,'claim_job')
    assert.equal((await rpc(db,'job_ai_step',[job.id,job.lease_token,'a',null])).allowed,true)
    assert.ok((await rpc(db,'job_ai_step',[job.id,job.lease_token,'b',null])).wait>0)
    await rpc(db,'job_ai_step',[job.id,job.lease_token,'a','cached JSON'])
    assert.equal((await rpc(db,'job_ai_step',[job.id,job.lease_token,'a',null])).response,'cached JSON')
    assert.equal((await db.query('select requests from ai_usage')).rows[0].requests,1)
    await db.exec('update processing_limits set daily_ai_requests=1')
    await assert.rejects(rpc(db,'job_ai_step',[job.id,job.lease_token,'b',null]), /budget/)
    await db.exec("update ai_usage set day=(now() at time zone 'UTC')::date-1,next_request_at=now()-interval '1 second'")
    assert.equal((await rpc(db,'job_ai_step',[job.id,job.lease_token,'b',null])).allowed,true)
  } finally {await db.close()}
})

test('storage remains private, cannot overwrite, and enforces file quota',async()=>{
  const db=await setup()
  try {
    await db.exec('update processing_limits set max_files_per_user=1')
    await asUser(db,u1,async()=>{
      await assert.rejects(db.query("insert into storage.objects(bucket_id,name) values('documents',$1)",[u2+'/bad.pdf']), /row-level security/)
      await db.query("insert into storage.objects(bucket_id,name) values('documents',$1)",[u1+'/ok.pdf'])
      await assert.rejects(db.query("insert into storage.objects(bucket_id,name) values('documents',$1)",[u1+'/extra.pdf']), /file limit/)
      assert.equal((await db.query("update storage.objects set name=$1 returning id",[u1+'/changed.pdf'])).rows.length,0)
    })
    await asUser(db,u2,async()=>assert.equal((await db.query('select * from storage.objects')).rows.length,0))
  } finally {await db.close()}
})


test('deleting a study set cannot reset the daily generation quota',async()=>{
  const db=await setup()
  try {
    await db.exec('update processing_limits set daily_generations=1')
    const set=await enqueue(db)
    await asUser(db,u1,()=>db.query('delete from study_sets where id=$1',[set.study_set_id]))
    assert.equal((await db.query('select count(*)::int as n from processing_jobs')).rows[0].n,0)
    await assert.rejects(enqueue(db,'dddddddd-dddd-dddd-dddd-dddddddddddd'), /daily generation limit/)
  } finally {await db.close()}
})

test('document publication atomically writes chunks and completes its queue row',async()=>{
  const db=await setup()
  try {
    await db.query("update documents set status='processing' where id=$1",[d1])
    assert.equal((await asUser(db,u1,()=>rpc(db,'enqueue_document',[d1]))).started,true)
    assert.equal((await asUser(db,u1,()=>rpc(db,'enqueue_document',[d1]))).started,false)
    const job=await rpc(db,'claim_job')
    const chunks=[{index:0,text:'A useful source passage',sources:[{page:1}],heading:null}]
    assert.equal(await rpc(db,'finish_document',[job.id,job.lease_token,chunks,1,123,'application/pdf']),true)
    const doc=(await db.query('select * from documents where id=$1',[d1])).rows[0]
    assert.equal(doc.status,'ready');assert.equal(doc.chunk_count,1)
    await asUser(db,u2,async()=>assert.equal((await db.query('select * from document_chunks')).rows.length,0))
  } finally {await db.close()}
})
