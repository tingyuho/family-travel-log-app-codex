import assert from "node:assert/strict";
import test from "node:test";
import { createEmptyForm } from "../src/lib/tripUtils.js";
import { clearWebTripDraft, readWebTripDraft, saveWebTripDraft } from "../src/lib/tripDraftStore.js";
function memoryStorage() {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
}
test("draft recovery is account-scoped and retains the original edit version", () => {
  const storage = memoryStorage();
  const draft = { form: createEmptyForm(), tripEdit: { ...createEmptyForm(), id: 7, version: 2, title: "Unfinished edit", unmatched_people: ["Alex"], excluded_people: [] }, showCreateTrip: false };
  assert.equal(saveWebTripDraft(storage, "alex", draft), true);
  assert.equal(readWebTripDraft(storage, "alex").tripEdit.version, 2);
  assert.equal(readWebTripDraft(storage, "sam"), null);
  clearWebTripDraft(storage, "sam");
  assert.equal(readWebTripDraft(storage, "alex").tripEdit.title, "Unfinished edit");
});
test("saved and discarded drafts are removed, while unfinished names survive reload", () => {
  const storage = memoryStorage();
  const draft = { form: { ...createEmptyForm(), title: "Family holiday" }, tripEdit: null, showCreateTrip: true };
  saveWebTripDraft(storage, "alex", draft);
  assert.equal(readWebTripDraft(storage, "alex").form.title, "Family holiday");
  saveWebTripDraft(storage, "alex", { ...draft, form: createEmptyForm() });
  assert.equal(readWebTripDraft(storage, "alex"), null);
  saveWebTripDraft(storage, "alex", draft);
  clearWebTripDraft(storage, "alex");
  assert.equal(readWebTripDraft(storage, "alex"), null);
});
test("invalid caches, future formats, and unavailable storage do not break editing", () => {
  const storage = memoryStorage();
  storage.setItem("travel_log_web_drafts_alex", "broken JSON");
  assert.equal(readWebTripDraft(storage, "alex"), null);
  storage.setItem("travel_log_web_drafts_alex", JSON.stringify({ schemaVersion: 99 }));
  assert.equal(readWebTripDraft(storage, "alex"), null);
  const blocked = { getItem() { throw new Error("Blocked"); }, setItem() { throw new Error("Full"); } };
  assert.equal(readWebTripDraft(blocked, "alex"), null);
  assert.equal(saveWebTripDraft(blocked, "alex", { form: { ...createEmptyForm(), title: "Draft" }, tripEdit: null }), false);
});
