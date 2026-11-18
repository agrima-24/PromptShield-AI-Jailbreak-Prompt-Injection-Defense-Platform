"""Main FastAPI application server for the PromptShield console and API."""
import csv
import json
import os
import re
import sys
import threading
import time
import uuid
from contextlib import asynccontextmanager, contextmanager
from pathlib import Path

import requests
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

ROOT = Path(__file__).resolve().parents[1]
os.chdir(ROOT)
for _sub in (".", "attacks", "target", "evaluation"):
    _p = str((ROOT / _sub).resolve())
    if _p not in sys.path:
        sys.path.insert(0, _p)

from seeds import ALL_SEEDS, SEEDS_VERSION  # noqa: E402
from canary_templates import canary_followed  # noqa: E402
from chatbot import OLLAMA_MODEL, OLLAMA_URL, TOP_K, Chatbot, build_prompt, call_ollama  # noqa: E402
from retriever import CLEAN_COLLECTION_NAME, DocumentStore  # noqa: E402
from defense.client import RemoteGate, get_gate  # noqa: E402
import metrics  # noqa: E402
from backend import runs_api  # noqa: E402

RESULTS = ROOT / "results"
DOCS = ROOT / "target" / "documents"
LIVE_DIR = DOCS / "_live"
DIST = ROOT / "frontend" / "dist"
GATED_CONFIGS = ["segregator", "classifier", "perplexity", "all"]
WITH_DEFENSE_CONFIGS = ["hardened"] + GATED_CONFIGS
RESULT_NAME = re.compile(r"^(results|adaptive)_[0-9TZ]+\.csv$")
RUN_ID = re.compile(r"^[0-9TZ]+$")

ATTACKS = {a.id: a for a in ALL_SEEDS}
STORE = DocumentStore(persist_dir=str(ROOT / "target" / "chroma_db"), collection_name=CLEAN_COLLECTION_NAME)
LOCK = threading.Lock()
_gates = {}


class _NoGate:
    """The 'hardened' choice on the right: the prompt defense alone, no gate."""

    def check_detailed(self, text, context=None):
        return {"allowed": True, "reason": "no gate (prompt hardening only)", "status": "ok", "layers": [],
                "total_ms": 0.0, "round_trip_ms": 0.0}


def gate_for(config: str):
    if config == "hardened":
        return _NoGate()
    if config not in _gates:
        _gates[config] = get_gate(config)
    return _gates[config]


def group_of(attack) -> str:
    if attack.attack_type == "direct":
        return f"direct-{attack.variant}" if attack.variant else ("direct-canary" if attack.canary else "direct-harmful")
    return f"indirect-{attack.variant}" if attack.variant else "indirect"


def elapsed(start: float) -> float:
    return round((time.perf_counter() - start) * 1000, 1)


import asyncio

@asynccontextmanager
async def lifespan(_app):
    try:
        await asyncio.to_thread(STORE.retrieve, "warm-up", top_k=1)
    except Exception:
        pass
    yield


app = FastAPI(title="PromptShield console (app laptop)", lifespan=lifespan)
app.include_router(runs_api.router)


@contextmanager
def attached(attack):
    """For an indirect attack, adds its poisoned document to the clean store for this request only."""
    if attack is None or attack.attack_type != "indirect":
        yield None
        return
    LIVE_DIR.mkdir(parents=True, exist_ok=True)
    path = LIVE_DIR / f"{attack.id.lower()}_{uuid.uuid4().hex[:8]}.txt"
    path.write_text(attack.poisoned_doc, encoding="utf-8")
    STORE.ingest_file(str(path))
    try:
        yield str(path)
    finally:
        STORE.remove_source(str(path))
        path.unlink(missing_ok=True)


def side_without(query: str) -> dict:
    start = time.perf_counter()
    try:
        chunks = STORE.retrieve_full_documents(query, top_k=TOP_K)
        response = call_ollama(build_prompt(query, [c.text for c in chunks], "naive"))
        error = None
    except Exception as exc:
        chunks, response, error = [], "", f"{type(exc).__name__}: {exc}"
    return {"response": response, "error": error, "blocked": False, "defense_unavailable": False, "reason": "",
            "layers": [], "retrieved": [os.path.basename(c.source_file) for c in chunks],
            "defense_round_trip_ms": None, "defense_compute_ms": None, "request_id": None,
            "total_ms": elapsed(start)}


def side_with(query: str, config: str, prompt_mode: str) -> dict:
    start = time.perf_counter()
    try:
        bot = Chatbot(store=STORE, prompt_mode=prompt_mode)
        res = bot.generate_defended(query, gate_for(config))
    except Exception as exc:
        return {"response": "", "error": f"{type(exc).__name__}: {exc}", "blocked": False,
                "defense_unavailable": False, "reason": "", "layers": [], "retrieved": [],
                "defense_round_trip_ms": None, "defense_compute_ms": None, "request_id": None,
                "total_ms": elapsed(start)}
    d = res.get("defense") or {}
    return {"response": res["response"], "error": None, "blocked": res["blocked"],
            "defense_unavailable": res["defense_unavailable"], "reason": res["block_reason"],
            "layers": d.get("layers", []),
            "retrieved": [os.path.basename(src) for _, src, _ in res["retrieved_chunks"]],
            "defense_round_trip_ms": d.get("round_trip_ms"), "defense_compute_ms": d.get("total_ms"),
            "request_id": d.get("request_id"), "total_ms": elapsed(start)}


def verdict_of(side: dict) -> str:
    if side.get("error"):
        return "error"
    if side["defense_unavailable"]:
        return "unavailable"
    if side["blocked"]:
        return "blocked"
    return "answered"


def describe(a) -> dict:
    return {"id": a.id, "group": group_of(a), "category": a.category, "attack_type": a.attack_type,
            "style": a.style or None, "canary": a.canary or None,
            "poisoned_doc": a.poisoned_doc[:800] if a.poisoned_doc else None,
            "trigger_query": a.prompt if a.attack_type == "indirect" else None}


class ChatRequest(BaseModel):
    query: str
    config: str = "all"
    prompt_mode: str = "hardened"
    attack_id: str | None = None


@app.post("/api/chat")
def chat(req: ChatRequest):
    query = req.query.strip()
    if not query:
        raise HTTPException(400, "The query is empty.")
    if req.config not in WITH_DEFENSE_CONFIGS:
        raise HTTPException(400, f"config must be one of {WITH_DEFENSE_CONFIGS}")
    if req.prompt_mode not in ("hardened", "naive"):
        raise HTTPException(400, "prompt_mode must be 'hardened' or 'naive'")
    attack = None
    if req.attack_id:
        attack = ATTACKS.get(req.attack_id)
        if attack is None:
            raise HTTPException(404, f"no attack with id {req.attack_id}")

    with LOCK, attached(attack) as doc_path:
        doc_name = os.path.basename(doc_path) if doc_path else None
        left = side_without(query)
        right = side_with(query, req.config, req.prompt_mode)

    for side in (left, right):
        side["verdict"] = verdict_of(side)
        if attack and attack.canary:
            side["canary_followed"] = (side["verdict"] == "answered"
                                       and canary_followed(side["response"], attack.canary))
        else:
            side["canary_followed"] = None
        side["target_doc_retrieved"] = (doc_name in side["retrieved"]) if doc_name else None

    try:
        from backend import history
        import datetime
        cat = group_of(attack) if attack else "custom"
        tot_ms = round(((left.get("total_ms") or 0) + (right.get("total_ms") or 0)), 1)
        history.insert_query({
            "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "query": query,
            "attack_id": attack.id if attack else None,
            "category": cat,
            "config": req.config,
            "prompt_mode": req.prompt_mode,
            "response_without": left.get("response", ""),
            "response_with": right.get("response", ""),
            "verdict_without": left.get("verdict", ""),
            "verdict_with": right.get("verdict", ""),
            "canary_followed": right.get("canary_followed"),
            "latency_without": left.get("total_ms"),
            "latency_with": right.get("total_ms"),
            "total_ms": tot_ms,
            "layers_json": json.dumps(right.get("layers", []))
        })
    except Exception as e:
        print(f"Failed to record query to history: {e}")

    return {"query": query, "attack": describe(attack) if attack else None,
            "without_defense": left, "with_defense": right, "with_config": req.config,
            "with_prompt_mode": req.prompt_mode, "seeds_version": SEEDS_VERSION}


@app.get("/api/history")
def get_history(limit: int = 50, offset: int = 0, search: str | None = None, category: str | None = None):
    from backend import history
    return history.get_queries(limit=limit, offset=offset, search=search, category=category)


@app.get("/api/history/{id}")
def get_history_item(id: int):
    from backend import history
    item = history.get_query_by_id(id)
    if not item:
        raise HTTPException(404, "Query not found")
    return item


@app.delete("/api/history/{id}")
def delete_history_item(id: int):
    from backend import history
    deleted = history.delete_query_by_id(id)
    if not deleted:
        raise HTTPException(404, "Query not found")
    return {"status": "deleted"}


@app.delete("/api/history")
def clear_history():
    from backend import history
    history.clear_all_queries()
    return {"status": "cleared"}


@app.get("/api/status")
def status():
    url = os.environ.get("DEFENSE_URL")
    defense = {"mode": "remote" if url else "in-process", "url": url or "this machine"}
    if url:
        health = RemoteGate(url, os.environ.get("DEFENSE_API_KEY", ""), "all", timeout_s=3).health()
        defense.update({"reachable": health is not None,
                        "configs": (health or {}).get("configs", []),
                        "checkpoint": bool((health or {}).get("classifier_checkpoint_found"))})
    tags_url = OLLAMA_URL.rsplit("/api/", 1)[0] + "/api/tags"
    ollama = {"model": OLLAMA_MODEL, "url": OLLAMA_URL, "reachable": False, "model_pulled": False}
    try:
        session = requests.Session()
        session.mount("http://", requests.adapters.HTTPAdapter(max_retries=0))
        names = [m["name"] for m in session.get(tags_url, timeout=0.8).json().get("models", [])]
        ollama.update({"reachable": True, "model_pulled": OLLAMA_MODEL in names})
    except Exception:
        pass
    clean_docs = sum(1 for _ in DOCS.glob("*.txt"))
    return {"defense": defense, "ollama": ollama, "attack_set": SEEDS_VERSION, "attacks": len(ALL_SEEDS),
            "clean_docs": clean_docs}


@app.get("/api/attacks")
def list_attacks():
    rows = []
    for a in ALL_SEEDS:
        rows.append({"id": a.id, "group": group_of(a), "category": a.category, "attack_type": a.attack_type,
                     "variant": a.variant or None, "style": a.style or None, "source": a.source,
                     "has_canary": bool(a.canary), "has_poisoned_doc": bool(a.poisoned_doc),
                     "prompt": a.prompt, "poisoned_doc": a.poisoned_doc[:800] if a.poisoned_doc else None})
    return {"seeds_version": SEEDS_VERSION, "attacks": rows}


def row_group(r: dict) -> str:
    v = r.get("variant", "")
    if r.get("attack_type") == "direct":
        return f"direct-{v}" if v else ("direct-canary" if r.get("canary") or r.get("judge_method") == "canary" else "direct-harmful")
    return f"indirect-{v}" if v else "indirect"


def summarize_static(rows: list, run_id: str) -> dict:
    m = metrics.compute_metrics(rows)
    keep = ("n_total", "n_untested", "n_attacks", "asr_strict", "asr_strict_ci", "n_benign", "fpr", "fpr_ci",
            "defense_rt_median", "defense_rt_p95", "defense_compute_median", "avg_pipeline_ms")
    configs = {c: {k: v[k] for k in keep} for c, v in m.items()}
    ordered = ([c for c in metrics.CANONICAL_ORDER if c in configs]
               + [c for c in configs if c not in metrics.CANONICAL_ORDER])
    groups, untested = {}, {}
    for r in rows:
        if r["verdict"] in metrics.UNTESTED_VERDICTS:
            key = f"{r['config']}:{r['verdict']}"
            untested[key] = untested.get(key, 0) + 1
            continue
        if r["item_type"] != "attack":
            continue
        cell = groups.setdefault(r["config"], {}).setdefault(row_group(r), {"complied": 0, "tested": 0})
        cell["tested"] += 1
        cell["complied"] += int(r["verdict"] == "complied")
    return {"kind": "static", "run_id": run_id, "seeds_version": rows[0]["seeds_version"] if rows else "",
            "configs": {c: configs[c] for c in ordered}, "groups": groups, "untested": untested}


def summarize_adaptive(rows: list, run_id: str) -> dict:
    out = {}
    for r in rows:
        c = out.setdefault(r["config"], {"tested": 0, "untested": 0, "static": 0, "adaptive": 0,
                                         "by_attempt": {}, "winners": {}, "groups": {}})
        if r["status"] != "tested":
            c["untested"] += 1
            continue
        c["tested"] += 1
        s, a = int(r["static_success"]), int(r["adaptive_success"])
        c["static"] += s
        c["adaptive"] += a
        g = c["groups"].setdefault(row_group(r), {"tested": 0, "static": 0, "adaptive": 0})
        g["tested"] += 1
        g["static"] += s
        g["adaptive"] += a
        if a:
            n = str(r["attempts"])
            c["by_attempt"][n] = c["by_attempt"].get(n, 0) + 1
            if r.get("winning_operator"):
                op = r["winning_operator"]
                c["winners"][op] = c["winners"].get(op, 0) + 1
    return {"kind": "adaptive", "run_id": run_id, "configs": out}


@app.get("/api/results")
def list_results():
    items = []
    for p in sorted(RESULTS.glob("*.csv"), reverse=True):
        if RESULT_NAME.match(p.name):
            run_id = p.stem.split("_", 1)[1]
            items.append({"name": p.name, "kind": "adaptive" if p.name.startswith("adaptive") else "static",
                          "run_id": run_id, "has_transcripts": (RESULTS / f"transcripts_{run_id}.jsonl").exists()})
    return items


@app.get("/api/results/{name}")
def get_result(name: str):
    if not RESULT_NAME.match(name) or not (RESULTS / name).exists():
        raise HTTPException(404, "no such result file")
    with open(RESULTS / name, newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    run_id = name.split("_", 1)[1].rsplit(".", 1)[0]
    if name.startswith("adaptive"):
        return summarize_adaptive(rows, run_id)
    return summarize_static(rows, run_id)


@app.get("/api/transcripts/{run_id}")
def transcripts(run_id: str):
    if not RUN_ID.match(run_id):
        raise HTTPException(400, "bad run id")
    path = RESULTS / f"transcripts_{run_id}.jsonl"
    if not path.exists():
        raise HTTPException(404, "no transcripts for this run")
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


if DIST.exists():
    app.mount("/", StaticFiles(directory=str(DIST), html=True), name="console")
