"""Public API URLs; React is served by Cloudflare's static asset service."""

from django.db import connection
from django.http import JsonResponse
from django.urls import include, path


def health(request):
    return JsonResponse({"status": "ok", "service": "weather-routing", "framework": "Django"})


def ready(request):
    with connection.cursor() as cursor:
        cursor.execute("SELECT 1")
        cursor.fetchone()
    return JsonResponse({"status": "ok", "database": "D1"})


urlpatterns = [
    path("api/health/", health),
    path("api/ready/", ready),
    path("api/", include("trips.urls")),
]
