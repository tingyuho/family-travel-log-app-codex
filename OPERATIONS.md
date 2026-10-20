# Production Operations Runbook

This runbook covers the supported FastAPI/PostgreSQL backend, Vite browser app,
and Expo iOS app. Android and Expo Web are not production surfaces.

## Service objectives

- Initial availability target: 99.5% monthly for the API and browser app.
- Recovery time objective (RTO): restore service within 2 hours.
- Recovery point objective (RPO): lose no more than 24 hours of committed data.
- Review these targets after the first month of production traffic.

## Continuous verification

The **Verify production deployment** GitHub workflow runs hourly at minute 17.
Configure these repository variables before enabling production monitoring:

- `PRODUCTION_WEB_BASE_URL`
- `PRODUCTION_API_BASE_URL`

The monitor verifies browser availability/security headers, API and PostgreSQL health,
required OpenAPI routes, exact CORS behavior, request IDs, and the deployed release ID.
GitHub Actions failure notifications are the baseline alert channel; assign at least two
maintainers to receive failed-workflow notifications.

Each backend request emits one structured JSON log with `request_id`, method, path,
status, duration, and release. Request bodies, authorization headers, tokens, and query
strings are deliberately excluded. Ask users for the `X-Request-ID` response header
when investigating a failure.

## PostgreSQL backups

Use the managed database provider's automated backups as the primary recovery source.
Additionally, create an encrypted off-provider archive before schema changes, data
migrations, or a major release. PostgreSQL client tools must be installed locally.

```powershell
$env:DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DATABASE?sslmode=require"
$env:BACKUP_DIRECTORY="D:\EncryptedBackups\family-travel-log"
npm run backend:backup
npm run backend:backup:verify -- "D:\EncryptedBackups\family-travel-log\family-travel-log-TIMESTAMP.dump"
```

The backup command passes credentials through PostgreSQL environment variables instead
of command-line arguments and writes a SHA-256 checksum. Store archives encrypted and
outside the repository. Never upload a production database to a normal GitHub artifact.

Quarterly, restore the newest archive into a disposable PostgreSQL database and run
`/health/db` plus representative record-count checks. `pg_restore --clean` is destructive:
use it only against a verified disposable restore target, never the production URL.

## Rollback

### Backend

1. Pause writes if data integrity is at risk.
2. In Render, roll back to the last healthy deployment.
3. If schema/data changed, restore the matching database backup or apply a reviewed
   forward repair; do not guess at a reverse migration.
4. Run `npm run production:verify` and confirm `/health` reports the intended release.

### Browser

1. Promote the last healthy Vercel deployment to the production domain.
2. Confirm its embedded API origin matches the active backend.
3. Run the production verification workflow.

### iOS

1. Pause a phased App Store release when a critical regression is detected.
2. Disable risky build-time feature flags in a corrected build if applicable.
3. Build, smoke-test, and submit a higher build number. Installed App Store binaries
   cannot be remotely rolled back, so backend compatibility must span active versions.

## Incident response

1. Record detection time, affected surface, release ID, and sample request IDs.
2. Classify severity: data/security risk, full outage, degraded feature, or cosmetic.
3. Preserve logs and take a database backup before any data repair.
4. Choose rollback or forward repair, name an incident owner, and post updates at a
   predictable interval.
5. Verify browser, API, PostgreSQL, authentication, and one read/write trip flow.
6. Document root cause, customer impact, timeline, and prevention work within 72 hours.

For suspected credential exposure, revoke and rotate the credential first, then inspect
access logs and invalidate affected sessions. Do not commit evidence containing secrets.

## Routine maintenance

- Dependabot checks npm, Python, and GitHub Actions dependencies weekly.
- `npm run release:check` includes repository secret scanning.
- Review Render/Vercel/EAS access quarterly and remove inactive members.
- Exercise one backend rollback and one database restore drill every quarter.
- Review rate limits, database capacity, error rates, and slow-request logs monthly.
