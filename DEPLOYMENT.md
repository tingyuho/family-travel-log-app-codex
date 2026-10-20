# Production Deployment Runbook

The supported production surfaces are the FastAPI backend, the Vite browser app,
and the Expo iOS app. Android and Expo Web are outside this release.

## Phase 3 — PostgreSQL and FastAPI

The existing deployment uses `family-travel-log-app-codex.onrender.com` and the Neon
`family-trip-app` PostgreSQL project. Reuse these resources for this release rather
than applying the new-install Blueprint and creating a second database. The existing
browser domain is `family-travel-log-app-codex.vercel.app`. Vercel must build from the
repository root so it can use the workspaces and root `vercel.json`; remove any legacy
`frontend` root-directory override in the project settings.

Before updating the existing backend, create a Neon recovery branch and validate
startup/contract behavior on an isolated database branch. Never use the production
connection for `backend:test:postgres`.

1. In Render, create a Blueprint from this repository's `render.yaml`.
2. Supply `FRONTEND_ORIGINS` with the final HTTPS browser origin. Render creates
   `family-travel-log-db` and injects its connection string into the API service.
3. Supply `GOOGLE_PLACES_API_KEY` and the SMTP variables if location search and
   password-reset email are enabled.
4. Wait for `/health/db` to report `{"status":"ok","database":"postgres"}`.
5. If existing SQLite data must be retained, run `backend/migrate_sqlite_to_postgres.py`
   once with the hosted `DATABASE_URL` before allowing production writes.

The API refuses to start in production without PostgreSQL and explicit HTTPS CORS
origins. Render uses `/health/db`, so a disconnected database also fails health checks.

## Phase 4 — Browser application

1. Import the repository into Vercel. The root `vercel.json` installs the monorepo,
   builds `apps/web`, and publishes `apps/web/dist`.
2. Create production variable `VITE_API_BASE_URL` with the Render API origin.
3. Deploy, then update Render's `FRONTEND_ORIGINS` to the exact Vercel/custom origin
   and redeploy the backend if the value changed.
4. Verify the pair locally:

   ```powershell
   $env:PRODUCTION_WEB_BASE_URL="https://travel.example.com"
   $env:PRODUCTION_API_BASE_URL="https://api.example.com"
   npm run production:verify
   ```

The same check is available as the manually dispatched **Verify production deployment**
GitHub Actions workflow. It validates API health, PostgreSQL, OpenAPI endpoints, the
browser entry page, and the production CORS preflight.

## Phase 5 — iOS release

1. In the EAS `production` environment, create:
   - `EXPO_PUBLIC_API_BASE_URL` — the deployed HTTPS API origin, plaintext visibility.
   - `GOOGLE_MAPS_API_KEY` — the iOS-restricted native maps key, sensitive visibility.
   - `EXPO_IOS_BUNDLE_IDENTIFIER` only if overriding the checked-in identifier.
2. Restrict the Google Maps key to the production iOS bundle identifier.
3. Create the matching App Store Connect app and let EAS configure signing credentials.
4. Run `npm run release:check`, then `npm run mobile:build:ios:production`.
5. Test the resulting build with the real-device checklist in
   `apps/mobile/ROLL_OUT_CHECKLIST.md`.
6. Submit with `npm run mobile:submit:ios:production`, or dispatch the **iOS production
   build** workflow with `build-and-submit`.

GitHub's `production` environment must contain the `EXPO_TOKEN` secret and the numeric
`ASC_APP_ID` environment variable. Add environment protection and required reviewers
before enabling build-and-submit. The workflow injects `ascAppId` into its temporary
checkout only. EAS owns the production API and maps variables; they should not be
duplicated in repository files or workflow logs.

## Release automation

- Pull requests and pushes to `master` (the current default branch) or `main` run
  `.github/workflows/release-confidence.yml`. A separate job exercises a disposable
  PostgreSQL 16 database; production credentials are never used for contract tests.
- Render and Vercel deploy from the connected repository after the confidence check.
- Production verification is an explicit post-deploy workflow.
- iOS build/submission is manual and protected because it creates an external release.

Account creation, DNS changes, production secrets, data migration execution, and App
Store submission remain owner-approved external actions. The repository now validates
all configuration it can safely validate before those actions occur.

## Phase 6 — Operations and rollback

Configure the production URL repository variables, confirm the hourly verification
workflow succeeds, enable managed PostgreSQL backups, and assign workflow-alert owners.
Follow [OPERATIONS.md](OPERATIONS.md) for service objectives, request tracing, backup
integrity checks, restore drills, rollback procedures, and incident response.

## Trip editing compatibility (October 19, 2026)

The reliability update adds an integer trip version and a dedicated stop operation.
Deploy the backend first, then the matching web client and a new iOS build. The
backend startup migration adds the version column to existing SQLite/PostgreSQL
trips with a starting value of 1; it does not remove trip data.

- Trip responses now include a version. A full trip edit must send the version
  captured when the editor opened. A stale version returns HTTP 409 without changing
  the trip. A missing version returns HTTP 428 with an update/reopen message.
- Older web/iOS clients can continue reading and creating trips, but their full
  edits (including their old Quick Stop operation) are safely rejected. Update
  those clients before resuming edits. Do not deploy a client-only release against
  an older backend that lacks version checks and the stop endpoint.
- POST /api/trips/{trip_id}/stops sends only a new route point and optional
  itinerary event. It retries rejected version conflicts against the current trip,
  preserving unrelated edits. Clients must not automatically retry write requests
  after an ambiguous network failure.
- Restored edit drafts retain the original version. Users can review the latest
  trip, keep their draft, or explicitly replace it with the current saved trip.
- Backend rollback must retain version enforcement while updated clients are in
  use; reverting to the old write handler would remove overwrite protection.

Before production rollout, run the PostgreSQL contract job and the physical iPhone
acceptance checklist. Local validation uses temporary SQLite databases and does
not migrate the production database or publish an iOS build.
