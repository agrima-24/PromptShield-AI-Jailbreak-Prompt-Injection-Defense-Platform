"""Build labeled train/val/test splits for the DistilBERT classifier."""
import csv
import io
import json
import os
import random
import re
import sys
import urllib.request
from collections import Counter

import pandas as pd
from datasets import load_dataset
from scipy.sparse.csgraph import connected_components
from sklearn.feature_extraction.text import TfidfVectorizer

BASE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
for _sub in ("attacks", "evaluation", os.path.join("defense", "tools")):
    sys.path.insert(0, os.path.join(BASE, _sub))

from seeds import ALL_SEEDS, SEEDS_VERSION  # noqa: E402
from benign_queries import BENIGN_QUERIES  # noqa: E402
from domain_benign import TRAIN_DOMAIN_BENIGN  # noqa: E402

OUT_DIR = os.path.join(BASE, "defense", "data")
SEED = 42
N_ALPACA = 3000
DUP_THRESHOLD = 0.85
EVAL_SIMILARITY_THRESHOLD = 0.80
SPLIT_TARGETS = {"train": 0.70, "val": 0.15, "test": 0.15}
ADVBENCH_URL = (
    "https://raw.githubusercontent.com/llm-attacks/llm-attacks/"
    "main/data/advbench/harmful_behaviors.csv"
)



def norm(text) -> str:
    return re.sub(r"\s+", " ", str(text).strip().lower())


def dedupe(records: list) -> list:
    seen, out = set(), []
    for text, source in records:
        t = str(text).strip()
        if len(t) <= 5:
            continue
        key = norm(t)
        if key in seen:
            continue
        seen.add(key)
        out.append((t, source))
    return out


def drop_held_out(records: list, held_out: set):
    kept = [(t, s) for t, s in records if norm(t) not in held_out]
    return kept, len(records) - len(kept)


def drop_similar(records: list, references: list, threshold: float):
    """Drop records whose TF-IDF cosine similarity to ANY reference is >= threshold."""
    if not records:
        return records, 0
    texts = [t for t, _ in records]
    vec = TfidfVectorizer(ngram_range=(1, 2), sublinear_tf=True).fit(texts + list(references))
    sims = (vec.transform(texts) @ vec.transform(list(references)).T).max(axis=1).toarray().ravel()
    kept = [r for r, s in zip(records, sims) if s < threshold]
    return kept, len(records) - len(kept)


def dup_vectorizer(n_texts: int) -> TfidfVectorizer:
    """Vectorizer used to decide what counts as a near-duplicate, by grouping AND by the leakage report.

    Plain term frequency (use_idf=False) on purpose: similarity then means "how much of the text is
    shared". With IDF weighting, the few words that differ between two near-copies are rare, so they
    get a huge weight, while the shared template text (common within the copies) gets almost none.
    That drags the cosine of obvious near-copies down to ~0.8, below the threshold, so they were
    never linked. Measured: with IDF, a family of 60 variants fragments into ~50 clusters; without
    it, exactly one. Words appearing in over half the texts are ignored so filler words don't
    inflate the similarity of unrelated texts.
    """
    return TfidfVectorizer(ngram_range=(1, 2), sublinear_tf=True, use_idf=False,
                           max_df=0.5 if n_texts > 50 else 1.0)


def near_duplicate_groups(texts: list) -> list:
    """Cluster texts: two texts are linked if their cosine similarity >= DUP_THRESHOLD;
    each connected component is one group. Returns a group id per text."""
    if len(texts) < 2:
        return list(range(len(texts)))
    try:
        X = dup_vectorizer(len(texts)).fit_transform(texts)
    except ValueError:
        return list(range(len(texts)))
    sim = (X @ X.T).tocsr()
    sim.data[sim.data < DUP_THRESHOLD] = 0
    sim.eliminate_zeros()
    _, labels = connected_components(sim, directed=False)
    return labels.tolist()


def split_groups(group_sizes: dict, seed: int) -> dict:
    """Assign whole groups to train/val/test, largest first, always into the split with the most room
    left, so sizes land close to 70/15/15 and no group is ever divided."""
    rng = random.Random(seed)
    groups = list(group_sizes.items())
    rng.shuffle(groups)
    groups.sort(key=lambda kv: -kv[1])
    total = sum(group_sizes.values())
    room = {name: share * total for name, share in SPLIT_TARGETS.items()}
    assignment = {}
    for group, size in groups:
        split = max(room, key=room.get)
        assignment[group] = split
        room[split] -= size
    return assignment



def load_attack_records() -> list:
    records = []

    try:
        jbb = load_dataset("JailbreakBench/JBB-Behaviors", "behaviors", split="harmful")
        records += [(row["Goal"], "jbb") for row in jbb if row.get("Goal")]
    except Exception as e:
        print(f"[warn] JailbreakBench load failed ({e}); skipping.")

    try:
        with urllib.request.urlopen(ADVBENCH_URL, timeout=30) as resp:
            raw = resp.read().decode("utf-8")
        records += [(row["goal"].strip(), "advbench") for row in csv.DictReader(io.StringIO(raw))
                    if row.get("goal", "").strip()]
    except Exception as e:
        print(f"[warn] AdvBench (GitHub source) load failed ({e}); skipping.")

    try:
        wild = load_dataset("TrustAIRLab/in-the-wild-jailbreak-prompts", "jailbreak_2023_12_25", split="train")
        records += [(row["prompt"], "wild") for row in wild if row.get("jailbreak") and row.get("prompt")]
    except Exception as e:
        raise SystemExit(f"In-the-wild jailbreak prompts failed to load ({e}). Fix this before training; "
                         f"a classifier without them will miss wrapped and role-play attacks.")

    return records


def load_general_benign_records() -> list:
    try:
        alpaca = load_dataset("tatsu-lab/alpaca", split="train")
        sample = alpaca.shuffle(seed=SEED).select(range(min(N_ALPACA, len(alpaca))))
        return [(row["instruction"], "alpaca") for row in sample if row.get("instruction")]
    except Exception as e:
        raise SystemExit(f"Alpaca failed to load ({e}); cannot build the benign class.")



def leakage_report(df: pd.DataFrame) -> dict:
    """Percent of test rows with a near-duplicate (cosine >= DUP_THRESHOLD) in train, per class.
    Domain queries are excluded: they are templated and similar by design."""
    result = {}
    for label, name in ((1, "attack"), (0, "benign")):
        sub = df[(df["label"] == label) & (df["source"] != "domain")]
        train = sub[sub["split"] == "train"]["text"].tolist()
        test = sub[sub["split"] == "test"]["text"].tolist()
        if not train or not test:
            continue
        vec = dup_vectorizer(len(sub)).fit(sub["text"])
        sims = (vec.transform(test) @ vec.transform(train).T).max(axis=1).toarray().ravel()
        result[name] = round(float((sims >= DUP_THRESHOLD).mean()) * 100, 2)
    return result


def main():
    rng = random.Random(SEED)

    held_out = (
        {norm(a.prompt) for a in ALL_SEEDS}
        | {norm(a.goal) for a in ALL_SEEDS if a.goal}
        | {norm(q) for q in BENIGN_QUERIES}
    )

    attack = dedupe(load_attack_records())
    attack, n_attack_removed = drop_held_out(attack, held_out)

    general = dedupe(load_general_benign_records())
    general, n_general_removed = drop_held_out(general, held_out)

    domain = dedupe([(q, "domain") for q in TRAIN_DOMAIN_BENIGN])
    domain, n_domain_removed = drop_held_out(domain, held_out)
    domain, n_domain_similar = drop_similar(domain, BENIGN_QUERIES, EVAL_SIMILARITY_THRESHOLD)

    print(f"Excluded as evaluation data: {n_attack_removed} attack, {n_general_removed} general benign, "
          f"{n_domain_removed} domain exact, {n_domain_similar} domain near-matches to evaluation queries")
    print(f"Available: {len(attack)} attack, {len(general)} general benign, {len(domain)} domain benign")
    if not attack or not general:
        raise SystemExit("A class is empty. Check the [warn] messages above.")

    n = min(len(attack), len(general) + len(domain))
    if len(domain) > n:
        domain = rng.sample(domain, n)
    general = rng.sample(general, n - len(domain))
    if len(attack) > n:
        attack = rng.sample(attack, n)
    benign = domain + general

    attack_groups = [f"a{g}" for g in near_duplicate_groups([t for t, _ in attack])]
    general_groups = [f"b{g}" for g in near_duplicate_groups([t for t, _ in general])]
    for name, groups in (("attack", attack_groups), ("general benign", general_groups)):
        biggest = max(Counter(groups).values())
        print(f"Largest {name} near-duplicate cluster: {biggest} rows ({biggest / len(groups):.0%} of the class)")
        if biggest / len(groups) > 0.40:
            print(f"[warn] One cluster holds over 40% of the {name} class, so it all lands in train and val/test "
                  f"get little variety. Raise DUP_THRESHOLD (e.g. to 0.90) and re-run.")
    domain_groups = [f"d{i}" for i in range(len(domain))]

    def frame(records, label, groups):
        return pd.DataFrame({"text": [t for t, _ in records], "source": [s for _, s in records],
                             "label": label, "group": groups})

    def assign_splits(f):
        sizes = f.groupby("group").size().to_dict()
        f = f.copy()
        f["split"] = f["group"].map(split_groups(sizes, SEED))
        return f

    df = pd.concat([
        assign_splits(frame(attack, 1, attack_groups)),
        assign_splits(frame(benign, 0, domain_groups + general_groups)),
    ], ignore_index=True)

    os.makedirs(OUT_DIR, exist_ok=True)
    for split in ("train", "val", "test"):
        part = df[df["split"] == split].sample(frac=1, random_state=SEED)[["text", "label", "source"]]
        part.to_csv(os.path.join(OUT_DIR, f"{split}.csv"), index=False)

    counts = df.groupby(["split", "label", "source"]).size().rename("rows").reset_index()
    leakage = leakage_report(df)
    manifest = {
        "seeds_version": SEEDS_VERSION,
        "random_seed": SEED,
        "near_duplicate_threshold": DUP_THRESHOLD,
        "excluded": {"attack": n_attack_removed, "general_benign": n_general_removed,
                     "domain_exact": n_domain_removed, "domain_similar_to_eval": n_domain_similar},
        "rows_per_class": n,
        "counts": counts.to_dict(orient="records"),
        "test_rows_with_near_duplicate_in_train_percent": leakage,
    }
    with open(os.path.join(OUT_DIR, "data_manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)

    print(f"\nWrote train/val/test to {OUT_DIR}  (balanced: {n} attack + {n} benign)")
    print(counts.to_string(index=False))
    print(f"\nTest rows with a near-duplicate in train (excluding domain): {leakage}  <- should be ~0")
    print("Now retrain (defense/tools/train_classifier.py), then re-run calibrate_thresholds.py.")


if __name__ == "__main__":
    main()