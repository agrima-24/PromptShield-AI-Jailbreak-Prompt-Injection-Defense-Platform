"""Calibrate perplexity and classifier decision thresholds on benign queries."""
import numpy as np
import pandas as pd
import os, sys
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, ROOT)
DATA_PATH = os.path.join(ROOT, "defense", "data", "val.csv")

from defense.gate import compute_perplexity, classifier_score

TARGET_PERCENTILE = 99


def main():
    df = pd.read_csv(DATA_PATH)
    benign = df[df["label"] == 0]["text"].tolist()
    if len(benign) < 10:
        raise SystemExit(f"Only {len(benign)} benign examples found in {DATA_PATH} — "
                          f"need more for a stable percentile estimate.")

    print(f"Calibrating on {len(benign)} benign queries...\n")

    ppls = [compute_perplexity(t) for t in benign]
    ppl_threshold = float(np.percentile(ppls, TARGET_PERCENTILE))
    print(f"Perplexity: mean={np.mean(ppls):.1f}  p50={np.percentile(ppls,50):.1f}  "
          f"p95={np.percentile(ppls,95):.1f}  max={np.max(ppls):.1f}")
    print(f"  -> suggested PerplexityFilter(threshold={ppl_threshold:.1f})\n")

    probs = [classifier_score(t) for t in benign]
    clf_threshold = float(np.percentile(probs, TARGET_PERCENTILE))
    print(f"Classifier P(attack) on benign: mean={np.mean(probs):.3f}  "
          f"p50={np.percentile(probs,50):.3f}  p95={np.percentile(probs,95):.3f}")
    print(f"  -> suggested Classifier(threshold={max(clf_threshold, 0.5):.3f})")
    print("  (floored at 0.5 — if p95 is already above that, your classifier is "
          "underconfident on benign inputs and needs more/better negative training data, "
          "not a higher threshold to paper over it)\n")

    print("Paste these into gate.py's GateConfig defaults once you're happy with them, "
          "and note in your report that they were calibrated at the "
          f"{TARGET_PERCENTILE}th percentile of a {len(benign)}-query benign set — "
          "that's the number a guide will ask about.")


if __name__ == "__main__":
    main()