from datetime import UTC, datetime, timedelta
from unittest.mock import patch

import pytest

from integrations.weather import forecast, sample, utc_datetime
from trips.checkpoints import METER_PER_MILE, build_route

DEPARTURE = datetime(2026, 11, 18, 12, tzinfo=UTC)


def raw_route():
    return {
        "summary": {"lengthInMeters": 100 * METER_PER_MILE, "travelTimeInSeconds": 7200},
        "legs": [{"points": [{"longitude": i, "latitude": 0} for i in (0, 1, 2)]}],
        "progress": [
            {"pointIndex": 0, "distanceInMeters": 0, "travelTimeInSeconds": 0},
            {"pointIndex": 1, "distanceInMeters": 50 * METER_PER_MILE, "travelTimeInSeconds": 1800},
            {
                "pointIndex": 2,
                "distanceInMeters": 100 * METER_PER_MILE,
                "travelTimeInSeconds": 7200,
            },
        ],
    }


@pytest.mark.parametrize("spacing", [10, 25, 50])
def test_distance_coverage_endpoints_and_nonuniform_eta(spacing):
    route = build_route(raw_route(), 0, DEPARTURE, spacing)
    points = route["checkpoints"]
    assert points[0]["mile"] == 0
    assert points[-1]["mile"] == 100
    assert sum(p["represented_miles"] for p in points) == pytest.approx(100)
    halfway = next(p for p in points if p["mile"] == pytest.approx(50))
    assert datetime.fromisoformat(halfway["eta"]) == DEPARTURE + timedelta(minutes=30)
    assert datetime.fromisoformat(points[-1]["eta"]) == DEPARTURE + timedelta(hours=2)
    assert halfway["lon"] == pytest.approx(1)


def test_sparse_progress_uses_geometry_between_known_times():
    raw = raw_route()
    raw["progress"].pop(1)
    route = build_route(raw, 0, DEPARTURE, 25)
    assert datetime.fromisoformat(route["checkpoints"][1]["eta"]) == DEPARTURE + timedelta(
        minutes=30
    )


def test_missing_progress_fails_instead_of_inventing_eta():
    raw = raw_route()
    raw.pop("progress")
    with pytest.raises(ValueError, match="timing"):
        build_route(raw, 0, DEPARTURE, 25)


def hourly():
    return {
        "time": [(DEPARTURE + timedelta(hours=h)).timestamp() for h in range(3)],
        "wind_speed_10m": [0, 32.18688, 64.37376],
        "rain": [0, 25.4, 0],
        "showers": [0, 2.54, 0],
        "snowfall": [0, 2.54, 0],
    }


def test_weather_converts_units_and_uses_covering_rain_interval():
    result = sample(hourly(), DEPARTURE + timedelta(minutes=30), 0)
    assert result["wind_mph"] == pytest.approx(10)
    assert result["rain_in"] == pytest.approx(1.1)
    assert result["snow_in"] == pytest.approx(1)
    assert result["risk"]["level"] == "No Travel"


def test_exact_hour_does_not_depend_on_previous_missing_wind():
    data = hourly()
    data["wind_speed_10m"][0] = None
    assert sample(data, DEPARTURE + timedelta(hours=1), 0)["wind_mph"] == pytest.approx(20)


@pytest.mark.parametrize("offset", [-1, 3])
def test_no_extrapolation(offset):
    assert sample(hourly(), DEPARTURE + timedelta(hours=offset), 0)["risk"]["level"] == "Unknown"


def test_timezone_is_required_and_normalized():
    assert utc_datetime("2026-11-18T18:00:00+06:00") == DEPARTURE
    with pytest.raises(ValueError, match="timezone"):
        utc_datetime("2026-11-18T12:00:00")


def test_wind_direction_interpolates_across_north_without_reversing():
    data = hourly()
    data["wind_speed_10m"] = [20, 20, 20]
    data["wind_direction_10m"] = [350, 10, 20]
    direction = sample(data, DEPARTURE + timedelta(minutes=30), 0)["wind_direction_deg"]
    assert min(direction, 360 - direction) == pytest.approx(0, abs=1e-8)
    assert sample(data, DEPARTURE + timedelta(hours=1), 0)["wind_direction_deg"] == pytest.approx(
        10
    )


def test_missing_direction_does_not_invent_wind_motion_or_change_risk():
    result = sample(hourly(), DEPARTURE + timedelta(minutes=30), 0)
    assert result["wind_direction_deg"] is None
    assert result["risk"]["level"] == "No Travel"


def test_calm_and_cancelling_vectors_have_no_invented_direction():
    data = hourly()
    data["wind_speed_10m"] = [20, 20, 0]
    data["wind_direction_10m"] = [0, 180, 0]
    assert sample(data, DEPARTURE + timedelta(minutes=30), 0)["wind_direction_deg"] is None
    assert sample(data, DEPARTURE + timedelta(hours=2), 0)["wind_direction_deg"] is None


def test_forecast_includes_direction_in_every_hourly_frame():
    data = {
        "time": [(DEPARTURE + timedelta(hours=h)).timestamp() for h in range(50)],
        "wind_speed_10m": [16.09344] * 50,
        "wind_direction_10m": [270] * 50,
        "rain": [0] * 50,
        "showers": [0] * 50,
        "snowfall": [0] * 50,
    }
    location = {
        "hourly": data,
        "hourly_units": {
            "wind_speed_10m": "km/h",
            "wind_direction_10m": "°",
            "rain": "mm",
            "showers": "mm",
            "snowfall": "cm",
        },
    }
    points = [{"id": "a", "lat": 40, "lon": -80, "eta": DEPARTURE.isoformat()}]
    with patch("integrations.weather.get_json", return_value=location) as request:
        result = forecast(points, DEPARTURE, 0)[0]
    assert "wind_direction_10m" in request.call_args.args[1]["hourly"]
    assert result["wind_direction_deg"] == pytest.approx(270)
    assert len(result["frames"]) == 49
    assert result["frames"][48] == [pytest.approx(10), 0, 0, "Low", pytest.approx(270)]
