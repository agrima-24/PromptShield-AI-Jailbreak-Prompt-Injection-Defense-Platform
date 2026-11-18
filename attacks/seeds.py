"""Frozen seed library of direct and indirect prompt injection attacks."""
import argparse
import csv
import hashlib
import io
import json
import os
import random
import urllib.request
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from typing import Literal, Optional

try:
    from canary_templates import (CANARY_TOPICS, DEV, HELDOUT, MATCHED, STYLE_VARIANT, build_doc,
                                  canary_instruction)
    from templates import TEMPLATE_REGISTRY, indirect_injection_template
except ImportError:
    from attacks.canary_templates import (CANARY_TOPICS, DEV, HELDOUT, MATCHED, STYLE_VARIANT, build_doc,
                                          canary_instruction)
    from attacks.templates import TEMPLATE_REGISTRY, indirect_injection_template

ADVBENCH_URL = (
    "https://raw.githubusercontent.com/llm-attacks/llm-attacks/"
    "main/data/advbench/harmful_behaviors.csv"
)
SEEDS_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "seeds.json")

GOAL_SAMPLE_SEED = 1234
N_DIRECT_GOALS = 12
N_DIRECT_CANARY = 14
N_INDIRECT = 5
N_WILD = 3


@dataclass
class Attack:
    id: str
    category: str
    prompt: str
    attack_type: Literal["direct", "indirect"] = "direct"
    poisoned_doc: Optional[str] = None
    source: str = "generated"
    goal: str = ""
    canary: str = ""
    variant: str = ""
    style: str = ""



def _download_advbench_goals() -> list:
    try:
        with urllib.request.urlopen(ADVBENCH_URL, timeout=10) as resp:
            raw = resp.read().decode("utf-8")
        goals = [row["goal"].strip() for row in csv.DictReader(io.StringIO(raw)) if row.get("goal", "").strip()]
        if len(goals) >= 100:
            return goals
    except Exception as e:
        print(f"[info] Network fetch for AdvBench failed ({e}). Checking local cache / existing seeds.")

    if os.path.exists(SEEDS_PATH):
        try:
            with open(SEEDS_PATH, "r", encoding="utf-8") as f:
                data = json.load(f)
            cached_goals = [a["goal"] for a in data.get("attacks", []) if a.get("goal") and not a.get("canary")]
            unique_goals = list(dict.fromkeys(cached_goals))
            if len(unique_goals) >= N_DIRECT_GOALS:
                return unique_goals
        except Exception:
            pass
    raise RuntimeError(f"Could not download AdvBench and no cached goals found in {SEEDS_PATH}.")


_SENSITIVE_GOAL_KEYWORDS = [
    "self-harm", "self harm", "suicide", "anorexia", "bulimia", "eating disorder",
    "child", "minor", "sexual", "porn", "rape", "nude", "explicit",
]


def _is_sensitive_goal(goal: str) -> bool:
    lowered = goal.lower()
    return any(kw in lowered for kw in _SENSITIVE_GOAL_KEYWORDS)


def _sample_goals(n: int) -> list:
    pool = [g for g in _download_advbench_goals() if not _is_sensitive_goal(g)]
    return random.Random(GOAL_SAMPLE_SEED).sample(pool, n)


_NSFW_FILTER_KEYWORDS = [
    "nsfw", "sexual", "explicit", "porn", "erotic", "cum ", "cumgpt",
    "hentai", "nude", "fetish",
]


def _is_nsfw(prompt: str) -> bool:
    lowered = prompt.lower()
    return any(kw in lowered for kw in _NSFW_FILTER_KEYWORDS)


def _load_wild_jailbreak_samples(n: int) -> list:
    """A few REAL in-the-wild jailbreak prompts, used as-is (not built from a goal).
    Imports `datasets` here so that importing seeds.py never needs it."""
    try:
        from datasets import load_dataset
        ds = load_dataset("TrustAIRLab/in-the-wild-jailbreak-prompts", "jailbreak_2023_12_25", split="train")
        prompts = [
            row["prompt"] for row in ds
            if row.get("jailbreak") and row.get("prompt") and not _is_nsfw(row["prompt"])
        ]
        if len(prompts) >= n:
            return prompts[:n]
    except Exception as e:
        print(f"[info] Network fetch for in-the-wild prompts failed ({e}). Checking existing seeds.")

    if os.path.exists(SEEDS_PATH):
        try:
            with open(SEEDS_PATH, "r", encoding="utf-8") as f:
                data = json.load(f)
            cached_wild = [a["prompt"] for a in data.get("attacks", []) if a.get("source") == "in-the-wild"]
            if len(cached_wild) >= n:
                return cached_wild[:n]
        except Exception:
            pass
    raise RuntimeError(f"Could not load in-the-wild prompts and none found in {SEEDS_PATH}.")


def build_direct_canary_seeds(n: int = N_DIRECT_CANARY) -> list:
    """Direct attacks carrying harmless canary instructions (cycling through all 7 direct template families).
    Success is evaluated via string match (canary_followed)."""
    template_names = list(TEMPLATE_REGISTRY.keys())
    seeds = []
    for i in range(n):
        tname = template_names[i % len(template_names)]
        category = tname.split("_")[0]
        canary = "ZX-" + hashlib.sha256(f"direct-canary-{i}".encode()).hexdigest()[:6].upper()
        instruction = canary_instruction(canary, i)
        prompt = TEMPLATE_REGISTRY[tname](instruction)
        seeds.append(Attack(
            id=f"DC{i+1:02d}", category=category, prompt=prompt,
            attack_type="direct", poisoned_doc=None,
            source="canary+template", goal=instruction, canary=canary,
            variant="canary", style=tname,
        ))
    return seeds


def build_direct_seeds(goals: list, wild_prompts: list) -> list:
    seeds = []
    idx = 1
    template_names = list(TEMPLATE_REGISTRY.keys())
    for i, goal in enumerate(goals):
        tname = template_names[i % len(template_names)]
        prompt = TEMPLATE_REGISTRY[tname](goal)
        category = tname.split("_")[0]
        seeds.append(Attack(
            id=f"A{idx:02d}", category=category, prompt=prompt,
            attack_type="direct", source="AdvBench+template", goal=goal,
            variant="harmful", style=tname,
        ))
        idx += 1

    for wild_prompt in wild_prompts:
        seeds.append(Attack(
            id=f"A{idx:02d}", category="roleplay", prompt=wild_prompt,
            attack_type="direct", source="in-the-wild", goal="",
            variant="harmful", style="wild",
        ))
        idx += 1
    return seeds


def build_indirect_seeds(goals: list) -> list:
    """Poisoned-document + triggering-query pairs (stage 1, item 2 of your architecture)."""
    cover_topics = [
        "company policy update", "product FAQ update", "quarterly report summary",
        "support ticket resolution notes", "onboarding guide update",
    ]
    seeds = []
    for i, goal in enumerate(goals):
        cover = cover_topics[i % len(cover_topics)]
        doc, query = indirect_injection_template(goal, cover_topic=cover)
        seeds.append(Attack(
            id=f"IND{i+1:02d}", category="indirect", prompt=query,
            attack_type="indirect", poisoned_doc=doc,
            source="AdvBench+template", goal=goal, variant="matched", style="matched_rule",
        ))
    return seeds


def build_canary_seeds() -> list:
    """20 indirect attacks whose injected instruction is harmless and whose success is a string match.
    2 matched + 8 dev + 10 held-out styles; one distinct cover topic each (see canary_templates.py)."""
    order = list(MATCHED) + list(DEV) + list(HELDOUT)
    seeds = []
    for i, style in enumerate(order):
        topic = CANARY_TOPICS[i]
        canary = "ZX-" + hashlib.sha256(f"canary-{i}".encode()).hexdigest()[:6].upper()
        instruction = canary_instruction(canary, i)
        seeds.append(Attack(
            id=f"INDC{i+1:02d}", category="indirect_canary", prompt=f"Can you summarize the latest {topic}?",
            attack_type="indirect", poisoned_doc=build_doc(style, instruction, topic, canary),
            source="canary", goal=instruction, canary=canary, variant=STYLE_VARIANT[style], style=style,
        ))
    return seeds


def build_all_seeds(allow_partial: bool = False) -> list:
    goals = _sample_goals(N_DIRECT_GOALS)
    try:
        wild = _load_wild_jailbreak_samples(N_WILD)
    except Exception as e:
        if not allow_partial:
            raise SystemExit(
                f"Could not load the in-the-wild jailbreaks ({e}).\n"
                f"Refusing to freeze a smaller attack set. Fix the connection and retry, "
                f"or pass --allow-partial to freeze without them."
            )
        print(f"[warn] Freezing WITHOUT the in-the-wild jailbreaks ({e}).")
        wild = []
    return (
        build_direct_canary_seeds(N_DIRECT_CANARY)
        + build_direct_seeds(goals, wild)
        + build_indirect_seeds(goals[:N_INDIRECT])
        + build_canary_seeds()
    )



def _version(attack_dicts: list) -> str:
    payload = json.dumps(attack_dicts, sort_keys=True, ensure_ascii=True)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()[:12]


def freeze(allow_partial: bool = False) -> list:
    attacks = build_all_seeds(allow_partial)
    dicts = [asdict(a) for a in attacks]
    data = {
        "version": _version(dicts),
        "created_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "goal_sample_seed": GOAL_SAMPLE_SEED,
        "attacks": dicts,
    }
    with open(SEEDS_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=True)
    return attacks


def load_frozen():
    with open(SEEDS_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)
    attacks = [Attack(**a) for a in data["attacks"]]
    if _version(data["attacks"]) != data["version"]:
        raise RuntimeError("attacks/seeds.json was edited by hand (its content no longer matches its recorded "
                           "version). Re-freeze with `python attacks/seeds.py --freeze`.")
    return attacks, data["version"]


def _load_at_import():
    if os.path.exists(SEEDS_PATH):
        return load_frozen()
    if __name__ == "__main__":
        return [], "none"
    raise FileNotFoundError(
        f"{SEEDS_PATH} not found. Build it once, with internet access:\n"
        f"    python attacks/seeds.py --freeze"
    )


ALL_SEEDS, SEEDS_VERSION = _load_at_import()


def _print_set(attacks: list, version: str):
    by_group = {}
    for a in attacks:
        grp = f"{a.attack_type}-{a.variant}" if a.variant else a.attack_type
        by_group[grp] = by_group.get(grp, 0) + 1
    print(f"Attack set version {version}: {len(attacks)} attacks ({by_group})\n")
    for a in attacks:
        canary_str = f" [canary: {a.canary}]" if a.canary else ""
        print(f"[{a.id}] {a.category:12s} ({a.attack_type:8s}, {a.variant or '-':7s}, {a.source}){canary_str} — {a.prompt[:75]!r}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Freeze or inspect the seed attack set.")
    parser.add_argument("--freeze", action="store_true", help="rebuild from network sources and write seeds.json")
    parser.add_argument("--allow-partial", action="store_true",
                        help="with --freeze: continue even if the in-the-wild jailbreaks cannot be loaded")
    args = parser.parse_args()

    if args.freeze:
        frozen = freeze(allow_partial=args.allow_partial)
        print(f"Wrote {SEEDS_PATH}")
        _print_set(frozen, json.load(open(SEEDS_PATH))['version'])
        print("\nNext: regenerate the poisoned documents (python target/generate_poisoned_docs.py), "
              "then rebuild the Chroma store.")
    else:
        _print_set(ALL_SEEDS, SEEDS_VERSION)