import { createEmptyForm } from "./tripUtils.js";
const SCHEMA_VERSION = 1;
const keyFor = (user) => "travel_log_web_drafts_" + user;

function validDraft(value) {
  return value && typeof value === "object" &&
    ["title", "trip_kind", "start_date", "end_date", "notes", "route_text"].every((key) => typeof value[key] === "string") &&
    ["selected_person_ids", "accommodations", "itinerary"].every((key) => Array.isArray(value[key])) &&
    value.selected_person_ids.every(Number.isInteger) &&
    value.accommodations.every((row) => row && ["name", "location", "notes"].every((key) => typeof row[key] === "string")) &&
    value.itinerary.every((row) => row && ["date", "time", "activity", "location", "notes"].every((key) => typeof row[key] === "string")) &&
    (value.version === undefined || (Number.isInteger(value.version) && value.version > 0));
}

export function hasWebTripDraft(form, tripEdit) {
  return Boolean(tripEdit) || JSON.stringify({ ...form, person_names_by_id: undefined }) !== JSON.stringify(createEmptyForm());
}

export function readWebTripDraft(storage, user) {
  if (!user) return null;
  try {
    const saved = JSON.parse(storage.getItem(keyFor(user)) || "null");
    if (!saved || saved.schemaVersion !== SCHEMA_VERSION || !validDraft(saved.form) ||
        (saved.tripEdit !== null && (!validDraft(saved.tripEdit) || !Number.isInteger(saved.tripEdit.id))) ||
        !hasWebTripDraft(saved.form, saved.tripEdit)) return null;
    return saved;
  } catch { return null; }
}

export function saveWebTripDraft(storage, user, snapshot) {
  if (!user) return true;
  try {
    if (hasWebTripDraft(snapshot.form, snapshot.tripEdit)) {
      storage.setItem(keyFor(user), JSON.stringify({ ...snapshot, schemaVersion: SCHEMA_VERSION }));
    } else storage.removeItem(keyFor(user));
    return true;
  } catch { return false; }
}

export function clearWebTripDraft(storage, user) {
  try { storage.removeItem(keyFor(user)); return true; } catch { return false; }
}
