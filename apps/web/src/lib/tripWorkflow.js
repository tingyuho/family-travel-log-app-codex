import { cleanAccommodationRows, cleanItineraryRows, isInvalidDateRange, normalizeTripKind, parseRoute } from "./tripUtils.js";

export function buildWebTripPayload(draft, peopleProfiles) {
  const title = draft.title.trim();
  if (!title) throw new Error("Add a trip name before saving.");
  if (isInvalidDateRange(draft.start_date, draft.end_date)) throw new Error("End date cannot be before start date.");
  const peopleMap = new Map(peopleProfiles.map((person) => [person.id, person.name]));
  return {
    version: draft.version,
    title, trip_kind: normalizeTripKind(draft.trip_kind),
    start_date: draft.start_date || null, end_date: draft.end_date || null,
    notes: draft.notes,
    people: [...draft.selected_person_ids.map((id) => (peopleMap.get(id) || draft.person_names_by_id?.[id])).filter(Boolean),
      ...(draft.unmatched_people || []).filter((name) => !(draft.excluded_people || []).includes(name))],
    route: parseRoute(draft.route_text), accommodations: cleanAccommodationRows(draft.accommodations), itinerary: cleanItineraryRows(draft.itinerary),
  };
}

export function buildStopInput(place, label, notes, now = new Date()) {
  const lat = Number(place.lat), lng = Number(place.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error("Choose a place with a map location.");
  const stopLabel = label.trim() || place.display_name.split(",")[0].trim() || "Stop";
  const date = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0")].join("-");
  return {
    point: { lat, lng, label: stopLabel },
    itinerary_event: notes.trim() ? { date, time: now.toTimeString().slice(0, 5), activity: stopLabel, location: place.display_name, notes: notes.trim() } : null,
  };
}
