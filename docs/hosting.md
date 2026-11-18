# Cloudflare Hosting

The React and Django starter uses one Cloudflare Worker with static assets and a D1 binding. All backend deployment files live in `backend/`. No separate deployment folder or source-copy step is required.

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
- Secret: `DJANGO_SECRET_KEY`, stored through Wrangler; never commit its value.
- Frontend build and lint pass. Local Django system checks pass.
- Live URL: https://weather-routing.fahad288ali.workers.dev
- Deployed 2026-11-18; version `aa27002d-0701-46f8-96bc-aaa72015120d`.
- Verified HTTP 200 for the React page, its JavaScript asset, `/api/health/`, and `/api/ready/`. The first readiness request returned Worker error 1101; two subsequent requests passed. This initial failure remains unexplained and should be monitored.
- Application code lives in `backend/src/` so source discovery excludes virtual environments. No source is duplicated. The bundle is approximately 6.26 MiB compressed.

The database has been provisioned, but no application models or production tables have been migrated. The readiness endpoint checks connectivity with `SELECT 1`. The current deployment exposes only starter functionality; truck routing and weather analysis are not implemented. Django admin is not exposed by the production URL configuration.

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

Authenticate with `wrangler login` if needed. For a new environment, set the production secret with `wrangler secret put DJANGO_SECRET_KEY` before serving Django traffic. Update the D1 binding and `DJANGO_ALLOWED_HOST` when deploying to another account or hostname. Do not replace the secret during routine redeployments.

Verify `/`, `/api/health/`, and `/api/ready/` on the resulting HTTPS address. API requests go to Django; other requests use the static React build and SPA fallback. Wrangler bundles application modules from `backend/src/` and dependencies from `backend/python_modules/`. Keep virtual environments outside `src/`.

## Free hosting constraints

This setup targets Workers Free and D1 Free without containers or a paid plan upgrade. Static asset requests are free; API requests and D1 queries remain subject to account quotas. Validate CPU use as routing features are implemented; a working starter does not establish that future analyses fit the free CPU budget. Celery, Redis, PostgreSQL and Gunicorn are not running on Cloudflare. The `server` dependency group retains conventional server packages locally without adding them to the Python Workers runtime.

References: [Django on Python Workers](https://developers.cloudflare.com/workers/languages/python/packages/django/), [static assets](https://developers.cloudflare.com/workers/static-assets/), and [Workers pricing and free limits](https://developers.cloudflare.com/workers/platform/pricing/).
