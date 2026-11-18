"""Stateless endpoints; forecast batches bound each free Worker request."""

import json
from datetime import UTC, datetime, timedelta
from functools import wraps

from django.conf import settings
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from integrations.http import ProviderError
from integrations.weather import forecast, utc_datetime, validate_coordinate

from .risk import LEVELS, recommend, summarize
from .services import plan


def json_endpoint(function):
    @csrf_exempt
    @require_http_methods(["POST"])
    @wraps(function)
    def view(request):
        # Anonymous calculations: no cookies, persisted state, or account data.
        origin = request.headers.get("Origin")
        allowed_origins = {f"{request.scheme}://{request.get_host()}"}
        if settings.DEBUG:
            allowed_origins.update({"http://127.0.0.1:5173", "http://localhost:5173"})
        if origin and origin not in allowed_origins:
            return JsonResponse({"error": "Cross-origin requests are not allowed."}, status=403)
        if request.content_type != "application/json":
            return JsonResponse({"error": "Use application/json."}, status=415)
        if len(request.body) > 250000:
            return JsonResponse({"error": "Request is too large."}, status=413)
        try:
            data = json.loads(request.body)
            if not isinstance(data, dict):
                raise ValueError("Expected a JSON object.")
            timings = {}
            if request.headers.get("X-Performance-Debug") == "1" and function.__name__ in {
                "routes",
                "weather",
            }:
                result = function(data, timings=timings)
            else:
                result = function(data)
            response = JsonResponse(result)
            if timings:
                response["Server-Timing"] = ", ".join(
                    f"{name};dur={duration:.2f}" for name, duration in timings.items()
                )
            return response
        except ProviderError as error:
            return JsonResponse({"error": str(error)}, status=error.status)
        except (ValueError, TypeError, KeyError, OverflowError, AttributeError):
            return JsonResponse(
                {
                    "error": "Invalid trip data. Check addresses, future departure, load and checkpoint spacing."
                },
                status=400,
            )

    return view


def status(request):
    return JsonResponse({"routing_configured": bool(getattr(settings, "TOMTOM_API_KEY", ""))})


@json_endpoint
def routes(data, timings=None):
    return plan(data, timings=timings)


@json_endpoint
def weather(data, timings=None):
    points = data["checkpoints"]
    if not isinstance(points, list) or not 1 <= len(points) <= 12:
        raise ValueError("Forecast batches must contain 1–12 checkpoints.")
    departure = utc_datetime(data["departure"])
    now = datetime.now(UTC)
    if not now - timedelta(hours=1) <= departure <= now + timedelta(hours=48):
        raise ValueError("Departure is outside the forecast horizon.")
    load = float(data["load_lb"])
    if not 0 <= load <= 100000:
        raise ValueError("Invalid load.")
    validated = []
    for point in points:
        eta = utc_datetime(point["eta"])
        if not departure <= eta <= departure + timedelta(days=5):
            raise ValueError("Checkpoint ETA is outside the supported forecast range.")
        validated.append(
            {
                "id": str(point["id"])[:30],
                "lat": validate_coordinate(point["lat"], 90),
                "lon": validate_coordinate(point["lon"], 180),
                "eta": eta.isoformat(),
            }
        )
    return {"checkpoints": forecast(validated, departure, load, timings=timings)}


@json_endpoint
def rank(data):
    routes = data["routes"]
    if not isinstance(routes, list) or not 1 <= len(routes) <= 3:
        raise ValueError("Expected up to three routes.")
    summaries = []
    for route in routes:
        points = route["checkpoints"]
        if not isinstance(points, list) or not 2 <= len(points) <= 240:
            raise ValueError("Invalid checkpoints.")
        for point in points:
            risk = point["risk"]
            if risk["level"] not in (*LEVELS, "Unknown"):
                raise ValueError("Invalid risk level.")
            expected = LEVELS.index(risk["level"]) if risk["level"] in LEVELS else None
            if risk["score"] != expected or not 0 <= float(point["represented_miles"]) <= 50:
                raise ValueError("Invalid checkpoint risk.")
            point["represented_miles"] = float(point["represented_miles"])
        duration = float(route["duration_seconds"])
        if not 0 < duration <= 432000:
            raise ValueError("Invalid duration.")
        summaries.append(summarize(points, duration))
    return {"summaries": summaries, "recommended_index": recommend(summaries)}
