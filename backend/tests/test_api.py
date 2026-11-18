import json
from datetime import UTC, datetime, timedelta
from unittest.mock import patch

import pytest
from django.test import Client, override_settings

from integrations.http import ProviderError


def post(path, data, **kwargs):
    return Client().post(
        f"/api/{path}/", data=json.dumps(data), content_type="application/json", **kwargs
    )


def trip():
    return {
        "origin": "Chicago IL",
        "destination": "Detroit MI",
        "departure": (datetime.now(UTC) + timedelta(hours=1)).isoformat(),
        "load_lb": 30000,
        "spacing": 25,
    }


@override_settings(TOMTOM_API_KEY="")
def test_missing_key_is_actionable_without_exposing_configuration():
    assert Client().get("/api/status/").json() == {"routing_configured": False}
    response = post("routes", trip())
    assert response.status_code == 503
    assert "TomTom" in response.json()["error"]


@pytest.mark.parametrize("data", [[], {"departure": None}, {"departure": {}}, {"origin": "x"}])
def test_malformed_input_returns_400(data):
    assert post("routes", data).status_code == 400


def test_cross_origin_and_non_json_rejected():
    assert post("routes", trip(), HTTP_ORIGIN="https://elsewhere.example").status_code == 403
    assert Client().post("/api/routes/", data="x", content_type="text/plain").status_code == 415


@override_settings(DEBUG=True, TOMTOM_API_KEY="")
def test_local_frontend_origin_is_allowed_in_development():
    assert post("routes", trip(), HTTP_ORIGIN="http://127.0.0.1:5173").status_code == 503


@override_settings(DEBUG=False)
def test_local_frontend_origin_is_rejected_in_production():
    assert post("routes", trip(), HTTP_ORIGIN="http://127.0.0.1:5173").status_code == 403


def test_forecast_batch_bound_and_nan_coordinates():
    data = {"checkpoints": [{}] * 13, "departure": trip()["departure"], "load_lb": 0}
    assert post("forecast", data).status_code == 400
    data["checkpoints"] = [{"id": "a", "lat": float("nan"), "lon": 0, "eta": data["departure"]}]
    assert post("forecast", data).status_code == 400


def test_provider_failure_is_controlled():
    with patch(
        "trips.services.tomtom.geocode_pair", side_effect=ProviderError("Weather unavailable")
    ):
        response = post("routes", trip())
    assert response.status_code == 502


def test_performance_header_is_opt_in_and_not_in_json():
    def fake_plan(_data, timings=None):
        if timings is not None:
            timings.update({"geocoding": 12.5, "routing": 34.0, "checkpoints": 1.0})
        return {"routes": []}

    with patch("trips.views.plan", side_effect=fake_plan):
        regular = post("routes", trip())
        measured = post("routes", trip(), HTTP_X_PERFORMANCE_DEBUG="1")
    assert "Server-Timing" not in regular
    assert (
        measured["Server-Timing"] == "geocoding;dur=12.50, routing;dur=34.00, checkpoints;dur=1.00"
    )
    assert regular.json() == measured.json() == {"routes": []}


def test_rank_rejects_inconsistent_risk():
    point = {"represented_miles": 1, "risk": {"level": "No Travel", "score": 0}}
    assert (
        post(
            "rank", {"routes": [{"duration_seconds": 100, "checkpoints": [point, point]}]}
        ).status_code
        == 400
    )
