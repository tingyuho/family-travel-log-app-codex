# Family Travel Log

Full-stack web app for tracking family trips with route mapping, searchable notes, travel companions, and accommodation details.

## Stack

- Backend: FastAPI + SQLite locally or Postgres via `DATABASE_URL`
- Frontend: React (Vite) + React Leaflet map

## Features

- User portal with:
  - account registration
  - username/password login
  - per-user trip and profile isolation
- Create and store trips with:
  - Route waypoints (`lat,lng,label`)
  - Notes
  - People list selected from reusable member profiles
  - Accommodation entries
- Manage reusable member profiles (add/delete once, reuse on every trip form)
- Manage reusable packing list templates with interactive check-off lists
- Automatically preview forecast or historical weather from trip dates and route stops using Open-Meteo
- Search across title, notes, people, route labels, and accommodations
- Interactive map with route polylines and trip markers
- Delete trips

## Backend setup

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

API base URL: `http://127.0.0.1:8000`

Health checks:
- `GET /health` basic API liveness
- `GET /health/db` DB connectivity check (returns active DB mode: `sqlite` or `postgres`)

## Database

The backend uses SQLite locally when `DATABASE_URL` is not set. For cloud deployment, set `DATABASE_URL` to a hosted Postgres connection string, for example:

```bash
DATABASE_URL=postgresql://USER:PASSWORD@HOST:PORT/DATABASE
```

On startup, the backend creates the required tables and indexes in Postgres.

## Security and session config

Set these backend environment variables for deployment:

```bash
FRONTEND_ORIGINS=https://your-frontend-domain.vercel.app
SESSION_TTL_DAYS=30
```

`FRONTEND_ORIGINS` supports comma-separated values for multiple domains, for example:

```bash
FRONTEND_ORIGINS=https://your-app.vercel.app,https://your-app.netlify.app
```

Optional password-reset hardening:

```bash
PASSWORD_RESET_KEY=your-private-reset-key
```

If `PASSWORD_RESET_KEY` is set, users must provide the same key in the reset form to complete a password reset.

## Optional seed user

The app does not create a default user by default. To create one intentionally, set both seed variables before starting the backend:

```bash
$env:SEED_USER_ID="tyhotw"
$env:SEED_USER_PASSWORD="Ilove1234@6"
```

If you are migrating an older local database that has records without a user owner, also set:

```bash
$env:SEED_CLAIM_LEGACY_RECORDS="true"
```

To copy the current local SQLite records into hosted Postgres:

```bash
cd backend
set DATABASE_URL=postgresql://USER:PASSWORD@HOST:PORT/DATABASE
.\.venv\Scripts\python.exe migrate_sqlite_to_postgres.py
```

Recommended migration order for production:

1. Create hosted Postgres (Neon/Supabase).
2. Set `DATABASE_URL` locally to that hosted database.
3. Run `migrate_sqlite_to_postgres.py` once.
4. Set the same `DATABASE_URL` in Render and deploy backend.
5. Deploy frontend with `VITE_API_BASE_URL` set to Render API URL.

## Frontend setup

```bash
cd frontend
npm install
npm run dev
```

Frontend URL: `http://127.0.0.1:5173`

For local development, frontend falls back to `http://127.0.0.1:8000`.  
For deployed frontend builds (Vercel/Netlify), you must set:

```bash
VITE_API_BASE_URL=https://your-render-service.onrender.com
```
