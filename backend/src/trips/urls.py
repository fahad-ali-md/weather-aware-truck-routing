from django.urls import path

from . import views

urlpatterns = [
    path("status/", views.status),
    path("routes/", views.routes),
    path("forecast/", views.weather),
    path("rank/", views.rank),
]
