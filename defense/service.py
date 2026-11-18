"""FastAPI service exposing the defense gate with API-key authentication and audit logging."""
import hashlib
import json
import logging
import os
import secrets
import sys
import threading
import time
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from pydantic import BaseModel

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from defense.gate import (  # noqa: E402
    CLASSIFIER_MODEL_DIR,
    CONFIGS,
    Gate,
    GateDecision,
    LayerResult,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("defense.service")

MAX_TEXT_CHARS = int(os.environ.get("DEFENSE_MAX_TEXT_CHARS", "20000"))
MAX_CONTEXT_CHARS = int(os.environ.get("DEFENSE_MAX_CONTEXT_CHARS", "50000"))

AUDIT_LOG_PATH = Path(os.environ.get("DEFENSE_AUDIT_LOG", ROOT / "defense" / "logs" / "audit.jsonl"))
GENESIS_HASH = "0" * 64



def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds")


def _sha256(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8", errors="replace")).hexdigest()


def _canonical(record: dict) -> str:
    return json.dumps(record, sort_keys=True, ensure_ascii=True)


class AuditLog:
    """
    Append-only JSONL log where every entry stores the hash of the previous one.

    The previous hash is read from the end of the file on EVERY append instead of
    being cached in memory. A cached value goes stale if a second process (for
    example an old instance still finishing a request during a restart) writes to
    the same file, which would fork the chain and look like tampering. Still run a
    single service instance: two processes appending in the same microsecond
    could race.
    """

    def __init__(self, path: Path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        self._read_last_hash()

    def _read_last_hash(self) -> str:
        if not self.path.exists():
            return GENESIS_HASH
        with self.path.open("rb") as f:
            f.seek(0, os.SEEK_END)
            position = f.tell()
            if position == 0:
                return GENESIS_HASH
            data = b""
            while position > 0:
                step = min(4096, position)
                position -= step
                f.seek(position)
                data = f.read(step) + data
                if b"\n" in data.rstrip(b"\r\n"):
                    break
        last_line = data.rstrip(b"\r\n").split(b"\n")[-1]
        try:
            return json.loads(last_line.decode("utf-8"))["entry_hash"]
        except (ValueError, KeyError) as exc:
            raise RuntimeError(
                f"The last entry of {self.path} is unreadable. Move the file aside "
                f"(keep it as evidence) and restart to begin a new log."
            ) from exc

    def append(self, record: dict) -> str:
        with self._lock:
            record = {**record, "prev_hash": self._read_last_hash()}
            entry_hash = _sha256(_canonical(record))
            line = _canonical({**record, "entry_hash": entry_hash})
            with self.path.open("a", encoding="utf-8", newline="\n") as f:
                f.write(line + "\n")
            return entry_hash


def verify_chain(path: Path):
    """Returns (intact, entries_checked, first_bad_line_number_or_None)."""
    path = Path(path)
    if not path.exists():
        return True, 0, None
    prev = GENESIS_HASH
    checked = 0
    with path.open("r", encoding="utf-8") as f:
        for line_no, line in enumerate(f, start=1):
            if not line.strip():
                continue
            try:
                entry = json.loads(line)
                claimed = entry.pop("entry_hash")
            except (ValueError, KeyError):
                return False, checked, line_no
            if entry.get("prev_hash") != prev or _sha256(_canonical(entry)) != claimed:
                return False, checked, line_no
            prev = claimed
            checked += 1
    return True, checked, None



def _require_api_key() -> str:
    key = os.environ.get("DEFENSE_API_KEY", "")
    if len(key) < 12:
        raise RuntimeError("Set DEFENSE_API_KEY (at least 12 characters) before starting the defense service.")
    return key


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.api_key = _require_api_key()
    app.state.audit = AuditLog(AUDIT_LOG_PATH)
    app.state.gates = {name: Gate(cfg) for name, cfg in CONFIGS.items()}

    logger.info("Loading models and warming up (this can take a while on CPU)...")
    warm = app.state.gates["all"]
    for _ in range(2):
        warm.check_detailed("warm-up request", context="warm-up context")
    logger.info("Ready. Configs: %s | audit log: %s", sorted(app.state.gates), AUDIT_LOG_PATH)
    yield


app = FastAPI(title="Prompt-injection defense service", lifespan=lifespan)


def _client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def verify_api_key(request: Request, x_api_key: Optional[str] = Header(default=None)) -> None:
    expected = request.app.state.api_key
    if not x_api_key or not secrets.compare_digest(x_api_key.encode("utf-8"), expected.encode("utf-8")):
        request.app.state.audit.append({
            "event": "unauthorized", "ts": _utc_now(),
            "client": _client_ip(request), "path": request.url.path,
        })
        raise HTTPException(status_code=401, detail="invalid or missing API key")


class CheckRequest(BaseModel):
    text: str
    context: Optional[str] = None
    config: str = "all"
    request_id: Optional[str] = None


def _limit_violation(text: str, context: Optional[str]) -> Optional[str]:
    if len(text) > MAX_TEXT_CHARS:
        return f"query is {len(text)} characters (limit {MAX_TEXT_CHARS})"
    if context is not None and len(context) > MAX_CONTEXT_CHARS:
        return f"retrieved context is {len(context)} characters (limit {MAX_CONTEXT_CHARS})"
    return None


@app.get("/health")
def health(request: Request):
    return {
        "status": "ok",
        "configs": sorted(request.app.state.gates),
        "classifier_checkpoint_found": Path(CLASSIFIER_MODEL_DIR).is_dir(),
        "limits": {"max_text_chars": MAX_TEXT_CHARS, "max_context_chars": MAX_CONTEXT_CHARS},
    }


@app.post("/check", dependencies=[Depends(verify_api_key)])
def check(req: CheckRequest, request: Request):
    gates = request.app.state.gates
    audit: AuditLog = request.app.state.audit
    if req.config not in gates:
        raise HTTPException(status_code=400, detail=f"unknown config '{req.config}'. Available: {sorted(gates)}")

    started = time.perf_counter()
    try:
        violation = _limit_violation(req.text, req.context)
        if violation:
            decision = GateDecision(
                False, f"blocked by input limits: {violation}",
                [LayerResult("input_limits", False, violation)], 0.0,
            )
        else:
            decision = gates[req.config].check_detailed(req.text, req.context)
    except Exception as exc:
        logger.exception("defense check failed")
        audit.append({
            "event": "error", "ts": _utc_now(), "client": _client_ip(request),
            "config": req.config, "request_id": req.request_id, "error": repr(exc),
        })
        raise HTTPException(status_code=500, detail="defense internal error") from exc

    service_ms = round((time.perf_counter() - started) * 1000, 2)
    body = decision.to_dict()
    entry_hash = audit.append({
        "event": "check", "ts": _utc_now(), "client": _client_ip(request),
        "config": req.config, "request_id": req.request_id,
        "allowed": body["allowed"], "reason": body["reason"], "layers": body["layers"],
        "total_ms": body["total_ms"], "service_ms": service_ms,
        "text": req.text, "text_sha256": _sha256(req.text),
        "context_chars": len(req.context) if req.context else 0,
        "context_sha256": _sha256(req.context) if req.context else None,
        "context_preview": req.context[:300] if req.context else None,
    })
    body.update({"config": req.config, "service_ms": service_ms,
                 "request_id": req.request_id, "audit_hash": entry_hash})
    return body


@app.get("/audit/verify", dependencies=[Depends(verify_api_key)])
def audit_verify(request: Request):
    intact, entries, first_bad_line = verify_chain(request.app.state.audit.path)
    return {"chain_intact": intact, "entries": entries, "first_bad_line": first_bad_line}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host=os.environ.get("DEFENSE_HOST", "0.0.0.0"),
                port=int(os.environ.get("DEFENSE_PORT", "8000")))