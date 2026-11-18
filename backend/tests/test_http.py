import asyncio
from types import SimpleNamespace
from unittest.mock import patch

import httpx
import pytest

from integrations.http import ProviderError, _worker_get_many, get_json


def call_with(handler):
    client_type = httpx.Client
    transport = httpx.MockTransport(handler)
    return patch("httpx.Client", side_effect=lambda **kw: client_type(transport=transport, **kw))


@pytest.mark.parametrize("status", [401, 403, 429, 400])
def test_non_transient_error_is_actionable_and_not_retried(status, caplog):
    calls = []

    def handler(request):
        calls.append(request)
        return httpx.Response(status, text="sensitive provider body")

    with call_with(handler), pytest.raises(ProviderError) as caught:
        get_json("https://api.tomtom.com/route", {"key": "secret-test-key"})
    assert len(calls) == 1
    assert f"TomTom returned HTTP {status}" in str(caught.value)
    assert caught.value.status == (429 if status == 429 else 502)
    assert "secret-test-key" not in str(caught.value) + caplog.text
    assert "sensitive provider body" not in caplog.text


@pytest.mark.parametrize("status", [502, 503, 504])
def test_temporary_failure_retries_once_and_can_recover(status):
    calls = []

    def handler(request):
        calls.append(request)
        return httpx.Response(status) if len(calls) == 1 else httpx.Response(200, json={"ok": True})

    with call_with(handler):
        assert get_json("https://api.open-meteo.com/forecast", {}) == {"ok": True}
    assert len(calls) == 2


def test_persistent_failure_stops_after_two_attempts():
    calls = []

    def handler(request):
        calls.append(request)
        raise httpx.ReadTimeout("https://example.com/?key=secret-test-key")

    with call_with(handler), pytest.raises(ProviderError) as caught:
        get_json("https://api.tomtom.com/route", {"key": "secret-test-key"})
    assert len(calls) == 2
    assert "timed out" in str(caught.value)
    assert "secret-test-key" not in str(caught.value)


def test_invalid_json_has_a_separate_error_and_is_not_retried():
    calls = []

    def handler(request):
        calls.append(request)
        return httpx.Response(200, text="not JSON")

    with call_with(handler), pytest.raises(ProviderError, match="invalid response"):
        get_json("https://api.open-meteo.com/forecast", {})
    assert len(calls) == 1


def test_worker_starts_independent_requests_concurrently():
    async def exercise():
        both_started = asyncio.Event()
        calls = []

        async def fetch(url):
            calls.append(url)
            if len(calls) == 2:
                both_started.set()
            await asyncio.wait_for(both_started.wait(), timeout=1)

            async def body():
                return '{"ok": true}'

            return SimpleNamespace(ok=True, text=body)

        with patch.dict("sys.modules", {"workers": SimpleNamespace(fetch=fetch)}):
            results = await _worker_get_many(
                [
                    ("https://api.tomtom.com/one", {"key": "test"}),
                    ("https://api.tomtom.com/two", {"key": "test"}),
                ]
            )
        assert results == [{"ok": True}, {"ok": True}]
        assert len(calls) == 2

    asyncio.run(exercise())
