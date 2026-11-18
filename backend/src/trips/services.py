from datetime import UTC, datetime, timedelta

from integrations import tomtom
from integrations.weather import utc_datetime

from .checkpoints import build_route


def trip_input(data):
    origin, destination = (
        str(data.get("origin", "")).strip(),
        str(data.get("destination", "")).strip(),
    )
    if not 2 <= len(origin) <= 180 or not 2 <= len(destination) <= 180:
        raise ValueError("Enter an origin and destination between 2 and 180 characters.")
    departure = utc_datetime(data.get("departure", ""))
    now = datetime.now(UTC)
    if departure < now - timedelta(minutes=5) or departure > now + timedelta(hours=48):
        raise ValueError("Choose a departure within the next 48 hours.")
    load = float(data.get("load_lb", 0))
    if not 0 <= load <= 100000:
        raise ValueError("Load must be between 0 and 100,000 lb.")
    spacing = int(data.get("spacing", 25))
    if spacing not in (10, 25, 50):
        raise ValueError("Checkpoint spacing must be 10, 25, or 50 miles.")
    return origin, destination, departure, load, spacing


def plan(data):
    origin, destination, departure, load, spacing = trip_input(data)
    start, end = tomtom.geocode(origin), tomtom.geocode(destination)
    raw_routes = tomtom.calculate_routes(start, end, departure)
    routes, seen = [], set()
    for raw in raw_routes:
        route = build_route(raw, len(routes), departure, spacing)
        fingerprint = tuple(tuple(point) for point in route["geometry"])
        if fingerprint not in seen:
            seen.add(fingerprint)
            routes.append(route)
    if not routes:
        raise ValueError("No distinct routes were returned.")
    return {
        "origin": start,
        "destination": end,
        "departure": departure.isoformat(),
        "load_lb": load,
        "spacing": spacing,
        "routes": routes,
        "warnings": (
            [
                f"TomTom returned {len(routes)} distinct route(s); three alternatives are not available for every trip."
            ]
            if len(routes) < 3
            else []
        ),
    }
