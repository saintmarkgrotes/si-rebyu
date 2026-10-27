import asyncio
from unittest.mock import AsyncMock

import pytest

import worker
from config import Settings
from services.db import DatabaseError
from services.errors import AIQuotaError, DocumentError
from tests.fake_db import FakeDB
from tests.helpers import make_pdf

SETTINGS = Settings(supabase_url="https://example.supabase.co",supabase_anon_key="anon",ai_api_key="test",ai_model="test")
JOB = {"id":"j1","lease_token":"lease","user_id":"u1","document_id":"d1","kind":"document","attempts":1}


def test_worker_rejects_storage_outside_the_job_owner():
    db=FakeDB({"documents":[{"id":"d1","user_id":"u1","storage_path":"u2/private.pdf"}]})
    with pytest.raises(DocumentError,match="does not belong"):
        asyncio.run(worker.execute_job(db,JOB,SETTINGS))


def test_worker_rechecks_document_ownership():
    db=FakeDB({"documents":[{"id":"d1","user_id":"u2","storage_path":"u2/private.pdf"}]})
    with pytest.raises(DocumentError,match="no longer exists"):
        asyncio.run(worker.execute_job(db,JOB,SETTINGS))


def test_document_results_are_published_in_one_fenced_rpc():
    db=FakeDB({"documents":[{"id":"d1","user_id":"u1","file_type":"pdf","storage_path":"u1/n.pdf"}]})
    db.download=AsyncMock(return_value=make_pdf([["A network switch forwards traffic between computers in a local area network. A router connects separate networks and chooses paths for packets."]]))
    db.rpc=AsyncMock(return_value=True)
    asyncio.run(worker.execute_job(db,JOB,SETTINGS))
    name,params=db.rpc.call_args.args
    assert name=="finish_document" and params["p_job"]=="j1" and params["p_lease"]=="lease"
    assert params["p_chunks"] and params["p_pages"]==1
    assert db.rows("document_chunks")==[]


def test_checkpoint_replay_skips_provider_call():
    db=FakeDB();db.rpc=AsyncMock(return_value={"response":"cached"})
    provider=AsyncMock()
    client=worker.CheckpointProvider(db,JOB,provider,"model")
    assert asyncio.run(client.generate_json("system","prompt"))=="cached"
    provider.generate_json.assert_not_awaited()


def test_new_provider_response_is_checkpointed_before_returning():
    db=FakeDB();db.rpc=AsyncMock(side_effect=[{"allowed":True},{"saved":True}])
    provider=AsyncMock();provider.generate_json.return_value='{"flashcards":[]}'
    result=asyncio.run(worker.CheckpointProvider(db,JOB,provider,"model").generate_json("s","p"))
    assert result=='{"flashcards":[]}'
    assert db.rpc.call_args.args[1]["p_response"]==result


def test_shared_budget_rejection_does_not_call_provider():
    db=FakeDB();db.rpc=AsyncMock(side_effect=DatabaseError("budget",429));provider=AsyncMock()
    with pytest.raises(AIQuotaError):
        asyncio.run(worker.CheckpointProvider(db,JOB,provider,"model").generate_json("s","p"))
    provider.generate_json.assert_not_awaited()


def test_database_interruption_leaves_lease_for_recovery(monkeypatch):
    db=FakeDB();db.rpc=AsyncMock(return_value=JOB)
    monkeypatch.setattr(worker,"run_claimed",AsyncMock(side_effect=DatabaseError("offline",503)))
    assert asyncio.run(worker.process_next(db,SETTINGS))
    db.rpc.assert_awaited_once_with("claim_job",{})


def test_bad_upload_is_marked_failed_with_current_lease(monkeypatch):
    db=FakeDB();db.rpc=AsyncMock(return_value=JOB)
    monkeypatch.setattr(worker,"run_claimed",AsyncMock(side_effect=DocumentError("Invalid PDF.")))
    asyncio.run(worker.process_next(db,SETTINGS))
    db.rpc.assert_awaited_with("fail_job",{"p_job":"j1","p_lease":"lease","p_message":"Invalid PDF."})


def test_lost_heartbeat_cancels_work(monkeypatch):
    async def scenario():
        cancelled=asyncio.Event()
        async def work(*args):
            try: await asyncio.Future()
            finally: cancelled.set()
        original_sleep=asyncio.sleep
        async def fast_sleep(_): await original_sleep(0)
        monkeypatch.setattr(worker,"execute_job",work)
        monkeypatch.setattr(worker.asyncio,"sleep",fast_sleep)
        db=FakeDB();db.rpc=AsyncMock(side_effect=DatabaseError("lease lost",409))
        with pytest.raises(DatabaseError): await worker.run_claimed(db,JOB,SETTINGS)
        assert cancelled.is_set()
    asyncio.run(scenario())
