# Project Architecture

React + Django monorepo. Reuse existing folders and create modules only when their functionality is implemented. Backend deployment files live beside the application; no separate deployment tree or copied Django source is needed.

```text
weather/
├── AGENTS.md
├── .gitignore
├── frontend/
│   ├── package.json
│   ├── pnpm-lock.yaml
│   ├── vite.config.ts
│   ├── public/
│   └── src/
├── backend/
│   ├── pyproject.toml
│   ├── uv.lock
│   ├── pylock.toml              # Python Workers runtime dependency lock
│   ├── wrangler.jsonc          # Worker, static assets and D1 binding
│   └── src/                    # Uploadable application code only
│       ├── manage.py
│       ├── worker.py           # Cloudflare WSGI adapter
│       ├── config/             # Local and Cloudflare Django settings/URLs
│       └── trips/              # Generated Django application
│           └── migrations/
└── docs/
    ├── architecture.md
    └── hosting.md
```

## Deployment boundaries

Cloudflare serves the React build directly and dispatches `/api/*` to Django through WSGI. Production settings disable debug mode, load the secret from Cloudflare, restrict the host, and bind the Django ORM to D1 through django-cf. The generated local configuration remains available for conventional Django development.

`backend/pyproject.toml` is the only Python dependency manifest. Runtime dependencies must support Python Workers. The `server` dependency group retains Celery, Gunicorn and PostgreSQL support for conventional development without uploading them to Workers. uv installs the `dev` and `server` groups by default. `uv.lock` locks the local environment; pywrangler generates `pylock.toml` for the Pyodide target. Generated virtual environments and vendored packages are ignored.

## Implementation boundaries

Keep API views thin. Put orchestration in services, database reads in selectors, and risk calculations in pure Python. Add routing, weather and integration modules when implementing those capabilities. Organize React features around trip planning, route comparison and the weather map as those screens are built.

The starter does not yet implement trip analysis, provider integrations, background jobs, or database models. PostgreSQL, Redis and Celery are conventional-server options; they are not services in this free Cloudflare deployment. Choose a supported background execution mechanism before adding asynchronous analyses.
