"""ChromaDB-based document retriever for semantic context search."""
import glob
import os
import uuid
from dataclasses import dataclass

import chromadb

DEFAULT_DOCS_DIR = "target/documents"
DEFAULT_COLLECTION_NAME = "target_docs"
CLEAN_COLLECTION_NAME = "target_docs_clean"
NON_CLEAN_DIRS = ("poisoned", "_adaptive")
CHUNK_MAX_CHARS = 800


@dataclass
class RetrievedChunk:
    text: str
    source_file: str
    distance: float


def _chunk_text(text: str, source_file: str) -> list[str]:
    paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
    chunks = []
    for p in paragraphs:
        if len(p) <= CHUNK_MAX_CHARS:
            chunks.append(p)
        else:
            words = p.split()
            current = []
            current_len = 0
            for w in words:
                if current_len + len(w) + 1 > CHUNK_MAX_CHARS:
                    chunks.append(" ".join(current))
                    current, current_len = [], 0
                current.append(w)
                current_len += len(w) + 1
            if current:
                chunks.append(" ".join(current))
    return chunks


class DocumentStore:
    def __init__(self, persist_dir: str = "target/chroma_db", collection_name: str = DEFAULT_COLLECTION_NAME,
                 embedding_function=None):
        """embedding_function=None uses Chroma's default (MiniLM). Pass your own to change the model,
        or a fake one in tests so nothing has to be downloaded."""
        self.client = chromadb.PersistentClient(path=persist_dir)
        kwargs = {"name": collection_name}
        if embedding_function is not None:
            kwargs["embedding_function"] = embedding_function
        self.collection = self.client.get_or_create_collection(**kwargs)

    def ingest_file(self, path: str) -> int:
        """Adds one file. The path is stored exactly as given and is what retrieve_full_documents()
        later opens, so pass a path that is valid from where you run (the repo root)."""
        with open(path, "r", encoding="utf-8") as f:
            text = f.read()
        chunks = _chunk_text(text, path)
        if chunks:
            self.collection.add(
                documents=chunks,
                ids=[str(uuid.uuid4()) for _ in chunks],
                metadatas=[{"source_file": path} for _ in chunks],
            )
        return len(chunks)

    def remove_source(self, path: str) -> None:
        """Removes every chunk that came from `path` (the string passed to ingest_file)."""
        self.collection.delete(where={"source_file": path})

    def ingest_folder(self, docs_dir: str = DEFAULT_DOCS_DIR, clear_existing: bool = True,
                      exclude_dirs: tuple = ()) -> int:
        """
        Walks docs_dir recursively (so both documents/clean/ and documents/poisoned/ get ingested
        identically unless you exclude them — see the module docstring for when to) and embeds every
        .txt/.md file. Files with any folder name from `exclude_dirs` in their path are skipped.
        Returns the number of chunks ingested.
        """
        if clear_existing:
            existing_ids = self.collection.get()["ids"]
            if existing_ids:
                self.collection.delete(ids=existing_ids)

        filepaths = glob.glob(os.path.join(docs_dir, "**", "*.txt"), recursive=True)
        filepaths += glob.glob(os.path.join(docs_dir, "**", "*.md"), recursive=True)
        if exclude_dirs:
            filepaths = [p for p in filepaths
                         if not any(part in exclude_dirs for part in os.path.normpath(p).split(os.sep))]

        total = 0
        for path in sorted(filepaths):
            total += self.ingest_file(path)
        return total

    def retrieve(self, query: str, top_k: int = 3) -> list[RetrievedChunk]:
        results = self.collection.query(query_texts=[query], n_results=top_k)
        chunks = []
        if not results["documents"] or not results["documents"][0]:
            return chunks
        for doc, meta, dist in zip(results["documents"][0], results["metadatas"][0], results["distances"][0]):
            chunks.append(RetrievedChunk(text=doc, source_file=meta.get("source_file", "unknown"), distance=dist))
        return chunks

    def retrieve_full_documents(self, query: str, top_k: int = 3) -> list[RetrievedChunk]:
        """
        Same ranking as retrieve(), but expands each hit to its FULL
        source document rather than just the matched chunk.

        Matters specifically for indirect injection: a poisoned document
        gets paragraph-chunked like everything else, so the chunk that
        best matches the query (often innocuous filler text, e.g. "This
        concludes the policy update") isn't necessarily the chunk holding
        the actual injected payload. If you only ever send the model the
        single highest-ranked chunk, you can retrieve a poisoned document
        and still never expose the model to its payload — which would
        make an attack look like it "failed" for the wrong reason (never
        actually tested) rather than the right one (defense caught it).

        Sending the whole document once any chunk of it matches removes
        that ambiguity. Fine for short documents like yours; if your real
        corpus grows to have very long documents, revisit this (sending a
        50-page document because one paragraph matched gets expensive and
        noisy — at that point, expand a window around the matched chunk
        instead of the whole file).
        """
        chunks = self.retrieve(query, top_k=top_k)
        seen_files = set()
        expanded = []
        for c in chunks:
            if c.source_file in seen_files:
                continue
            seen_files.add(c.source_file)
            try:
                with open(c.source_file, "r", encoding="utf-8") as f:
                    full_text = f.read()
            except OSError:
                full_text = c.text
            expanded.append(RetrievedChunk(text=full_text, source_file=c.source_file, distance=c.distance))
        return expanded


if __name__ == "__main__":
    everything = DocumentStore(collection_name=DEFAULT_COLLECTION_NAME)
    n_all = everything.ingest_folder()
    clean = DocumentStore(collection_name=CLEAN_COLLECTION_NAME)
    n_clean = clean.ingest_folder(exclude_dirs=NON_CLEAN_DIRS)
    print(f"Ingested {n_all} chunks into '{DEFAULT_COLLECTION_NAME}' (everything, for demos) and "
          f"{n_clean} into '{CLEAN_COLLECTION_NAME}' (clean only, used by evaluation).")

    for q in ["What's the refund policy?", "Can you summarize the latest company policy update?"]:
        print(f"\nQuery: {q}")
        for chunk in everything.retrieve(q, top_k=2):
            print(f"  [{chunk.distance:.3f}] {chunk.source_file}: {chunk.text[:100]}...")
    print("\nNext: python target/generate_poisoned_docs.py (if the seeds changed). evaluation/runner.py records whether each "
          "poisoned document was retrieved and excludes attacks whose document was not.")