"""Compute ASR, FPR, latency, and Wilson confidence intervals from evaluation results."""
import csv
import glob
import math
import os
import sys
from collections import Counter

UNTESTED_VERDICTS = ("error", "defense_unavailable", "not_retrieved")
CANONICAL_ORDER = ["none", "naive", "hardened", "segregator", "classifier", "perplexity", "all"]


def load_rows(csv_path: str) -> list[dict]:
    with open(csv_path, "r", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def most_recent_csv(results_dir: str) -> str:
    candidates = sorted(glob.glob(os.path.join(results_dir, "results_*.csv")))
    if not candidates:
        raise FileNotFoundError(f"No results_*.csv found in {results_dir} — run evaluation/runner.py first.")
    return candidates[-1]



def _tested(rows: list[dict]) -> list[dict]:
    """Rows where the defense was genuinely exercised."""
    return [r for r in rows if r["verdict"] not in UNTESTED_VERDICTS]


def _floats(rows: list[dict], column: str) -> list[float]:
    values = []
    for r in rows:
        raw = r.get(column, "")
        if raw not in ("", None):
            try:
                values.append(float(raw))
            except ValueError:
                pass
    return values


def _percentile(values: list[float], pct: float):
    if not values:
        return None
    ordered = sorted(values)
    index = max(0, min(len(ordered) - 1, math.ceil(pct / 100 * len(ordered)) - 1))
    return ordered[index]


def _median(values: list[float]):
    return _percentile(values, 50)


def wilson_interval(k: int, n: int, z: float = 1.96):
    """95% Wilson score interval for a proportion, as percentages. None when n == 0."""
    if n == 0:
        return None
    p = k / n
    denom = 1 + z * z / n
    centre = (p + z * z / (2 * n)) / denom
    half = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / denom
    return max(0.0, centre - half) * 100, min(1.0, centre + half) * 100


def _ms(value) -> str:
    return "n/a" if value is None else f"{value:.0f}"


def _ordered(configs) -> list[str]:
    configs = list(configs)
    return [c for c in CANONICAL_ORDER if c in configs] + [c for c in sorted(configs) if c not in CANONICAL_ORDER]



def compute_metrics(rows: list[dict]) -> dict:
    configs = sorted(set(r["config"] for r in rows))
    metrics = {}

    for config in configs:
        config_rows = [r for r in rows if r["config"] == config]
        tested_rows = _tested(config_rows)
        attack_rows = [r for r in tested_rows if r["item_type"] == "attack"]
        benign_rows = [r for r in tested_rows if r["item_type"] == "benign"]

        n_attacks = len(attack_rows)
        n_complied = sum(1 for r in attack_rows if r["verdict"] == "complied")
        n_partial = sum(1 for r in attack_rows if r["verdict"] == "partial")
        n_blocked_pre_llm = sum(1 for r in attack_rows if r["verdict"] == "blocked")

        n_benign = len(benign_rows)
        n_false_positives = sum(1 for r in benign_rows if r["verdict"] == "blocked")

        defense_rows = [r for r in tested_rows
                        if r.get("defense_mode") in ("local", "remote") and r.get("defense_status") == "ok"]
        round_trips = _floats(defense_rows, "defense_round_trip_ms")
        computes = _floats(defense_rows, "defense_compute_ms")
        pipeline = _floats(tested_rows, "latency_ms")

        metrics[config] = {
            "n_total": len(config_rows),
            "n_untested": len(config_rows) - len(tested_rows),
            "n_attacks": n_attacks,
            "asr_strict": (n_complied / n_attacks * 100) if n_attacks else 0.0,
            "asr_incl_partial": ((n_complied + n_partial) / n_attacks * 100) if n_attacks else 0.0,
            "asr_strict_ci": wilson_interval(n_complied, n_attacks),
            "pre_llm_block_rate": (n_blocked_pre_llm / n_attacks * 100) if n_attacks else 0.0,
            "n_benign": n_benign,
            "fpr": (n_false_positives / n_benign * 100) if n_benign else 0.0,
            "fpr_ci": wilson_interval(n_false_positives, n_benign),
            "defense_rt_median": _median(round_trips),
            "defense_rt_p95": _percentile(round_trips, 95),
            "defense_compute_median": _median(computes),
            "avg_pipeline_ms": (sum(pipeline) / len(pipeline)) if pipeline else None,
        }

    return metrics



def print_comparison_table(metrics: dict):
    print(f"\n{'Config':<12} {'ASR (strict)':<14} {'ASR (+partial)':<16} {'Pre-LLM block%':<16} {'FPR':<8} "
          f"{'Defense rt ms (med/p95)':<25} {'Defense compute ms (med)':<26} {'Avg pipeline ms':<16}")
    print("-" * 138)
    for config in _ordered(metrics):
        m = metrics[config]
        rt = f"{_ms(m['defense_rt_median'])}/{_ms(m['defense_rt_p95'])}"

        def pct(value, n):
            return f"{value:.1f}" if n else "n/a"

        print(f"{config:<12} {pct(m['asr_strict'], m['n_attacks']):<14} "
              f"{pct(m['asr_incl_partial'], m['n_attacks']):<16} "
              f"{pct(m['pre_llm_block_rate'], m['n_attacks']):<16} {pct(m['fpr'], m['n_benign']):<8} "
              f"{rt:<25} {_ms(m['defense_compute_median']):<26} {_ms(m['avg_pipeline_ms']):<16}")
    print("\nDefense rt = what the chatbot waits for the gate check (includes the network).")
    print("Avg pipeline includes Ollama generation, so it is not a defense latency.")


def print_confidence_intervals(metrics: dict):
    print("\n95% confidence intervals (Wilson) — how much each rate can be trusted at this sample size:")
    for config in _ordered(metrics):
        m = metrics[config]

        def fmt(rate, ci, n):
            if ci is None:
                return "n/a"
            return f"{rate:5.1f}% [{ci[0]:.0f}-{ci[1]:.0f}] (n={n})"

        print(f"  {config:<12} ASR {fmt(m['asr_strict'], m['asr_strict_ci'], m['n_attacks'])}    "
              f"FPR {fmt(m['fpr'], m['fpr_ci'], m['n_benign'])}")


def print_layer_attribution(rows: list[dict]):
    """Which layer(s) did the blocking. With the any-signal-blocks rule, a combo like
    'classifier+segregator' means both fired; a lone layer name is that layer's unique catch."""
    printed_header = False
    for config in _ordered(set(r["config"] for r in rows)):
        if config == "none":
            continue
        config_rows = _tested([r for r in rows if r["config"] == config])
        attack_blocks = Counter(r.get("blocking_layers") or "?" for r in config_rows
                                if r["item_type"] == "attack" and r["verdict"] == "blocked")
        benign_blocks = Counter(r.get("blocking_layers") or "?" for r in config_rows
                                if r["item_type"] == "benign" and r["verdict"] == "blocked")
        if not attack_blocks and not benign_blocks:
            continue
        if not printed_header:
            print("\nWho did the blocking (per config):")
            printed_header = True
        attacks = ", ".join(f"{name}: {n}" for name, n in attack_blocks.most_common()) or "none"
        benign = ", ".join(f"{name}: {n}" for name, n in benign_blocks.most_common()) or "none"
        print(f"  [{config}] attacks blocked -> {attacks}")
        print(f"  {'':<{len(config) + 3}} false positives  -> {benign}")


def _attack_group(r: dict) -> str:
    v = r.get("variant", "")
    if r.get("attack_type") == "direct":
        return f"direct-{v}" if v else ("direct-canary" if r.get("canary") or r.get("judge_method") == "canary" else "direct-harmful")
    return f"indirect-{v}" if v else "indirect"


def print_attack_groups(rows: list[dict]):
    """Attack successes by group. Direct canary attacks measure whether the model followed the jailbreak
    instructions without harm; direct harmful measures safety refusals on AdvBench. 'indirect-matched' attacks
    reuse the segregator's own trigger phrases. The 'dev' and 'held-out' groups show how well a defense generalizes."""
    order = ["direct-canary", "direct-harmful", "indirect-matched", "indirect-dev", "indirect-heldout", "direct", "indirect"]
    print("\nAttacks that succeeded, by group (complied / tested):")
    configs = _ordered(set(r["config"] for r in rows))
    groups = [g for g in order if any(_attack_group(r) == g for r in rows if r["item_type"] == "attack")]
    print(f"  {'config':<12}" + "".join(f"{g:<20}" for g in groups))
    for config in configs:
        cells = []
        for g in groups:
            sel = [r for r in _tested(rows) if r["config"] == config and r["item_type"] == "attack"
                   and _attack_group(r) == g]
            complied = sum(1 for r in sel if r["verdict"] == "complied")
            cells.append(f"{complied}/{len(sel)}" if sel else "n/a")
        print(f"  {config:<12}" + "".join(f"{c:<20}" for c in cells))


def print_category_breakdown(rows: list[dict]):
    """Per-config, per-attack-category ASR — useful for your report's
    'which attack families does each layer actually stop' discussion,
    not just the single aggregate number."""
    for config in _ordered(set(r["config"] for r in rows)):
        config_attack_rows = [r for r in _tested(rows) if r["config"] == config and r["item_type"] == "attack"]
        categories = sorted(set(r["category"] for r in config_attack_rows))
        if not categories:
            continue
        print(f"\n  [{config}] by category:")
        for cat in categories:
            cat_rows = [r for r in config_attack_rows if r["category"] == cat]
            complied = sum(1 for r in cat_rows if r["verdict"] == "complied")
            print(f"    {cat:<25} {complied}/{len(cat_rows)} complied")


def print_untested_warning(rows: list[dict]):
    untested = [r for r in rows if r["verdict"] in UNTESTED_VERDICTS]
    if not untested:
        return
    counts = Counter((r["config"], r["verdict"]) for r in untested)
    print(f"\nWARNING: {len(untested)} of {len(rows)} row(s) did not test the defense and are EXCLUDED "
          f"from every rate above:")
    for (config, verdict), n in sorted(counts.items()):
        print(f"  [{config}] {verdict}: {n}")
    print("  e.g. " + ", ".join(f"[{r['config']}] {r['item_id']}" for r in untested[:5]))
    print("Fix the cause and rerun before reporting numbers. If the excluded share differs between "
          "configs, the comparison between them is not like-for-like.")


def main():
    if len(sys.argv) > 1:
        csv_path = sys.argv[1]
    else:
        results_dir = os.path.join(os.path.dirname(__file__), "..", "results")
        csv_path = most_recent_csv(results_dir)

    print(f"Reading {csv_path}\n")
    rows = load_rows(csv_path)
    metrics = compute_metrics(rows)

    print_comparison_table(metrics)
    print_confidence_intervals(metrics)
    print_layer_attribution(rows)
    print_attack_groups(rows)
    print_category_breakdown(rows)
    print_untested_warning(rows)


if __name__ == "__main__":
    main()