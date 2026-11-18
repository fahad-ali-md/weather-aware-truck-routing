"""Interpolate along road geometry and the provider's cumulative timing profile."""

import bisect
import math
from datetime import timedelta
from itertools import pairwise

METER_PER_MILE = 1609.344


def haversine(a, b):
    lat1, lat2 = math.radians(a[1]), math.radians(b[1])
    dlat, dlon = lat2 - lat1, math.radians(b[0] - a[0])
    value = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 6371000 * 2 * math.asin(min(1, math.sqrt(value)))


def build_route(raw, index, departure, spacing):
    points = [[p["longitude"], p["latitude"]] for leg in raw["legs"] for p in leg["points"]]
    if len(points) < 2:
        raise ValueError("Provider returned incomplete route geometry.")
    geometric = [0.0]
    for previous, current in pairwise(points):
        geometric.append(geometric[-1] + haversine(previous, current))
    summary = raw["summary"]
    length, duration = summary["lengthInMeters"], summary["travelTimeInSeconds"]
    if length <= 0 or duration <= 0 or geometric[-1] <= 0:
        raise ValueError("Origin and destination must be different places.")
    progress = raw.get("progress", [])
    if len(progress) < 2 or any(
        "travelTimeInSeconds" not in p or "distanceInMeters" not in p for p in progress
    ):
        raise ValueError("Routing provider did not return cumulative checkpoint timing.")
    # TomTom specifies geometric-distance interpolation between sparse progress points.
    distances, seconds = [0.0] * len(points), [0.0] * len(points)
    for left, right in pairwise(progress):
        start, end = left["pointIndex"], right["pointIndex"]
        denominator = geometric[end] - geometric[start]
        for i in range(start, end + 1):
            fraction = (geometric[i] - geometric[start]) / denominator if denominator else 0
            distances[i] = left["distanceInMeters"] + fraction * (
                right["distanceInMeters"] - left["distanceInMeters"]
            )
            seconds[i] = left["travelTimeInSeconds"] + fraction * (
                right["travelTimeInSeconds"] - left["travelTimeInSeconds"]
            )
    if progress[0]["pointIndex"] != 0 or progress[-1]["pointIndex"] != len(points) - 1:
        raise ValueError("Routing provider returned an incomplete timing profile.")
    step = spacing * METER_PER_MILE
    targets = [i * step for i in range(math.ceil(length / step))] + [length]
    if len(targets) > 240:
        raise ValueError("This trip has too many checkpoints. Choose 25 or 50 mile spacing.")
    checkpoints = []
    for i, target in enumerate(targets):
        right = min(len(points) - 1, max(1, bisect.bisect_left(distances, target)))
        left = right - 1
        fraction = (
            (target - distances[left]) / (distances[right] - distances[left])
            if distances[right] > distances[left]
            else 0
        )
        fraction = max(0, min(1, fraction))
        lon, lat = [
            points[left][axis] + fraction * (points[right][axis] - points[left][axis])
            for axis in (0, 1)
        ]
        offset = seconds[left] + fraction * (seconds[right] - seconds[left])
        # Voronoi intervals: every road mile is represented exactly once, endpoints included.
        begin = (targets[i - 1] + target) / 2 if i else 0
        end = (target + targets[i + 1]) / 2 if i + 1 < len(targets) else length
        checkpoints.append(
            {
                "id": f"{index}-{i}",
                "lat": lat,
                "lon": lon,
                "mile": target / METER_PER_MILE,
                "represented_miles": (end - begin) / METER_PER_MILE,
                "eta": (departure + timedelta(seconds=offset)).isoformat(),
            }
        )
    # Preserve geometry for sampling; decimate only the map representation.
    stride = max(1, len(points) // 1800)
    display = points[::stride]
    if display[-1] != points[-1]:
        display.append(points[-1])
    return {
        "id": str(index),
        "name": f"Route {index + 1}",
        "miles": length / METER_PER_MILE,
        "duration_seconds": duration,
        "arrival": (departure + timedelta(seconds=duration)).isoformat(),
        "geometry": display,
        "checkpoints": checkpoints,
    }
