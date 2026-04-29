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

## Database

The backend uses SQLite locally when `DATABASE_URL` is not set. For cloud deployment, set `DATABASE_URL` to a hosted Postgres connection string, for example:

```bash
DATABASE_URL=postgresql://USER:PASSWORD@HOST:PORT/DATABASE
```

On startup, the backend creates the required tables and indexes in Postgres.

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

## Frontend setup

```bash
cd frontend
npm install
npm run dev
```

Frontend URL: `http://127.0.0.1:5173`

The frontend calls `http://127.0.0.1:8000` by default. Override with:

```bash
set VITE_API_BASE_URL=http://127.0.0.1:8000
```
