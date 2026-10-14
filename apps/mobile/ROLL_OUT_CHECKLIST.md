# Mobile Rollout Checklist

## Feature Flags
- `EXPO_PUBLIC_FEATURE_MAP_ADVANCED_LAYERS`
- `EXPO_PUBLIC_FEATURE_MAP_CLUSTERS`
- `EXPO_PUBLIC_FEATURE_MAP_HEATMAP`
- `EXPO_PUBLIC_FEATURE_CALENDAR_ICS_SHARE`
- `EXPO_PUBLIC_FEATURE_PROFILE_RESET_IN_APP`

## Phase Gate: Map Advanced Layers
- [ ] Confirm map opens and pans/zooms on an iOS dev build.
- [ ] Validate cluster toggle and zoom-in behavior.
- [ ] Validate heatmap toggle and rendering on representative trips.
- [ ] Verify performance gate behavior on large datasets.

## Phase Gate: Tests
- [ ] Full release confidence check passes (`npm run release:check`).
- [ ] iOS release configuration preflight passes (`npm run release:ios:preflight`).
- [ ] Web production build passes (`npm run web:build`).
- [ ] Mobile TypeScript passes (`npx tsc --noEmit --project apps/mobile/tsconfig.json`).
- [ ] Mobile unit tests pass (`npm run mobile:test:unit`).
- [ ] Mobile API integration tests pass (`npm run mobile:test:integration`).
- [ ] Mobile backend contract check passes (`npm run mobile:test:contract`).
- [ ] Mobile smoke scaffold check passes (`npm run mobile:test:e2e:smoke`).
- [ ] iOS bundle export passes (`npm run mobile:export:ios`).
- [ ] Backend compile/import check passes (`npm run backend:check`).
- [ ] Backend API smoke check passes (`npm run backend:smoke`).
- [ ] Maestro smoke flow executes on at least one real device.

## Real Device Smoke Checklist
- [ ] Login and logout.
- [ ] Create trip, edit trip, and delete trip.
- [ ] Drag/zoom map and tap route stop to focus selected trip.
- [ ] Reorder people profiles and verify persisted order after refresh.
- [ ] Toggle packing checklist items and verify persistence after relaunch.
- [ ] Request password reset code and complete password reset.
- [ ] Google Calendar open and ICS share flow.

## Phase Gate: Security and Config
- [ ] Google Maps API key restricted by the iOS bundle ID.
- [ ] No secrets committed (`.env` ignored and checked).
- [ ] Password reset flow shows safe errors without leaking internals.

## Release Readiness
- [ ] `npm run mobile:export:ios` succeeds.
- [ ] `npm run mobile:build:ios:production` succeeds in EAS.
- [ ] Production build number increments remotely.
- [ ] Backend health and auth endpoints reachable from device.
- [ ] Critical flows pass: login, trip create/edit, people reorder, packing checklist, calendar actions.
- [ ] Feature flags set for staged rollout strategy.
- [ ] Protected App Store submission is explicitly approved.
