"""Cloudflare WSGI entry point; uses the existing Django application directly."""
import os

from django_cf import DjangoCF
from django.core.wsgi import get_wsgi_application
from workers import WorkerEntrypoint

os.environ["DJANGO_SETTINGS_MODULE"] = "config.settings_cloudflare"
application = get_wsgi_application()


class Default(DjangoCF, WorkerEntrypoint):
    def get_app(self):
        return application
