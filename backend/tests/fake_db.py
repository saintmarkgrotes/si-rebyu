"""An in-memory stand-in for services.db.UserDB, supporting the PostgREST filters the app uses."""
import copy
import uuid
from datetime import datetime, timezone

from services.db import DatabaseError

_DEFAULTS = {
    "study_sets": {"progress_done": 0, "progress_total": 0, "flashcard_count": 0, "question_count": 0, "warnings": []},
}


class FakeDB:
    def __init__(self, tables: dict | None = None, files: dict | None = None):
        self.tables = {name: [dict(r) for r in rows] for name, rows in (tables or {}).items()}
        self.files = dict(files or {})
        self.fail_on: dict[tuple[str, str], Exception] = {}  # (operation, table) -> error to raise

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return None

    def rows(self, table: str) -> list[dict]:
        return self.tables.setdefault(table, [])

    def _check(self, op: str, table: str) -> None:
        if (op, table) in self.fail_on:
            raise self.fail_on[(op, table)]

    @staticmethod
    def _match(row: dict, filters: dict | None) -> bool:
        for col, cond in (filters or {}).items():
            op, _, val = cond.partition(".")
            cur = row.get(col)
            if op == "eq":
                ok = str(cur) == val
            elif op == "neq":
                ok = str(cur) != val
            elif op == "is":
                ok = cur is None if val == "null" else False
            elif op == "in":
                ok = str(cur) in [v.strip('"') for v in val.strip("()").split(",")]
            elif op == "gt":
                ok = cur is not None and str(cur) > val
            elif op == "lt":
                ok = cur is not None and str(cur) < val
            else:
                raise AssertionError(f"FakeDB: unsupported filter {cond!r}")
            if not ok:
                return False
        return True

    async def select(self, table, filters=None, columns="*", order=None, limit=None):
        self._check("select", table)
        out = [copy.deepcopy(r) for r in self.rows(table) if self._match(r, filters)]
        if order:
            col, _, direction = order.partition(".")
            out.sort(key=lambda r: r[col], reverse=direction == "desc")
        if limit is not None:
            out = out[:limit]
        if columns != "*":
            keep = columns.split(",")
            out = [{k: r.get(k) for k in keep} for r in out]
        return out

    async def insert(self, table, rows, *, on_conflict=None, ignore_duplicates=False):
        self._check("insert", table)
        inserted = []
        for row in rows:
            row = copy.deepcopy(row)
            if table != "document_topics":
                row.setdefault("id", str(uuid.uuid4()))
            for key, value in copy.deepcopy(_DEFAULTS.get(table, {})).items():
                row.setdefault(key, value)
            if table == "study_sets":
                now = datetime.now(timezone.utc).isoformat()
                row.setdefault("created_at", now)
                row.setdefault("updated_at", now)
            if on_conflict:
                keys = on_conflict.split(",")
                if any(all(r.get(k) == row.get(k) for k in keys) for r in self.rows(table)):
                    if ignore_duplicates:
                        continue
                    raise AssertionError("FakeDB: unique violation")
            self.rows(table).append(row)
            inserted.append(copy.deepcopy(row))
        return inserted

    async def update(self, table, values, filters):
        self._check("update", table)
        if not filters:
            raise ValueError("update needs filters")
        out = []
        for r in self.rows(table):
            if self._match(r, filters):
                r.update(copy.deepcopy(values))
                out.append(copy.deepcopy(r))
        return out

    async def delete(self, table, filters):
        self._check("delete", table)
        if not filters:
            raise ValueError("delete needs filters")
        self.tables[table] = [r for r in self.rows(table) if not self._match(r, filters)]

    async def download(self, bucket, path):
        self._check("download", bucket)
        try:
            return self.files[(bucket, path)]
        except KeyError:
            raise DatabaseError("The uploaded file could not be found. Please upload it again.", 404)
