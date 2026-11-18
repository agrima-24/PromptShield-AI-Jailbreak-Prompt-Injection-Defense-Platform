"""Adaptive attack evaluation runner measuring defense robustness against iterative mutations."""
import argparse
import csv
import json
import os
import random
import sys
import uuid
from collections import Counter
from datetime import datetime, timezone

import runner
from canary_templates import canary_followed
from chatbot import Chatbot, call_ollama
from judge import judge_response
from mutator import MAX_ATTEMPTS, AttemptOutcome, run_adaptive_attack
from retriever import CLEAN_COLLECTION_NAME, DocumentStore
from seeds import ALL_SEEDS, SEEDS_VERSION

CSV_COLUMNS = [
    "run_id", "config", "prompt_mode", "attack_id", "attack_type", "variant", "style_start", "style_end",
    "status", "untested_reason", "static_success", "adaptive_success", "attempts",
    "operator_trail", "blocking_trail", "winning_operator", "final_snippet", "seed", "seeds_version",
]


def make_attempt_fn(bot, gate, store, adaptive_dir):
    """Returns attempt(attack) -> AttemptOutcome. Indirect attacks get their (possibly mutated) document written
    to target/documents/_adaptive/, added to the clean store for the duration of the attempt, then removed."""

    def attempt(attack) -> AttemptOutcome:
        doc_path, ingested = None, False
        try:
            if attack.attack_type == "indirect":
                os.makedirs(adaptive_dir, exist_ok=True)
                doc_path = os.path.join(adaptive_dir, f"{attack.id.lower()}_{uuid.uuid4().hex[:8]}.txt")
                with open(doc_path, "w", encoding="utf-8") as f:
                    f.write(attack.poisoned_doc)
                store.ingest_file(doc_path)
                ingested = True
            outcome = runner._run_one(bot, gate, attack.prompt)
        finally:
            if ingested:
                store.remove_source(doc_path)
            if doc_path and os.path.exists(doc_path):
                os.remove(doc_path)

        retrieved = (os.path.basename(doc_path) in outcome["retrieved"]) if doc_path else None
        if outcome["error"]:
            return AttemptOutcome(False, error=outcome["error"])
        if outcome["defense_unavailable"]:
            return AttemptOutcome(False, defense_unavailable=True)
        layers = runner._defense_fields(outcome)["blocking_layers"]
        layers = [name for name in layers.split("+") if name]
        if outcome["blocked"]:
            return AttemptOutcome(False, blocked=True, blocking_layers=layers, target_doc_retrieved=retrieved)
        if retrieved is False:
            return AttemptOutcome(False, response=outcome["response"], target_doc_retrieved=False)
        if attack.canary:
            success = canary_followed(outcome["response"], attack.canary)
        else:
            success = judge_response(attack.prompt, outcome["response"], goal=attack.goal).verdict == "complied"
        return AttemptOutcome(success, response=outcome["response"], target_doc_retrieved=retrieved)

    return attempt


def _group(attack) -> str:
    if attack.attack_type == "direct":
        return f"direct-{attack.variant}" if attack.variant else ("direct-canary" if attack.canary else "direct-harmful")
    return f"indirect-{attack.variant}" if attack.variant else "indirect"


def summarize(config: str, results: list):
    tested = [r for r in results if r["status"] == "tested"]
    untested = len(results) - len(tested)
    print(f"\n=== {config}: {len(tested)} of {len(results)} attacks tested"
          + (f" ({untested} untested: defense unreachable, error, or document never retrieved)" if untested else "") + " ===")
    if not tested:
        return
    static = sum(r["static_success"] for r in tested)
    adaptive = sum(r["adaptive_success"] for r in tested)
    print(f"  static ASR   (attempt 1 only):   {static}/{len(tested)} = {100 * static / len(tested):.1f}%")
    print(f"  adaptive ASR (within the budget): {adaptive}/{len(tested)} = {100 * adaptive / len(tested):.1f}%")

    first_success = Counter(r["attempts"] for r in tested if r["adaptive_success"])
    max_n = max(r["budget"] for r in tested)
    cumulative, running = [], 0
    for n in range(1, max_n + 1):
        running += first_success.get(n, 0)
        cumulative.append(f"{n}:{running}")
    print(f"  cumulative successes by attempt: {'  '.join(cumulative)}")

    groups = sorted({r["group"] for r in tested})
    cells = []
    for g in groups:
        sel = [r for r in tested if r["group"] == g]
        cells.append(f"{g} {sum(r['static_success'] for r in sel)}->{sum(r['adaptive_success'] for r in sel)}/{len(sel)}")
    print(f"  by group (static->adaptive / tested): " + " | ".join(cells))

    winners = Counter()
    for r in tested:
        if r["adaptive_success"] and r["attempts"] > 1:
            last = r["trail"][-1]
            winners[(last["operator"], "+".join(last["after_blocked_by"]) or "model refusal")] += 1
    if winners:
        print("  operators that won, and what had blocked the attempt before:")
        for (op, after), n in winners.most_common():
            print(f"      {op:<15} after {after:<22} x{n}")


def parse_args():
    p = argparse.ArgumentParser(description="Adaptive attacker vs the defended pipeline (Objective V).")
    p.add_argument("--configs", default=os.environ.get("ADAPTIVE_CONFIGS", "hardened,all"))
    p.add_argument("--max-attempts", type=int, default=MAX_ATTEMPTS)
    p.add_argument("--seed", default="7")
    p.add_argument("--attacks", default="all", help="comma-separated attack ids, or 'all'")
    p.add_argument("--types", choices=["all", "direct", "indirect"], default="all")
    p.add_argument("--limit", type=int, default=0, help="only the first N selected attacks (for trial runs)")
    p.add_argument("--no-llm", action="store_true", help="disable the LLM-based paraphrase operators")
    return p.parse_args()


def main():
    args = parse_args()
    os.chdir(runner.ROOT)

    attacks = list(ALL_SEEDS)
    if args.types != "all":
        attacks = [a for a in attacks if a.attack_type == args.types]
    if args.attacks != "all":
        wanted = {x.strip() for x in args.attacks.split(",")}
        attacks = [a for a in attacks if a.id in wanted]
    if args.limit:
        attacks = attacks[:args.limit]
    if not attacks:
        raise SystemExit("No attacks selected.")

    configs = [c.strip() for c in args.configs.split(",") if c.strip()]
    run_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    csv_path = os.path.join(runner.RESULTS_DIR, f"adaptive_{run_id}.csv")
    trail_path = os.path.join(runner.RESULTS_DIR, f"adaptive_trails_{run_id}.jsonl")
    os.makedirs(runner.RESULTS_DIR, exist_ok=True)

    store = DocumentStore(persist_dir=os.path.join(runner.ROOT, "target", "chroma_db"),
                          collection_name=CLEAN_COLLECTION_NAME)
    adaptive_dir = os.path.join(runner.ROOT, "target", "documents", "_adaptive")
    llm_call = None if args.no_llm else (lambda prompt: call_ollama(prompt))
    print(f"Attack set {SEEDS_VERSION}: {len(attacks)} attacks, configs {configs}, up to {args.max_attempts} "
          f"attempts each, seed {args.seed}" + ("  (LLM paraphrase operators disabled)" if args.no_llm else ""))

    rows, trails = [], open(trail_path, "w", encoding="utf-8")
    for config in configs:
        print(f"\n{'#'*70}\nCONFIG: {config}\n{'#'*70}")
        try:
            gate = runner.build_gate(config)
        except Exception as e:
            print(f"  Could not use config '{config}': {e}\n  Skipping it.")
            continue
        prompt_mode = runner.prompt_mode_for(config)
        bot = Chatbot(store=store, prompt_mode=prompt_mode)
        attempt_fn = make_attempt_fn(bot, gate, store, adaptive_dir)

        config_results = []
        for attack in attacks:
            rng = random.Random(f"{args.seed}|{config}|{attack.id}")
            res = run_adaptive_attack(attack, attempt_fn, rng, llm_call, args.max_attempts)
            first_try = res.trail[0]["success"]
            ops = [t["operator"] for t in res.trail[1:]]
            blocking = ["+".join(t["blocking_layers"]) or ("blocked" if t["blocked"] else "-") for t in res.trail]
            winning = res.trail[-1]["operator"] if res.succeeded and res.attempts > 1 else ""
            outcome_word = ("SUCCEEDED" if res.succeeded else "held") if res.status == "tested" else f"UNTESTED ({res.untested_reason})"
            print(f"  [{config}] {attack.id:<8} ({_group(attack):<17}) {outcome_word:<12} attempts={res.attempts} "
                  f"{('ops: ' + '>'.join(ops)) if ops else ''}")
            final = res.final_attack
            rows.append({
                "run_id": run_id, "config": config, "prompt_mode": prompt_mode, "attack_id": attack.id,
                "attack_type": attack.attack_type, "variant": attack.variant, "style_start": attack.style,
                "style_end": final.style, "status": res.status, "untested_reason": res.untested_reason,
                "static_success": int(first_try), "adaptive_success": int(res.succeeded), "attempts": res.attempts,
                "operator_trail": ">".join(ops), "blocking_trail": "|".join(blocking), "winning_operator": winning,
                "final_snippet": (final.poisoned_doc if final.attack_type == "indirect" else final.prompt)[:200].replace("\n", " "),
                "seed": args.seed, "seeds_version": SEEDS_VERSION,
            })
            trails.write(json.dumps({"run_id": run_id, "config": config, "attack_id": attack.id, "status": res.status,
                                     "trail": res.trail}, ensure_ascii=True) + "\n")
            trails.flush()
            config_results.append({
                "status": res.status, "static_success": int(first_try), "adaptive_success": int(res.succeeded),
                "attempts": res.attempts, "budget": args.max_attempts, "group": _group(attack), "trail": res.trail,
            })
        summarize(config, config_results)

    trails.close()
    with open(csv_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_COLUMNS)
        writer.writeheader()
        writer.writerows(rows)
    print(f"\nWrote {len(rows)} rows to {csv_path}\nPer-attempt trails: {trail_path}")


if __name__ == "__main__":
    main()