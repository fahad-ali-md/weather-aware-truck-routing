"""Pure risk policy. Values are mph, inches/hour, pounds, and miles."""

import math

LEVELS = ("Low", "Moderate", "High", "Severe", "No Travel")


def classify(wind, rain, snow, load_lb):
    values = (wind, rain, snow)
    if any(v is None or not math.isfinite(v) or v < 0 for v in values):
        return {"level": "Unknown", "score": None, "reason": "Forecast unavailable"}
    wind_score = sum(wind >= n for n in (25, 35, 45, 55))
    rain_score = 4 if rain > 1 else sum(rain >= n for n in (0.10, 0.25, 0.50))
    snow_score = 4 if snow > 3 else sum(snow >= n for n in (0.5, 1, 2))
    reasons = [(wind_score, "Wind"), (rain_score, "Rain"), (snow_score, "Snow")]
    if wind >= 45 and load_lb > 30000:
        reasons.append((4, "Wind + load over 30,000 lb"))
    elif wind >= 35 and load_lb > 40000:
        reasons.append((3, "Wind + load over 40,000 lb"))
    score, reason = max(reasons, key=lambda item: item[0])
    return {"level": LEVELS[score], "score": score, "reason": reason}


def summarize(checkpoints, duration_seconds):
    miles = {level: 0.0 for level in (*LEVELS, "Unknown")}
    weighted = 0.0
    for checkpoint in checkpoints:
        distance = checkpoint["represented_miles"]
        risk = checkpoint["risk"]
        miles[risk["level"]] += distance
        if risk["score"] is not None:
            weighted += risk["score"] * distance
    total = sum(miles.values())
    complete = all(c["risk"]["score"] is not None for c in checkpoints)
    eligible = complete and all(c["risk"]["level"] != "No Travel" for c in checkpoints)
    return {
        "risk_miles": miles,
        "average_risk": weighted / total if complete and total > 0 else None,
        "eligible": eligible,
        "duration_seconds": duration_seconds,
    }


def recommend(summaries):
    eligible = [(i, s) for i, s in enumerate(summaries) if s["eligible"]]
    if not eligible:
        return None
    return min(
        eligible,
        key=lambda item: (
            item[1]["risk_miles"]["Severe"],
            item[1]["risk_miles"]["High"],
            item[1]["average_risk"],
            item[1]["duration_seconds"],
        ),
    )[0]
