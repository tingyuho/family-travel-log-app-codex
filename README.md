# Family Travel Log

Full-stack app for tracking family trips with route mapping, searchable notes, travel companions, accommodations, itineraries, packing lists, and shared web/mobile data.

## Demo

![Family Travel Log dashboard demo](docs/images/family-travel-log-demo.png)

## Source Of Truth

```text
backend/       FastAPI API used by both web and mobile
apps/web/      React + Vite web app
apps/mobile/   Expo React Native mobile app
packages/      Shared TypeScript utilities/types
_archives/     Ignored local archive for legacy migrations and backups
```

`apps/web`, `apps/mobile`, and `backend` are the active source-of-truth folders. The old root-level `frontend` app has been archived under `_archives/` and should not receive new work.

## Supported Production Surfaces

- Browser: `apps/web` (React + Vite) is the only production browser application.
- iOS: `apps/mobile` (Expo React Native) is the supported native application.
- Android: source is retained for future work, but Android is not part of the current release gate.
- Expo Web: not supported. Use `apps/web` for browser development and deployment.

## Stack

- Backend: FastAPI + SQLite locally or Postgres via `DATABASE_URL`
- Web: React (Vite) + React Leaflet map
- Mobile: Expo React Native for iOS using the same backend/database

## Features

- User portal with account registration, username/password login, and per-user trip/profile isolation
- Create and store trips with route waypoints (`lat,lng,label`), notes, people, accommodations, and itinerary entries
- Manage reusable family member profiles and sort their display order
- Manage reusable packing list templates with interactive check-off lists
- Preview forecast or historical weather from trip dates and route stops using Open-Meteo
- Search, sort, and filter trips across title, notes, people, route labels, and accommodations
- Interactive maps with route polylines and trip markers
- Calendar export via Google Calendar links and ICS sharing

## Backend Setup

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

## Security And Session Config

Set these backend environment variables for deployment:

```bash
APP_ENV=production
DATABASE_URL=postgresql://USER:PASSWORD@HOST:PORT/DATABASE
FRONTEND_ORIGINS=https://your-frontend-domain.vercel.app
SESSION_TTL_DAYS=30
```

Production startup fails if `DATABASE_URL` is not PostgreSQL, if `FRONTEND_ORIGINS`
is missing or not HTTPS, or if a localhost/private-network origin is supplied. The
permissive localhost CORS fallback remains available only in development. Start from
`backend/.env.production.example` when configuring the backend host.

`FRONTEND_ORIGINS` supports comma-separated values for multiple domains, for example:

```bash
FRONTEND_ORIGINS=https://your-app.vercel.app,https://your-app.netlify.app
```

Optional password-reset hardening:

```bash
AUTH_LOGIN_RATE_LIMIT_PER_MINUTE=8
PASSWORD_RESET_RATE_LIMIT_PER_MINUTE=4
PASSWORD_RESET_ADMIN_KEY_ENABLED=false
PASSWORD_RESET_KEY=your-private-reset-key
```

The admin reset override is disabled by default and hidden from normal app UI. Only set
`PASSWORD_RESET_ADMIN_KEY_ENABLED=true` for controlled development/admin workflows.

Password-reset email verification requires SMTP configuration. For Gmail, use a Google App Password instead of your normal Gmail password.

```bash
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=your-mailbox@example.com
SMTP_PASSWORD=your-app-password
SMTP_FROM_EMAIL=your-mailbox@example.com
SMTP_USE_TLS=true
PASSWORD_RESET_CODE_TTL_MINUTES=15
```

Location search for route building is proxied through the backend for both web and mobile.
By default it uses Google Places API Text Search so route suggestions match Google Maps more closely.
Configure a server-side Places key, cache TTL, and per-user/IP rate limit:

```bash
GEOCODER_PROVIDER=google_places
GOOGLE_PLACES_API_KEY=your-server-side-google-places-key
GEOCODER_CACHE_TTL_SECONDS=900
GEOCODER_RATE_LIMIT_PER_MINUTE=30
```

For local fallback to OpenStreetMap Nominatim, set `GEOCODER_PROVIDER=nominatim` and provide a contact-friendly `GEOCODER_USER_AGENT`.

Reset flow:

1. User enters `user_id` and clicks **Send Verification Code**.
2. Backend sends a code to the email on that user profile.
3. User enters the code + new password to complete reset.

## Optional Seed User

The app does not create a default user by default. To create one intentionally, set both seed variables before starting the backend:

```bash
$env:SEED_USER_ID="local-admin"
$env:SEED_USER_PASSWORD="use-a-strong-development-password"
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
5. Deploy web/mobile clients with their API base URL set to the deployed backend.

## Web App Setup

```bash
npm install
npm run web:dev
```

The web app lives in `apps/web`. During local development, it falls back to `http://127.0.0.1:8000` for the API.

For deployed frontend builds, set:

```bash
VITE_API_BASE_URL=https://your-render-service.onrender.com
```

The production build fails when this variable is missing, uses HTTP, contains a path,
or points at localhost/a private LAN address. See `apps/web/.env.production.example`.

## Mobile App Setup

```bash
npm run mobile:start
```

The mobile app lives in `apps/mobile` and uses the same FastAPI backend as the web app.

For iOS Simulator, the default API URL is `http://127.0.0.1:8000`. For a physical iPhone, create `apps/mobile/.env` and set:

```bash
EXPO_PUBLIC_API_BASE_URL=http://YOUR_COMPUTER_LAN_IP:8000
```

For the native interactive map, use the custom development build instead of Expo Go:

```bash
npm run mobile:build:ios:dev
npm run mobile:start:dev-client
```

To use the Google Maps provider on iOS, create `GOOGLE_MAPS_API_KEY` in the EAS `development` environment with `sensitive` visibility before running `mobile:build:ios:dev`. After adding or changing that key, rebuild and reinstall the development build; a Metro reload cannot add the native Google Maps iOS pod to an already-installed client.

For App Store builds, the `production` EAS profile selects the EAS `production`
environment. Create its API value with your real deployed backend origin:

```bash
cd apps/mobile
eas env:create --environment production --name EXPO_PUBLIC_API_BASE_URL --value https://api.your-domain.example --visibility plaintext
```

Production iOS configuration fails before bundling if this value is missing, uses
HTTP, or points to localhost/a private LAN address. `apps/mobile/.env.production.example`
lists the production variables without containing real credentials.

## Production Environment Gate

Use a harmless public test origin to exercise the build locally without pretending it
is your deployed service:

```powershell
$env:VITE_API_BASE_URL="https://api.example.invalid"
npm run web:build

$env:APP_ENV="production"
$env:EAS_BUILD_PROFILE="production"
$env:EXPO_PUBLIC_API_BASE_URL="https://api.example.invalid"
npm run mobile:export:ios
```

`npm run release:check` performs those simulated-production builds automatically and
scans the generated browser and iOS artifacts. It fails if the expected HTTPS API
origin is absent or a localhost/private-LAN API URL is embedded. Override the harmless
test origin with `RELEASE_CHECK_API_BASE_URL` when validating a real release candidate.

## Production Deployment

The repository includes a Render Blueprint (`render.yaml`), Vercel configuration
(`vercel.json`), protected GitHub Actions release workflows, and an EAS App Store profile.
Follow [DEPLOYMENT.md](DEPLOYMENT.md) for the Phase 3 backend/PostgreSQL deployment,
Phase 4 browser deployment and verification, Phase 5 iOS build/submission workflow,
and Phase 6 operational handoff. Day-two monitoring, backup, rollback, and incident
procedures live in [OPERATIONS.md](OPERATIONS.md).

Useful production commands:

```bash
npm run release:ios:preflight
npm run production:verify
npm run security:secrets
npm run backend:backup
npm run mobile:build:ios:production
npm run mobile:submit:ios:production
```

If your terminal is already inside `apps/mobile`, the same root-style aliases are also available there.

## Useful Commands

```bash
npm run web:dev
npm run web:build
npm run web:test
npm run backend:dev
npm run backend:test
npm run backend:test:postgres
npm run mobile:start
npm run mobile:build:ios:dev
npm run mobile:build:ios:production
npm run mobile:export:ios
npm run release:ios:preflight
npm run production:verify
npm run release:check
```

`npm run release:check` runs the production browser build/tests, mobile typecheck/tests,
a production-configured iOS bundle export, artifact URL scanning, backend configuration
tests, backend compile/import checks, and backend API smoke checks. Android and Expo Web
are intentionally outside the current release gate.

`npm run backend:test:postgres` is opt-in and requires `POSTGRES_TEST_DATABASE_URL` pointing at a disposable Postgres database.
