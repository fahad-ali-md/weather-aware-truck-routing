import math

import pytest

from trips.risk import classify, recommend, summarize


@pytest.mark.parametrize(
    "wind,score",
    [(0, 0), (24.99, 0), (25, 1), (34.99, 1), (35, 2), (44.99, 2), (45, 3), (54.99, 3), (55, 4)],
)
def test_wind_boundaries(wind, score):
    assert classify(wind, 0, 0, 0)["score"] == score


@pytest.mark.parametrize(
    "rain,score",
    [(0.099, 0), (0.1, 1), (0.249, 1), (0.25, 2), (0.499, 2), (0.5, 3), (1, 3), (1.001, 4)],
)
def test_rain_boundaries(rain, score):
    assert classify(0, rain, 0, 0)["score"] == score


@pytest.mark.parametrize(
    "snow,score", [(0.499, 0), (0.5, 1), (0.999, 1), (1, 2), (1.999, 2), (2, 3), (3, 3), (3.001, 4)]
)
def test_snow_boundaries(snow, score):
    assert classify(0, 0, snow, 0)["score"] == score


@pytest.mark.parametrize(
    "wind,load,score",
    [
        (45, 30000, 3),
        (45, 30001, 4),
        (54.9, 30001, 4),
        (35, 40000, 2),
        (35, 40001, 3),
        (44.9, 40001, 3),
        (34.9, 50000, 1),
        (55, 0, 4),
    ],
)
def test_load_rules(wind, load, score):
    assert classify(wind, 0, 0, load)["score"] == score


@pytest.mark.parametrize("invalid", [None, math.nan, math.inf, -1])
def test_missing_or_invalid_weather_is_unknown(invalid):
    assert classify(0, invalid, 0, 0)["level"] == "Unknown"


def checkpoint(miles, wind=0, rain=0):
    return {"represented_miles": miles, "risk": classify(wind, rain, 0, 0)}


def test_worst_condition_wins_and_distance_is_weighted():
    summary = summarize([checkpoint(5, rain=0.6), checkpoint(95)], 3600)
    assert summary["risk_miles"]["Severe"] == 5
    assert summary["average_risk"] == 0.15
    assert sum(summary["risk_miles"].values()) == 100


@pytest.mark.parametrize("hazard", [checkpoint(0, wind=55), checkpoint(0, rain=None)])
def test_endpoint_hazard_excludes_even_zero_represented_miles(hazard):
    assert not summarize([checkpoint(100), hazard], 3600)["eligible"]


def test_lexicographic_ranking_and_exclusions():
    summaries = [
        summarize([checkpoint(1, wind=45), checkpoint(99)], 100),
        summarize([checkpoint(80, wind=35), checkpoint(20)], 200),
        summarize([checkpoint(1, wind=55), checkpoint(99)], 10),
    ]
    assert recommend(summaries) == 1  # zero Severe miles beats shorter, lower average
    assert recommend([summaries[2]]) is None
    assert recommend([summarize([checkpoint(100)], 200), summarize([checkpoint(100)], 100)]) == 1


def test_high_miles_then_average_before_duration():
    high = summarize([checkpoint(1, wind=35), checkpoint(99)], 100)
    moderate = summarize([checkpoint(100, wind=25)], 200)
    assert recommend([high, moderate]) == 1
    low = summarize([checkpoint(100)], 300)
    assert recommend([moderate, low]) == 1
