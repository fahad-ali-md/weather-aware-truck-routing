"""Bounded JSON transport for CPython and Cloudflare's Pyodide runtime."""

import json
import logging
import sys
from urllib.parse import urlencode, urlsplit

logger = logging.getLogger(__name__)


class ProviderError(Exception):
    def __init__(self, message, status=502, *, retryable=False):
        self.status = status
        self.retryable = retryable
        super().__init__(message)


def _rejected(provider, status):
    if status in (401, 403):
        detail = "Check the server API key and its access permissions."
    elif status == 429:
        detail = "Request limit reached. Wait before retrying; check the provider quota."
    elif status >= 500:
        detail = "The provider is temporarily unavailable. Please retry shortly."
    else:
        detail = "The provider rejected the request. Check the trip inputs."
    return ProviderError(
        f"{provider} returned HTTP {status}. {detail}",
        status=429 if status == 429 else 502,
        retryable=status in (502, 503, 504),
    )


def _get_once(url, provider):
    try:
        if sys.platform == "emscripten":
            from pyodide.ffi import run_sync
            from workers import fetch

            async def request():
                response = await fetch(url)
                if not response.ok:
                    raise _rejected(provider, response.status)
                body = await response.text()
                if len(body) > 6_000_000:
                    raise ProviderError("Provider response is too large. Try a shorter trip.")
                return json.loads(body)

            return run_sync(request())
        import httpx

        with httpx.Client(timeout=35) as client:
            with client.stream("GET", url) as response:
                if response.status_code != 200:
                    raise _rejected(provider, response.status_code)
                body = bytearray()
                for chunk in response.iter_bytes():
                    body.extend(chunk)
                    if len(body) > 6_000_000:
                        raise ProviderError("Provider response is too large. Try a shorter trip.")
                return json.loads(body)
    except ProviderError:
        raise
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise ProviderError(f"{provider} returned an invalid response. Please retry.") from None
    except Exception:
        # Never expose a provider URL: TomTom keys are query parameters.
        raise ProviderError(
            f"{provider} could not be reached or timed out. Please retry.", retryable=True
        ) from None


def get_json(base, params):
    provider = {
        "api.tomtom.com": "TomTom",
        "api.open-meteo.com": "Open-Meteo",
    }.get(urlsplit(base).hostname, "External provider")
    url = base + "?" + urlencode(params, doseq=True)
    # These are read-only GETs. Retry one temporary outage; never retry key or quota errors.
    for attempt in range(2):
        try:
            return _get_once(url, provider)
        except ProviderError as error:
            # Only controlled messages: never log the URL, key, response body or exception repr.
            logger.warning("%s", error)
            if attempt == 1 or not error.retryable:
                raise
