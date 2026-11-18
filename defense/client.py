"""Client wrapper for calling the defense gate locally or via remote HTTP API."""
import os
import time
import uuid
from typing import Optional

import requests

UNAVAILABLE_PREFIX = "DEFENSE_UNAVAILABLE"


class RemoteGate:
    def __init__(self, base_url: Optional[str] = None, api_key: Optional[str] = None,
                 config_name: str = "all", timeout_s: Optional[float] = None):
        base_url = base_url or os.environ.get("DEFENSE_URL")
        if not base_url:
            raise ValueError("RemoteGate needs a URL: pass base_url or set DEFENSE_URL.")
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key if api_key is not None else os.environ.get("DEFENSE_API_KEY", "")
        self.config_name = config_name
        self.timeout_s = float(timeout_s if timeout_s is not None else os.environ.get("DEFENSE_TIMEOUT_S", "10"))
        self._session = requests.Session()
        self._session.headers.update({"X-API-Key": self.api_key})

    def _unavailable(self, detail: str, started: float, request_id: str) -> dict:
        return {
            "allowed": False,
            "reason": f"{UNAVAILABLE_PREFIX}: {detail} — failing closed",
            "status": "unavailable",
            "layers": [],
            "total_ms": None,
            "round_trip_ms": round((time.perf_counter() - started) * 1000, 2),
            "request_id": request_id,
        }

    def check_detailed(self, text: str, context: Optional[str] = None,
                       request_id: Optional[str] = None) -> dict:
        rid = request_id or uuid.uuid4().hex
        started = time.perf_counter()
        try:
            resp = self._session.post(
                f"{self.base_url}/check",
                json={"text": text, "context": context, "config": self.config_name, "request_id": rid},
                timeout=self.timeout_s,
            )
        except requests.RequestException as exc:
            return self._unavailable(type(exc).__name__, started, rid)

        if resp.status_code == 401:
            return self._unavailable("HTTP 401, check DEFENSE_API_KEY", started, rid)
        if resp.status_code != 200:
            return self._unavailable(f"HTTP {resp.status_code}", started, rid)
        try:
            data = resp.json()
        except ValueError:
            return self._unavailable("response was not valid JSON", started, rid)
        if not isinstance(data, dict) or not isinstance(data.get("allowed"), bool):
            return self._unavailable("malformed response", started, rid)

        data["status"] = "ok"
        data["round_trip_ms"] = round((time.perf_counter() - started) * 1000, 2)
        data["request_id"] = rid
        return data

    def check(self, text: str, context: Optional[str] = None) -> tuple[bool, str]:
        """Same (allowed, reason) contract as defense.gate.Gate.check."""
        result = self.check_detailed(text, context)
        return result["allowed"], result["reason"]

    def health(self) -> Optional[dict]:
        try:
            resp = self._session.get(f"{self.base_url}/health", timeout=min(self.timeout_s, 5))
            return resp.json() if resp.status_code == 200 else None
        except (requests.RequestException, ValueError):
            return None


class LocalGate:
    """Single-laptop fallback: same interface as RemoteGate, defense runs in this process."""

    def __init__(self, config_name: str = "all"):
        from defense.gate import CONFIGS, Gate

        self.config_name = config_name
        self._gate = Gate(CONFIGS[config_name])

    def check_detailed(self, text: str, context: Optional[str] = None,
                       request_id: Optional[str] = None) -> dict:
        data = self._gate.check_detailed(text, context).to_dict()
        data["status"] = "ok"
        data["round_trip_ms"] = data["total_ms"]
        data["request_id"] = request_id
        return data

    def check(self, text: str, context: Optional[str] = None) -> tuple[bool, str]:
        return self._gate.check(text, context)


def get_gate(config_name: str = "all"):
    """DEFENSE_URL set -> use the defense laptop. Not set -> run the defense locally."""
    if os.environ.get("DEFENSE_URL"):
        return RemoteGate(config_name=config_name)
    return LocalGate(config_name)