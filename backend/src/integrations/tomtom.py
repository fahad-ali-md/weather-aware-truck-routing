from django.conf import settings

from .http import ProviderError, get_json


def api_key():
    key = getattr(settings, "TOMTOM_API_KEY", "")
    if not key:
        raise ProviderError("Live routing is not configured. Add the server's TomTom API key.", 503)
    return key


def geocode(query):
    from urllib.parse import quote

    result = get_json(
        f"https://api.tomtom.com/search/2/geocode/{quote(query, safe='')}.json",
        {"key": api_key(), "limit": 1},
    ).get("results", [])
    if not result:
        raise ProviderError(
            f"No address found for {query}. Try a city and state or full address.", 422
        )
    item = result[0]
    return {
        "label": item["address"].get("freeformAddress", query),
        "lat": item["position"]["lat"],
        "lon": item["position"]["lon"],
    }


def calculate_routes(origin, destination, departure):
    locations = f"{origin['lat']},{origin['lon']}:{destination['lat']},{destination['lon']}"
    result = get_json(
        f"https://api.tomtom.com/routing/1/calculateRoute/{locations}/json",
        {
            "key": api_key(),
            "travelMode": "truck",
            "vehicleCommercial": "true",
            "maxAlternatives": 2,
            "departAt": departure.isoformat(),
            "routeRepresentation": "polyline",
            "traffic": "true",
            "extendedRouteRepresentation": ["distance", "travelTime"],
        },
    )
    routes = result.get("routes", [])
    if not routes:
        raise ProviderError("No truck route was found between these addresses.", 422)
    return routes[:3]
