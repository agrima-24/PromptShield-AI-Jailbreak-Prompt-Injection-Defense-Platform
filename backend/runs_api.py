"""API router for managing evaluation run records in SQLite."""
import csv
import os
import re
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

ROOT = Path(__file__).resolve().parents[1]
DB_PATH = Path(__file__).resolve().parent / "data" / "promptshield.db"
RESULTS_DIR = ROOT / "results"
RESULT_NAME = re.compile(r"^(results|adaptive)_[0-9TZ]+\.csv$")

router = APIRouter()


def _init_db(con: sqlite3.Connection):
    con.execute("""
        CREATE TABLE IF NOT EXISTS runs (
            id               INTEGER PRIMARY KEY AUTOINCREMENT,
            run_id           TEXT NOT NULL UNIQUE,
            timestamp        TEXT NOT NULL,
            dataset_version  TEXT,
            model            TEXT,
            config           TEXT,
            total_attacks    INTEGER,
            asr_strict       REAL,
            asr_partial      REAL,
            fpr              REAL,
            latency_median   REAL,
            latency_p95      REAL,
            csv_path         TEXT,
            transcript_path  TEXT
        )
    """)
    con.commit()
    _sync_from_results(con)


def _sync_from_results(con: sqlite3.Connection):
    if not RESULTS_DIR.exists():
        return
    try:
        import sys
        if str(ROOT / "evaluation") not in sys.path:
            sys.path.insert(0, str(ROOT / "evaluation"))
        import metrics
    except Exception:
        metrics = None

    for p in sorted(RESULTS_DIR.glob("results_*.csv"), reverse=True):
        run_id = p.stem.split("_", 1)[1]
        existing = con.execute("SELECT id FROM runs WHERE run_id = ?", (run_id,)).fetchone()
        if existing:
            continue
        try:
            with open(p, newline="", encoding="utf-8") as f:
                rows = list(csv.DictReader(f))
            if not rows:
                continue
            dataset_version = rows[0].get("seeds_version", "168c834db898")
            total_attacks = sum(1 for r in rows if r.get("item_type") == "attack")
            
            asr_strict = 0.0
            fpr = 0.0
            latency_median = 0.0
            latency_p95 = 0.0
            
            if metrics:
                m = metrics.compute_metrics(rows)
                target_cfg = m.get("all") or (list(m.values())[0] if m else {})
                asr_strict = round(target_cfg.get("asr_strict", 0.0) / 100.0, 4)
                fpr = round(target_cfg.get("fpr", 0.0) / 100.0, 4)
                latency_median = target_cfg.get("defense_rt_median", 0.0)
                latency_p95 = target_cfg.get("defense_rt_p95", 0.0)

            transcript_file = RESULTS_DIR / f"transcripts_{run_id}.jsonl"
            t_path = str(transcript_file.relative_to(ROOT)) if transcript_file.exists() else None
            c_path = str(p.relative_to(ROOT))

            con.execute(
                """INSERT OR IGNORE INTO runs
                   (run_id, timestamp, dataset_version, model, config,
                    total_attacks, asr_strict, asr_partial, fpr,
                    latency_median, latency_p95, csv_path, transcript_path)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (run_id, f"2026-11-17T{run_id[9:11]}:{run_id[11:13]}:{run_id[13:15]}Z" if len(run_id) >= 15 else run_id,
                 dataset_version, "llama3.1:8b", "all", total_attacks,
                 asr_strict, asr_strict, fpr, latency_median, latency_p95,
                 c_path, t_path)
            )
            con.commit()
        except Exception as e:
            print(f"Error syncing {p}: {e}")


@contextmanager
def _get_con():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(str(DB_PATH))
    con.row_factory = sqlite3.Row
    _init_db(con)
    try:
        yield con
    finally:
        con.close()


def _row_to_dict(row: sqlite3.Row) -> dict:
    return dict(row)


class RunIn(BaseModel):
    run_id: str
    timestamp: str
    dataset_version: Optional[str] = None
    model: Optional[str] = None
    config: Optional[str] = None
    total_attacks: Optional[int] = None
    asr_strict: Optional[float] = None
    asr_partial: Optional[float] = None
    fpr: Optional[float] = None
    latency_median: Optional[float] = None
    latency_p95: Optional[float] = None
    csv_path: Optional[str] = None
    transcript_path: Optional[str] = None


@router.post("/api/runs", status_code=201)
def create_run(run: RunIn):
    with _get_con() as con:
        cur = con.execute(
            """INSERT INTO runs
               (run_id, timestamp, dataset_version, model, config,
                total_attacks, asr_strict, asr_partial, fpr,
                latency_median, latency_p95, csv_path, transcript_path)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (run.run_id, run.timestamp, run.dataset_version, run.model,
             run.config, run.total_attacks, run.asr_strict, run.asr_partial,
             run.fpr, run.latency_median, run.latency_p95,
             run.csv_path, run.transcript_path),
        )
        con.commit()
        row = con.execute("SELECT * FROM runs WHERE id=?", (cur.lastrowid,)).fetchone()
    return _row_to_dict(row)


@router.get("/api/runs")
def list_runs():
    with _get_con() as con:
        rows = con.execute("SELECT * FROM runs ORDER BY id DESC").fetchall()
    return {"runs": [_row_to_dict(r) for r in rows]}


@router.get("/api/runs/{run_id}")
def get_run(run_id: str):
    with _get_con() as con:
        if run_id.isdigit():
            row = con.execute("SELECT * FROM runs WHERE id=?", (int(run_id),)).fetchone()
        else:
            row = con.execute("SELECT * FROM runs WHERE run_id=?", (run_id,)).fetchone()
    if row is None:
        raise HTTPException(404, "run not found")
    return _row_to_dict(row)


@router.delete("/api/runs/{run_id}", status_code=204)
def delete_run(run_id: str):
    with _get_con() as con:
        if run_id.isdigit():
            con.execute("DELETE FROM runs WHERE id=?", (int(run_id),))
        else:
            con.execute("DELETE FROM runs WHERE run_id=?", (run_id,))
        con.commit()
