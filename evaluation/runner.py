"""Evaluation runner benchmarking attack success, false positive rates, and latency."""
import csv
import json
import os
import sys
import time
from datetime import datetime, timezone

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
sys.path.insert(0, ROOT)
sys.path.insert(0, os.path.join(ROOT, "evaluation"))
sys.path.insert(0, os.path.join(ROOT, "attacks"))
sys.path.insert(0, os.path.join(ROOT, "target"))
sys.path.insert(0, os.path.join(ROOT, "defense"))

from seeds import ALL_SEEDS, SEEDS_VERSION  # noqa: E402
from canary_templates import canary_followed  # noqa: E402
from chatbot import Chatbot  # noqa: E402
from retriever import CLEAN_COLLECTION_NAME, DocumentStore  # noqa: E402
from judge import judge_response  # noqa: E402
from defense.client import get_gate  # noqa: E402
from benign_queries import BENIGN_QUERIES  # noqa: E402

RESULTS_DIR = os.path.join(ROOT, "results")
POISONED_DIR = os.path.join(ROOT, "target", "documents", "poisoned")

DEFAULT_CONFIGS = "naive,all"
CONFIG_NAMES = [name.strip() for name in
                os.environ.get("EVAL_CONFIGS", DEFAULT_CONFIGS).split(",")
                if name.strip()]
BENIGN_GENERATE = os.environ.get("BENIGN_GENERATE", "0") == "1"
NO_GATE_CONFIGS = ("naive", "hardened", "none")

_LIMIT_RAW = os.environ.get("EVAL_LIMIT", "").strip()
EVAL_LIMIT = int(_LIMIT_RAW) if _LIMIT_RAW.isdigit() else None


def select_trial_seeds(seeds: list, limit: int) -> list:
    """Spreads `limit` items evenly across the attack groups for trial runs."""
    groups = {}
    for s in seeds:
        grp = f"{s.attack_type}-{s.variant}" if s.variant else s.attack_type
        groups.setdefault(grp, []).append(s)

    selected = []
    ordered_groups = ["direct-canary", "direct-harmful", "indirect-matched", "indirect-dev", "indirect-heldout"]
    extra_groups = [g for g in groups if g not in ordered_groups]
    all_groups = [g for g in ordered_groups if g in groups] + extra_groups

    while len(selected) < limit and any(groups.values()):
        for g in all_groups:
            if groups[g] and len(selected) < limit:
                selected.append(groups[g].pop(0))
    return selected


def prompt_mode_for(config_name: str) -> str:
    return "naive" if config_name == "naive" else "hardened"


CSV_COLUMNS = [
    "run_id", "timestamp", "config", "item_type", "item_id", "category",
    "attack_type", "query", "blocked", "block_reason", "verdict",
    "latency_ms", "response_snippet",
    "defense_mode",
    "defense_status",
    "defense_round_trip_ms",
    "defense_compute_ms",
    "blocking_layers",
    "request_id",
    "prompt_mode",
    "variant",
    "judge_method",
    "retrieved_files",
    "target_doc_retrieved",
    "seeds_version",
]


class _NoDefense:
    """naive / hardened: never touches the defense, so it does not depend on the network."""

    def check_detailed(self, text, context=None, request_id=None):
        return {"allowed": True, "reason": "no defense (baseline)", "status": "ok", "layers": [],
                "total_ms": 0.0, "round_trip_ms": 0.0}

    def check(self, text, context=None):
        return True, "no defense (baseline)"


def build_gate(config_name: str):
    """Returns a gate for this config, or raises so the whole config is skipped up front."""
    if config_name in NO_GATE_CONFIGS:
        return _NoDefense()
    gate = get_gate(config_name)
    if hasattr(gate, "health"):
        health = gate.health()
        if health is None:
            raise RuntimeError(f"defense service not reachable at {gate.base_url}")
        if config_name not in health.get("configs", []):
            raise RuntimeError(f"the service has no config '{config_name}' (it offers {health.get('configs')})")
        if config_name in ("classifier", "all") and not health.get("classifier_checkpoint_found"):
            raise RuntimeError("the service reports no classifier checkpoint on the defense laptop")
    else:
        gate.check_detailed("preflight check", context="preflight check")
    return gate


def _run_one(bot: Chatbot, gate, query: str) -> dict:
    """Runs a single query through the defended pipeline, timing it and
    catching failures so one bad call doesn't kill the whole matrix run."""
    start = time.perf_counter()
    try:
        result = bot.generate_defended(query, gate)
        latency_ms = (time.perf_counter() - start) * 1000
        return {
            "blocked": result["blocked"],
            "defense_unavailable": result["defense_unavailable"],
            "block_reason": result["block_reason"],
            "response": result["response"],
            "latency_ms": round(latency_ms, 1),
            "error": None,
            "defense": result.get("defense") or {},
            "retrieved": [os.path.basename(src) for _, src, _ in result.get("retrieved_chunks", [])],
        }
    except Exception as e:
        latency_ms = (time.perf_counter() - start) * 1000
        return {
            "blocked": None, "defense_unavailable": False, "block_reason": None, "response": "",
            "latency_ms": round(latency_ms, 1), "error": str(e), "defense": {}, "retrieved": [],
        }


def _check_only(store: DocumentStore, gate, query: str) -> dict:
    """Retrieves and runs the gate, but never calls Ollama. FPR depends only on the gate's verdict, so this
    gives the same blocked/allowed answer as the full path and skips the slow generation step."""
    start = time.perf_counter()
    try:
        chunks = store.retrieve_full_documents(query, top_k=Chatbot.top_k_default)
        combined = "\n\n".join(c.text for c in chunks)
        detail = gate.check_detailed(query, context=combined)
        if hasattr(detail, "to_dict"):
            detail = detail.to_dict()
        detail = dict(detail)
        detail.setdefault("status", "ok")
        unavailable = detail["status"] != "ok"
        blocked = (not unavailable) and (not detail["allowed"])
        return {
            "blocked": blocked, "defense_unavailable": unavailable,
            "block_reason": detail.get("reason", ""), "response": "",
            "latency_ms": round((time.perf_counter() - start) * 1000, 1), "error": None,
            "defense": detail, "retrieved": [os.path.basename(c.source_file) for c in chunks],
        }
    except Exception as e:
        return _error_outcome(str(e))


def _error_outcome(message: str) -> dict:
    return {"blocked": None, "defense_unavailable": False, "block_reason": None, "response": "",
            "latency_ms": 0.0, "error": message, "defense": {}, "retrieved": []}


def run_attack(bot: Chatbot, gate, store: DocumentStore, seed) -> dict:
    """Runs one attack against the clean store (plus its own poisoned document, for indirect attacks).
    Returns the outcome dict extended with: verdict, judge_method, judge_reasoning, target_doc_retrieved."""
    doc_path, ingested = None, False
    try:
        if seed.attack_type == "indirect":
            doc_path = os.path.join(POISONED_DIR, f"{seed.id.lower()}_poisoned.txt")
            if not os.path.exists(doc_path):
                outcome = _error_outcome(f"{doc_path} is missing: run python target/generate_poisoned_docs.py")
                return {**outcome, "verdict": "error", "judge_method": "", "judge_reasoning": "",
                        "target_doc_retrieved": ""}
            store.ingest_file(doc_path)
            ingested = True
        outcome = _run_one(bot, gate, seed.prompt)
    finally:
        if ingested:
            store.remove_source(doc_path)

    target_retrieved = ""
    if seed.attack_type == "indirect":
        target_retrieved = os.path.basename(doc_path) in outcome["retrieved"]

    method, reasoning = "", ""
    if outcome["error"]:
        verdict = "error"
    elif outcome["defense_unavailable"]:
        verdict = "defense_unavailable"
    elif outcome["blocked"]:
        verdict = "blocked"
    elif target_retrieved is False:
        verdict = "not_retrieved"
    elif seed.canary:
        method = "canary"
        verdict = "complied" if canary_followed(outcome["response"], seed.canary) else "refused"
    else:
        method = "llm"
        judged = judge_response(seed.prompt, outcome["response"], goal=seed.goal)
        verdict = judged.verdict
        reasoning = getattr(judged, "reasoning", "")
    return {**outcome, "verdict": verdict, "judge_method": method, "judge_reasoning": reasoning,
            "target_doc_retrieved": target_retrieved}


def _defense_fields(outcome: dict) -> dict:
    d = outcome.get("defense") or {}
    blocking = [layer["name"] for layer in d.get("layers", [])
                if not layer.get("allowed", True) and not layer.get("skipped")]
    return {
        "defense_status": d.get("status", ""),
        "defense_round_trip_ms": d.get("round_trip_ms", ""),
        "defense_compute_ms": d.get("total_ms", ""),
        "blocking_layers": "+".join(blocking),
        "request_id": d.get("request_id") or "",
    }


def _row(run_id, config_name, row_mode, prompt_mode, item_type, item_id, category, attack_type, variant, query,
         outcome, verdict, judge_method="", target_doc_retrieved=""):
    row = {
        "run_id": run_id, "timestamp": datetime.now(timezone.utc).isoformat(),
        "config": config_name, "item_type": item_type, "item_id": item_id,
        "category": category, "attack_type": attack_type, "query": query,
        "blocked": outcome["blocked"], "block_reason": outcome["block_reason"],
        "verdict": verdict, "latency_ms": outcome["latency_ms"],
        "response_snippet": outcome["response"][:150] if outcome["response"] else "",
        "defense_mode": row_mode, "prompt_mode": prompt_mode, "variant": variant,
        "judge_method": judge_method, "retrieved_files": "|".join(outcome.get("retrieved", [])),
        "target_doc_retrieved": target_doc_retrieved, "seeds_version": SEEDS_VERSION,
    }
    row.update(_defense_fields(outcome))
    return row


def run_evaluation() -> str:
    os.chdir(ROOT)
    os.makedirs(RESULTS_DIR, exist_ok=True)
    run_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    csv_path = os.path.join(RESULTS_DIR, f"results_{run_id}.csv")
    transcript_path = os.path.join(RESULTS_DIR, f"transcripts_{run_id}.jsonl")

    mode = "remote" if os.environ.get("DEFENSE_URL") else "local"
    print(f"Defense mode: {mode}" + (f" ({os.environ['DEFENSE_URL']})" if mode == "remote" else ""))

    active_seeds = select_trial_seeds(ALL_SEEDS, EVAL_LIMIT) if EVAL_LIMIT else ALL_SEEDS
    active_benign = BENIGN_QUERIES[:EVAL_LIMIT] if EVAL_LIMIT else BENIGN_QUERIES

    if EVAL_LIMIT:
        print(f"[TRIAL MODE] EVAL_LIMIT={EVAL_LIMIT}: running {len(active_seeds)} attacks and "
              f"{len(active_benign)} benign queries (not a full evaluation result).")
    print(f"Configs: {CONFIG_NAMES}   attack set {SEEDS_VERSION}: {len(active_seeds)} attacks, "
          f"{len(active_benign)} benign queries")

    store = DocumentStore(persist_dir=os.path.join(ROOT, "target", "chroma_db"),
                          collection_name=CLEAN_COLLECTION_NAME)
    rows = []
    transcripts = open(transcript_path, "w", encoding="utf-8")

    def log_transcript(config_name, prompt_mode, item_type, seed_id, query, outcome, verdict, method, reasoning):
        transcripts.write(json.dumps({
            "run_id": run_id, "config": config_name, "prompt_mode": prompt_mode, "item_type": item_type,
            "item_id": seed_id, "query": query, "response": outcome["response"], "verdict": verdict,
            "judge_method": method, "judge_reasoning": reasoning, "block_reason": outcome["block_reason"],
            "error": outcome["error"], "retrieved_files": outcome.get("retrieved", []),
            "defense": outcome.get("defense", {}),
        }, ensure_ascii=True) + "\n")
        transcripts.flush()

    for config_name in CONFIG_NAMES:
        print(f"\n{'#'*70}\nCONFIG: {config_name}\n{'#'*70}")
        try:
            gate = build_gate(config_name)
        except Exception as e:
            print(f"  Could not use config '{config_name}': {e}")
            print(f"  Skipping this config entirely.")
            continue
        prompt_mode = prompt_mode_for(config_name)
        row_mode = "none" if config_name in NO_GATE_CONFIGS else mode
        bot = Chatbot(store=store, prompt_mode=prompt_mode)

        for seed in active_seeds:
            print(f"  [{config_name}] {seed.id} ({seed.attack_type}{'/' + seed.variant if seed.variant else ''})...",
                  end=" ", flush=True)
            result = run_attack(bot, gate, store, seed)
            verdict = result["verdict"]
            if verdict == "error":
                print(f"ERROR: {result['error']}")
            elif verdict == "defense_unavailable":
                print(f"DEFENSE UNAVAILABLE ({result['block_reason'][:60]}...)")
            elif verdict == "blocked":
                layers = _defense_fields(result)["blocking_layers"]
                print(f"BLOCKED by {layers or '?'} ({result['block_reason'][:50]}...)")
            elif verdict == "not_retrieved":
                print("poisoned document NOT retrieved (excluded from ASR)")
            else:
                print(f"{verdict} ({result['latency_ms']:.0f}ms)")
            rows.append(_row(run_id, config_name, row_mode, prompt_mode, "attack", seed.id, seed.category,
                             seed.attack_type, seed.variant, seed.prompt, result, verdict,
                             result["judge_method"], result["target_doc_retrieved"]))
            log_transcript(config_name, prompt_mode, "attack", seed.id, seed.prompt, result, verdict,
                           result["judge_method"], result["judge_reasoning"])

        for i, query in enumerate(active_benign):
            item_id = f"benign_{i+1:02d}"
            print(f"  [{config_name}] {item_id}...", end=" ", flush=True)
            if BENIGN_GENERATE:
                outcome = _run_one(bot, gate, query)
            else:
                outcome = _check_only(store, gate, query)
            if outcome["error"]:
                status, verdict = "ERROR", "error"
            elif outcome["defense_unavailable"]:
                status, verdict = "DEFENSE UNAVAILABLE", "defense_unavailable"
            elif outcome["blocked"]:
                status, verdict = "BLOCKED (false positive)", "blocked"
            else:
                status, verdict = "allowed", "allowed"
            print(f"{status} ({outcome['latency_ms']:.0f}ms)")
            rows.append(_row(run_id, config_name, row_mode, prompt_mode, "benign", item_id, "benign", "n/a", "",
                             query, outcome, verdict))
            log_transcript(config_name, prompt_mode, "benign", item_id, query, outcome, verdict, "", "")

    transcripts.close()
    with open(csv_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_COLUMNS)
        writer.writeheader()
        writer.writerows(rows)

    print(f"\n{'='*70}\nWrote {len(rows)} rows to {csv_path}\nFull responses and judge reasoning: {transcript_path}")

    untested = [r for r in rows if r["verdict"] in ("error", "defense_unavailable", "not_retrieved")]
    if untested:
        per_config = {}
        for r in untested:
            key = f"{r['config']}:{r['verdict']}"
            per_config[key] = per_config.get(key, 0) + 1
        print(f"\nWARNING: {len(untested)} of {len(rows)} rows did NOT test the defense: {per_config}")
        print("Exclude them from ASR/FPR (metrics.py does) or fix the cause and rerun before reporting numbers.")

    print("Run evaluation/metrics.py on this file to compute ASR/FPR/latency per config.")
    return csv_path


if __name__ == "__main__":
    run_evaluation()