import { useRef } from "react";
import { ApiError, addTripStop, createTrip, updateTrip, type PlaceSuggestion, type Trip } from "../api";
import { buildTripPayload, hasTripValidationErrors, isInvalidDateRange, validateTripDraft, type TripDraftShape, type TripFormValidation } from "../utils";

type Options = {
  draft: TripDraftShape;
  editingId: number | null;
  setValidation: (validation: TripFormValidation) => void;
  resetEditor: () => void;
  onSaved: (trip: Trip) => void;
  onStopSaved: (trip: Trip) => void;
  onError: (error: unknown) => void;
  onNotice: (message: string | null) => void;
  onBusy: (busy: boolean) => void;
  onConflict: (tripId: number) => void;
};

export function useTripActions(options: Options) {
  const saving = useRef(false);
  function begin() {
    if (saving.current) return false;
    saving.current = true;
    options.onBusy(true);
    options.onError(null);
    options.onNotice(null);
    return true;
  }
  function finish() { saving.current = false; options.onBusy(false); }

  async function handleSaveTrip() {
    if (!begin()) return null;
    try {
      const validation = validateTripDraft(options.draft);
      options.setValidation(validation);
      if (hasTripValidationErrors(validation)) throw new Error("Please fix the highlighted trip form errors before saving.");
      if (isInvalidDateRange(options.draft.start_date, options.draft.end_date)) throw new Error("Trip end date cannot be before start date.");
      const payload = buildTripPayload(options.draft);
      const trip = options.editingId
        ? await updateTrip(options.editingId, payload)
        : await createTrip(payload);
      // The saved response is authoritative; unrelated refreshes cannot turn it into a failed save.
      options.onSaved(trip);
      options.resetEditor();
      options.onNotice(options.editingId ? "Trip updated." : "Trip created.");
      return trip;
    } catch (error) {
      options.onError(error);
      if (error instanceof ApiError && (error.status === 409 || error.status === 428) && options.editingId) options.onConflict(options.editingId);
      return null;
    } finally { finish(); }
  }

  async function handleQuickAddStop({ tripId, place, label, notes }: { tripId: number; place: PlaceSuggestion; label: string; notes: string }) {
    if (!begin()) return false;
    try {
      const lat = Number(place.lat), lng = Number(place.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error("This place is missing usable map coordinates.");
      const cleanLabel = label.trim() || place.display_name.split(",")[0].trim() || "Quick stop";
      const now = new Date();
      const date = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0")].join("-");
      const trip = await addTripStop(tripId, {
        point: { lat, lng, label: cleanLabel },
        itinerary_event: notes.trim() ? { date, time: now.toTimeString().slice(0, 5), activity: cleanLabel, location: place.display_name, notes: notes.trim() } : null,
      });
      options.onSaved(trip);
      options.onStopSaved(trip);
      options.onNotice("Stop added to " + trip.title + ".");
      return true;
    } catch (error) { options.onError(error); return false; }
    finally { finish(); }
  }
  return { handleSaveTrip, handleQuickAddStop };
}
