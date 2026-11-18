"""Generate poisoned documents for indirect attack evaluation from frozen seeds."""
import glob
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "attacks"))

from seeds import ALL_SEEDS, SEEDS_VERSION  # noqa: E402

OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "documents", "poisoned")


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    indirect_seeds = [s for s in ALL_SEEDS if s.attack_type == "indirect"]
    if not indirect_seeds:
        raise SystemExit("The frozen seed set contains no indirect attacks. Re-freeze it with "
                         "`python attacks/seeds.py --freeze`.")

    stale = glob.glob(os.path.join(OUT_DIR, "*.txt"))
    for path in stale:
        os.remove(path)
    if stale:
        print(f"Removed {len(stale)} old poisoned document(s).")

    for seed in indirect_seeds:
        filename = f"{seed.id.lower()}_poisoned.txt"
        path = os.path.join(OUT_DIR, filename)
        with open(path, "w", encoding="utf-8") as f:
            f.write(seed.poisoned_doc)
        print(f"Wrote {path}")
        print(f"  Triggering query: {seed.prompt}")

    print(f"\n{len(indirect_seeds)} poisoned documents written to {OUT_DIR} (attack set {SEEDS_VERSION}).")
    print("Now rebuild the store: python target/retriever.py")


if __name__ == "__main__":
    main()