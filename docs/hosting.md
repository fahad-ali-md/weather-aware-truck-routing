# Cloudflare Hosting

The React and Django application uses one Cloudflare Worker with static assets and a D1 binding. All backend deployment files live in `backend/`. No separate deployment folder or source-copy step is required.

## Files

- `backend/src/worker.py`: WSGI entry point using Cloudflare's Django adapter.
- `backend/src/config/settings_cloudflare.py`: production settings; reads secrets from Worker bindings.
- `backend/src/config/urls_cloudflare.py`: public health and database readiness endpoints.
- `backend/wrangler.jsonc`: Worker name, account, host, assets, database and upload exclusions.
- `backend/pyproject.toml`: shared dependencies plus `dev` and conventional `server` dependency groups.
- `backend/uv.lock`: local environment lock; `backend/pylock.toml`: generated Python Workers runtime lock.

The generated local Django settings and URLs remain in `backend/src/config/settings.py` and `backend/src/config/urls.py`.

## Resources and status

- Worker name: `weather-routing`.
- D1 database: `weather-routing` (APAC), ID `3f57ae1a-bf1c-43cd-aaf2-381dba3e0893`.
- Secrets: `DJANGO_SECRET_KEY` and `TOMTOM_API_KEY`, stored through Wrangler; never commit their values.
- Frontend build and lint pass. Local Django system checks pass.
- Live URL: https://weather-routing.fahad288ali.workers.dev
- Deployed 2026-11-18; version `0850606a-4bef-4d71-aacd-31d094aa2b89`.
- Verified HTTP 200 for the React page, `/api/health/`, `/api/status/`, a Chicago-to-Detroit routing request returning three routes, and a two-checkpoint weather forecast request.
- Django initializes in the Worker module rather than on each request. Initializing on the first request exceeded the free Worker CPU limit during testing. Monitor CPU and provider quotas as traffic and route complexity grow.
- Application code lives in `backend/src/` so source discovery excludes virtual environments. No source is duplicated. The bundle is approximately 6.26 MiB compressed.

The database has been provisioned, but no application models or production tables have been migrated. The readiness endpoint checks connectivity with `SELECT 1`. Trip calculations do not require stored application data. Django admin is not exposed by the production URL configuration.

## Build and deploy

From `frontend/`:

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm lint
```

From `backend/`:

```sh
uv sync --frozen
uv run python src/manage.py check
uv run pywrangler sync
pnpm dlx --allow-build esbuild --allow-build workerd wrangler@4.164.0 deploy --dry-run
pnpm dlx --allow-build esbuild --allow-build workerd wrangler@4.164.0 deploy
```

Authenticate with `wrangler login` if needed. For a new environment, set production secrets with `wrangler secret put DJANGO_SECRET_KEY` and `wrangler secret put TOMTOM_API_KEY` before serving Django traffic. Update the D1 binding and `DJANGO_ALLOWED_HOST` when deploying to another account or hostname. Do not replace the secrets during routine redeployments.

Verify `/`, `/api/health/`, and `/api/ready/` on the resulting HTTPS address. API requests go to Django; other requests use the static React build and SPA fallback. Wrangler bundles application modules from `backend/src/` and dependencies from `backend/python_modules/`. Keep virtual environments outside `src/`.

## Free hosting constraints

This setup targets Workers Free and D1 Free without containers or a paid plan upgrade. Static asset requests are free; API requests and D1 queries remain subject to account quotas. Test CPU use for longer or more complex routes; successful sample requests do not establish that all analyses fit the free CPU budget. Celery, Redis, PostgreSQL and Gunicorn are not running on Cloudflare. The `server` dependency group retains conventional server packages locally without adding them to the Python Workers runtime.

References: [Django on Python Workers](https://developers.cloudflare.com/workers/languages/python/packages/django/), [static assets](https://developers.cloudflare.com/workers/static-assets/), and [Workers pricing and free limits](https://developers.cloudflare.com/workers/platform/pricing/).
