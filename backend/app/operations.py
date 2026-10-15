from __future__ import annotations

import json
import logging
import os
import re
import time
import uuid
from collections.abc import Awaitable, Callable
from typing import Any

from starlette.datastructures import MutableHeaders


LOGGER = logging.getLogger("family_travel_log.requests")
REQUEST_ID_PATTERN = re.compile(r"^[A-Za-z0-9._-]{1,64}$")
AsgiApp = Callable[[dict[str, Any], Callable[..., Awaitable[dict[str, Any]]], Callable[..., Awaitable[None]]], Awaitable[None]]


def release_identifier() -> str:
    value = (
        os.getenv("RELEASE_SHA")
        or os.getenv("RENDER_GIT_COMMIT")
        or os.getenv("VERCEL_GIT_COMMIT_SHA")
        or "local"
    )
    return value.strip()[:12] or "local"


class OperationsMiddleware:
    def __init__(self, app: AsgiApp) -> None:
        self.app = app

    async def __call__(self, scope: dict[str, Any], receive: Callable[..., Any], send: Callable[..., Any]) -> None:
        if scope.get("type") != "http":
            await self.app(scope, receive, send)
            return

        request_id = _request_id(scope)
        started_at = time.perf_counter()
        status_code = 500

        async def send_with_headers(message: dict[str, Any]) -> None:
            nonlocal status_code
            if message.get("type") == "http.response.start":
                status_code = int(message.get("status", 500))
                headers = MutableHeaders(scope=message)
                headers["X-Request-ID"] = request_id
                headers["X-Content-Type-Options"] = "nosniff"
                headers["X-Frame-Options"] = "DENY"
                headers["Referrer-Policy"] = "no-referrer"
                headers["Cache-Control"] = "no-store"
            await send(message)

        try:
            await self.app(scope, receive, send_with_headers)
        finally:
            LOGGER.info(
                json.dumps(
                    {
                        "event": "http_request",
                        "request_id": request_id,
                        "method": scope.get("method", ""),
                        "path": scope.get("path", ""),
                        "status": status_code,
                        "duration_ms": round((time.perf_counter() - started_at) * 1000, 2),
                        "release": release_identifier(),
                    },
                    separators=(",", ":"),
                )
            )


def _request_id(scope: dict[str, Any]) -> str:
    for name, value in scope.get("headers", []):
        if name.lower() != b"x-request-id":
            continue
        candidate = value.decode("ascii", errors="ignore").strip()
        if REQUEST_ID_PATTERN.fullmatch(candidate):
            return candidate
    return uuid.uuid4().hex
