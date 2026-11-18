"""Production overrides for Cloudflare Python Workers."""

from workers import env as worker_env

from .settings import *  # noqa: F403

SECRET_KEY = worker_env.DJANGO_SECRET_KEY
TOMTOM_API_KEY = getattr(worker_env, "TOMTOM_API_KEY", "")
DEBUG = False
ALLOWED_HOSTS = [worker_env.DJANGO_ALLOWED_HOST]
ROOT_URLCONF = "config.urls_cloudflare"
DATABASES = {
    "default": {
        "ENGINE": "django_cf.db.backends.d1",
        "CLOUDFLARE_BINDING": "DB",
    }
}
SECURE_SSL_REDIRECT = True
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SECURE_HSTS_SECONDS = 31536000
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True
