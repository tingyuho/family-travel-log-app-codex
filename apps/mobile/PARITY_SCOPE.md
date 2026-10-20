# Mobile Parity Scope Lock

## Target Decision
Mobile parity follows a **mobile-appropriate parity** model:
- Match web capabilities and backend coverage.
- Allow different interaction patterns on touch devices.
- Keep advanced map rendering options optional when device performance is not acceptable.

The current native production target is iOS. Android source remains available for future work, but Android and Expo Web are not release-gated in this phase. The production browser surface is `apps/web`.

## Locked Gap Checklist
- [x] Runtime foundation uses custom dev build for Google provider on iOS.
- [x] Mobile API client can call all backend endpoints required by web parity.
- [x] Profile management exists post-login (user ID read-only, email editable).
- [x] Trip create/edit/delete parity including people, accommodations, itinerary.
- [x] Route workflow parity (manual editing plus assisted location search).
- [x] Trip list controls parity (sort, type filter, people filter, map highlighting).
- [x] Map core parity (interactive map, selection focus, route rendering).
- [x] People parity (edit + reorder + persistence).
- [x] Packing parity (edit + checklist + local checked-state persistence).
- [x] Calendar actions parity (Google summary link + ICS export/share).
- [x] UX parity improvements (register confirm password, clearer validation, accessibility baseline).
- [x] Test and rollout structure exists for incremental delivery.

## Optional Web-Only Features
These may remain web-only if mobile performance is poor on low-end devices:
- Map marker clustering (now available behind feature flag and perf gate in mobile build).
- Heatmap overlay (now available behind feature flag and perf gate in mobile build).

## Phase -1 Runtime/Build Foundation
- Custom dev build workflow is the baseline for iOS Google provider testing.
- App config supports `ios.config.googleMapsApiKey`; Android configuration is retained for future work.
- Scripted start/build commands use the mobile workspace root.
- Expo Go fallback behavior is explicit and non-crashing.

## Definition Of Done (Global)
A phase is done only when all are true:
- Feature behavior is implemented and wired end-to-end.
- Regression checks for touched flows pass manually.
- Error/loading/empty states are handled.
- No known blocking crash remains in the touched area.

## Guardrails
- Backend contract checks: keep mobile request/response types aligned with backend schema.
- Performance budget:
  - Map first paint under 2.5s on a representative test device.
  - Interactions (pan/zoom/select) should feel responsive without repeated dropped frames.
- Security checklist:
  - Never commit secrets to git.
  - Map keys use platform restrictions (bundle/package + signing fingerprints).
  - Password reset and auth errors are surfaced without leaking sensitive data.
