# Family Travel Log

Full-stack web app for tracking family trips with route mapping, searchable notes, travel companions, and accommodation details.

## Stack

- Backend: FastAPI + SQLite
- Frontend: React (Vite) + React Leaflet map

## Features

- Create and store trips with:
  - Route waypoints (`lat,lng,label`)
  - Notes
  - People list selected from reusable member profiles
  - Accommodation entries
- Manage reusable member profiles (add/delete once, reuse on every trip form)
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
