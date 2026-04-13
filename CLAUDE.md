# Project Guidelines

## Stack

- **Backend:** Python + FastAPI, served with uvicorn
- **Frontend:** React 19 + TypeScript + Vite
- **Styling:** Tailwind CSS 4 (Vite plugin, not PostCSS)
- **Deployment:** Raspberry Pi via systemd service

## Running the project

### Development (two terminals)

```bash
# Backend — serves API on :5000
.venv/bin/uvicorn app:app --host 0.0.0.0 --port 5000 --reload

# Frontend — Vite dev server on :5173, proxies /api to :5000
cd frontend && npm run dev
```

### Production

```bash
cd frontend && npm run build && cd ..
uvicorn app:app --host 0.0.0.0 --port 5000
```

The backend serves the SPA from `frontend/dist/` and handles all `/api/*` routes.

## Backend conventions

- Single `app.py` file — keep it flat until it exceeds ~400 lines, then split by resource
- Return plain dicts — FastAPI serializes them automatically
- Use `JSONResponse` with explicit status for error responses
- All API routes are prefixed with `/api/`
- No database — all state is in-memory (polling caches, seen aircraft)
- Background polling runs in an asyncio task started via the FastAPI `lifespan` handler
- HTTP calls use `httpx.AsyncClient` (shared across the lifespan)

## API design

- Single endpoint: `GET /api/flights` returns `{arrivals, departures, meta}`
- Interactive API docs available at `/docs` (Swagger) and `/redoc`

## Project structure

```
app.py                  # FastAPI backend (routes + polling + classification + SPA serving)
requirements.txt        # Python dependencies
.env                    # OpenSky OAuth2 credentials (not committed)
frontend/               # React + TypeScript SPA (see frontend/CLAUDE.md)
```

## Dependencies

Keep dependencies minimal. Before adding a new package, check if the stdlib or existing dependencies already cover the need.

- **Python:** `fastapi`, `uvicorn`, `httpx`, `python-dotenv`
- **Node:** `react`, `react-dom`, `tailwindcss`, `vite`, `typescript`
- No ORM, no Redux, no UI component library, no CSS-in-JS
