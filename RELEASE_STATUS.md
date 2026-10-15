# Release milestone status — updated October 14, 2026

Goal: hosted web app and an iPhone release candidate using the production backend.
The hosted web/backend deployment is verified. The milestone remains open until
the TestFlight build, real iPhone checks, and operations handoff pass.

## Completed

- Saved and pushed the release baseline on `codex/production-readiness-phase-0-1`.
- Opened draft PR #8: https://github.com/tingyuho/family-travel-log-app-codex/pull/8.
- Fixed Windows test-folder permissions and Node 20 web-test discovery.
- Added a disposable PostgreSQL CI service; its contract check passes.
- Full cloud release confidence passes for code commit `51d3911045e9`, including
  the production web build, 22 web tests, mobile type checks, 20 mobile tests,
  contract/scaffold checks, iOS export, backend checks, and 17 backend tests.
- Validated startup and CRUD contracts against an isolated copy of the existing
  Neon database, without running contract tests against production.
- Created the no-compute recovery branch `pre-release-2026-10-13`
  (`br-silent-unit-anehy364`) in Neon project `solitary-bar-65423790`.
- Retained the isolated validation branch `release-contract-2026-10-13`
  (`br-raspy-king-anpeouzz`). It is a test copy, not the production database.
- Configured Render production mode, exact browser origins, PostgreSQL health
  checks, and Nominatim location search with an identifying user agent.
- Deployed the backend release candidate to
  https://family-travel-log-app-codex.onrender.com.
- Verified structured request logs on Render for backend release `51d3911045e9`.
- Removed Vercel's obsolete `frontend` root override and rebuilt the same code
  commit for production. The live site is https://family-travel-log-app-codex.vercel.app.
- Full production verification now passes, including browser security headers,
  PostgreSQL, API contract, release identity, request IDs, and browser CORS.
- Browser smoke checks passed for registration, logout/login, trip creation,
  editing, persistence after refresh, and map marker/detail selection. Synthetic
  data is isolated in account `releasecheck_mv7qfe30`; its test trip is retained.
  No test password is stored in the repository.
- Verified PostgreSQL health, release identity, request IDs, security headers,
  allowed browser CORS, rejection of an untrusted origin, and unauthenticated
  trip-access rejection.
- Set GitHub production URL variables for the verification workflow.
- Set the EAS production API origin and included the existing sensitive Maps key
  in production. Its Google platform restrictions still need owner verification.
- Added an iPhone login/navigation/logout Maestro flow and encryption metadata.
- Confirmed matching active App Store signing credentials for
  `com.tyhotw.familytravellogmobile` and configured App Store Connect app ID
  `6778994659`.
- Production iOS version `1.0.0`, build `2`, finished successfully on October 14.
  EAS build: https://expo.dev/accounts/tyhotw/projects/family-travel-log-mobile/builds/6e8f48a8-39f6-462a-93bd-20975baf5355.
- Uploaded that exact build to App Store Connect successfully on October 14 using
  the configured EAS submission credentials. Submission:
  https://expo.dev/accounts/tyhotw/projects/family-travel-log-mobile/submissions/0e52bd32-ff6f-4efe-8735-82ff77315cd3.
  Apple processing was still pending when the submission completed.

## Remaining gates

1. **Apple processing and tester access.** Upload succeeded. Wait for Apple to
   finish processing version `1.0.0` build `2`, then make the build available to the
   intended internal testing group. TestFlight page:
   https://appstoreconnect.apple.com/apps/6778994659/testflight/ios.
   Tester invitations and public App Store review have not been dispatched.
2. **Real iPhone acceptance.** Run the authenticated Maestro flow plus the full
   manual checklist in `apps/mobile/ROLL_OUT_CHECKLIST.md`. No real-device pass
   has been claimed. Complete the remaining hosted web checks for people, packing,
   calendar export, password reset, and trip deletion.
3. **Operations handoff.** The hourly workflow is prepared and its URL variables
   are set, but it needs the workflow on the default branch. Confirm alert owners,
   daily backup retention, an off-provider
   archive, and a restore drill. The Neon project currently reports a six-hour
   history window; the recovery branch is a pre-release checkpoint, not a daily
   backup policy.

## Deployment ownership and rollback

Render now tracks the release branch with automatic deployments disabled. This
prevents the legacy branch from replacing the manually verified candidate. After
PR #8 is merged, point Render at `master` and enable deployment after checks pass.
Do not enable automatic deployments from the obsolete accommodation branch.

If rolling back to a commit before `backend/logging.json` was introduced, also
restore the old start command without `--log-config logging.json`. Keep the database
recovery branch until the release and recovery checks are complete. Retire the test
branch through the owner's normal database cleanup process when no longer needed.

See `DEPLOYMENT.md`, `OPERATIONS.md`, and `RELEASE_CHECKLIST.md` for procedures.

![Live web map smoke test](docs/images/release-live-web.png)
