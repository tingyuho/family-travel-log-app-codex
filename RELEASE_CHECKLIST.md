# Release Confidence Checklist

Source of truth:

- `apps/web` for the React/Vite web app.
- `apps/mobile` for the Expo iOS app.
- `backend` for the FastAPI API.

The legacy `frontend` app has been archived under `_archives/` and should not receive new work.

## One-command confidence check

Run:

```bash
npm run release:check
```

This command runs:

- `npm run web:build`
- `npm run web:test`
- `npx tsc --noEmit --project apps/mobile/tsconfig.json`
- `npm run mobile:test:unit`
- `npm run mobile:test:integration`
- `npm run mobile:test:contract`
- `npm run mobile:test:e2e:smoke`
- `npm run release:ios:preflight`
- `npm run mobile:export:ios`
- production artifact URL scan
- repository secret scan
- `npm run backend:check`
- `npm run backend:test`
- `npm run backend:smoke`

Postgres contract tests are opt-in because they require a disposable hosted database:
The release-confidence workflow also runs them automatically against an isolated
PostgreSQL service. Backend test commands allocate their own temporary files and cache
to avoid collisions with Windows' shared pytest folder.

```bash
$env:POSTGRES_TEST_DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/DATABASE"
npm run backend:test:postgres
```

## Manual device checks

Run these checks on an iPhone or iOS development build. Android and Expo Web are not part of the current production target.

- Login and logout.
- Create, edit, and delete a trip.
- Drag/zoom map and select a route stop.
- Reorder family profiles and confirm the order survives refresh.
- Toggle packing checklist items and relaunch the app.
- Request and complete password reset.
- Try both Google Calendar and ICS calendar export.

## Hosted deployment checks

- [ ] Render `/health/db` reports `database: postgres`.
- [ ] Vercel production build uses the deployed HTTPS API origin.
- [ ] `npm run production:verify` passes with the final browser and API origins.
- [ ] Production CORS allows the exact browser origin and no wildcard/regex fallback.
- [ ] Render and Vercel deploy only after the release confidence workflow passes.

## iOS distribution checks

- [ ] `npm run release:ios:preflight` passes.
- [ ] EAS production environment contains the HTTPS API URL and restricted Maps key.
- [ ] Production profile creates a store build and auto-increments its build number.
- [ ] Real-device smoke checklist passes on the release candidate.
- [ ] App Store submission is dispatched through the protected production environment.

## Operational handoff

- [ ] Repository variables configure the hourly production verification workflow.
- [ ] At least two maintainers receive failed-workflow notifications.
- [ ] Backend logs include request IDs and release identifiers without sensitive payloads.
- [ ] Managed PostgreSQL backups are enabled and their retention meets the RPO.
- [ ] A fresh backup passes `npm run backend:backup:verify -- PATH_TO_DUMP`.
- [ ] A disposable-database restore drill has been completed and recorded.
- [ ] Backend, browser, and iOS rollback owners have reviewed `OPERATIONS.md`.
- [ ] Release confidence and repository secret scans pass immediately before launch.
