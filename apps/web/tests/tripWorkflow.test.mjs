import assert from "node:assert/strict";
import test from "node:test";
import { createEmptyForm } from "../src/lib/tripUtils.js";
import { buildWebTripPayload, buildStopInput } from "../src/lib/tripWorkflow.js";

test("changing a trip to Wishlist preserves entered dates in the saved payload", () => {
  const draft = { ...createEmptyForm(), title: "Family holiday", trip_kind: "wishlist", start_date: "2026-11-01", end_date: "2026-11-05" };
  const payload = buildWebTripPayload(draft, []);
  assert.equal(payload.start_date, "2026-11-01");
  assert.equal(payload.end_date, "2026-11-05");
  assert.equal(payload.trip_kind, "wishlist");
  assert.throws(() => buildWebTripPayload({ ...draft, end_date: "2026-10-01" }, []), /End date/);
});

test("a trip can be created with just a name and without planned dates", () => {
  const payload = buildWebTripPayload({ ...createEmptyForm(), title: "  Dream trip  " }, []);
  assert.equal(payload.title, "Dream trip");
  assert.equal(payload.start_date, null);
  assert.equal(payload.end_date, null);
  assert.deepEqual(payload.route, []);
  assert.deepEqual(payload.itinerary, []);
  assert.throws(() => buildWebTripPayload(createEmptyForm(), []), /trip name/);
});

test("editing preserves saved people who no longer have a family profile unless explicitly removed", () => {
  const draft = { ...createEmptyForm(), title: "Trip", unmatched_people: ["Alex", "Sam"], excluded_people: ["Sam"] };
  assert.deepEqual(buildWebTripPayload(draft, []).people, ["Alex"]);
});

test("adding a stop sends only its location and optional note", () => {
  const place = { lat: "45.5", lon: "-122.6", display_name: "Museum, Portland" };
  const payload = buildStopInput(place, "", "  Buy tickets  ", new Date(2026, 9, 15, 11, 30));
  assert.deepEqual(payload.point, { lat: 45.5, lng: -122.6, label: "Museum" });
  assert.equal(payload.itinerary_event.notes, "Buy tickets");
  assert.equal(payload.itinerary_event.date, "2026-10-15");
  assert.equal(Object.hasOwn(payload, "title"), false);
  assert.equal(buildStopInput(place, "", "").itinerary_event, null);
  assert.throws(() => buildStopInput({ ...place, lat: "missing" }, "", ""), /map location/);
});
test("edits send the version captured when editing began", () => {
  assert.equal(buildWebTripPayload({ ...createEmptyForm(), title: "Edit", version: 2 }, []).version, 2);
});

test("recovered drafts retain selected people when profiles cannot load", () => {
  const draft = { ...createEmptyForm(), title: "Recovered", selected_person_ids: [7], person_names_by_id: { 7: "Alex" } };
  assert.deepEqual(buildWebTripPayload(draft, []).people, ["Alex"]);
});
