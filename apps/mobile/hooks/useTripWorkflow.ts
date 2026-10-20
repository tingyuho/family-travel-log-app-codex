import { useEffect, useRef, useState } from "react";
import Storage from "expo-sqlite/kv-store";

import { searchPlaces, type PlaceSuggestion, type Trip } from "../api";
import { emptyAccommodation, emptyItinerary, emptyTripDraft } from "../forms";
import { getOrderedRoutePoints } from "../mapLayers";
import { hasTripDraftContent, validateTripDraft, type TripFormValidation, type TripDraftShape } from "../utils";

type ErrorContext = "default" | "place_search";

export function useTripWorkflow({
  onError,
  userId,
}: {
  onError: (error: unknown, context?: ErrorContext) => void;
  userId?: string;
}) {
  const [tripDraft, setTripDraft] = useState<TripDraftShape>(emptyTripDraft);
  const [tripFormValidation, setTripFormValidation] = useState<TripFormValidation>({
    accommodationNameByIndex: {},
    accommodationDateByIndex: {},
    itineraryByIndex: {},
    itineraryDateByIndex: {},
  });
  const [tripEditingId, setTripEditingId] = useState<number | null>(null);
  const [routeQuery, setRouteQuery] = useState("");
  const [routeSuggestions, setRouteSuggestions] = useState<PlaceSuggestion[]>([]);
  const [routeSearching, setRouteSearching] = useState(false);
  const routeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [hydratedUser, setHydratedUser] = useState<string | undefined>();

  useEffect(() => {
    setTripFormValidation(validateTripDraft(tripDraft));
  }, [tripDraft]);

  useEffect(() => {
    setTripDraft(emptyTripDraft);
    setTripEditingId(null);
    if (!userId) { setHydratedUser(undefined); return; }
    try {
      const saved = Storage.getItemSync(getDraftStorageKey(userId));
      if (saved) {
        const parsed = JSON.parse(saved) as { tripEditingId?: number | null; tripDraft?: TripDraftShape };
        if (parsed.tripDraft && (parsed.tripEditingId || hasTripDraftContent(parsed.tripDraft))) {
          setTripEditingId(parsed.tripEditingId || null);
          setTripDraft(parsed.tripDraft);
        }
      }
    } catch {
      // Draft auto-resume is a convenience; the normal editor remains usable if storage fails.
    } finally {
      setHydratedUser(userId);
    }
  }, [userId]);

  useEffect(() => {
    if (!userId || hydratedUser !== userId) return;
    const key = getDraftStorageKey(userId);
    try {
      if (tripEditingId || hasTripDraftContent(tripDraft)) {
        Storage.setItemSync(key, JSON.stringify({ tripEditingId, tripDraft }));
      } else {
        Storage.removeItemSync(key);
      }
    } catch {
      // Keep typing responsive even if local persistence is unavailable.
    }
  }, [userId, hydratedUser, tripEditingId, tripDraft]);

  useEffect(() => {
    if (routeDebounceRef.current) clearTimeout(routeDebounceRef.current);
    const query = routeQuery.trim();
    if (query.length < 2) {
      setRouteSuggestions([]);
      return;
    }
    routeDebounceRef.current = setTimeout(() => {
      void searchRouteSuggestions(query);
    }, 350);
    return () => {
      if (routeDebounceRef.current) clearTimeout(routeDebounceRef.current);
    };
  }, [routeQuery]);

  function startTripEdit(trip: Trip) {
    setTripEditingId(trip.id);
    setTripDraft(toTripDraft(trip));
  }

  function resetTripEditor() {
    setTripEditingId(null);
    setTripDraft(emptyTripDraft);
    setTripFormValidation({
      accommodationNameByIndex: {},
      accommodationDateByIndex: {},
      itineraryByIndex: {},
      itineraryDateByIndex: {},
    });
    setRouteQuery("");
    setRouteSuggestions([]);
  }

  async function searchRouteSuggestions(query: string) {
    setRouteSearching(true);
    try {
      const data = await searchPlaces(query);
      setRouteSuggestions(Array.isArray(data) ? data : []);
    } catch (e) {
      setRouteSuggestions([]);
      onError(e, "place_search");
    } finally {
      setRouteSearching(false);
    }
  }

  function appendRouteSuggestion(suggestion: { place_id: string; display_name: string; lat: string; lon: string }) {
    const lat = Number(suggestion.lat);
    const lng = Number(suggestion.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      onError(new Error("Location coordinates are invalid."));
      return;
    }
    const label = (suggestion.display_name || "Stop").split(",")[0].trim();
    const nextLine = `${lat},${lng},${label}`;
    setTripDraft((prev) => ({
      ...prev,
      route_text: prev.route_text.trim() ? `${prev.route_text.trim()}\n${nextLine}` : nextLine,
    }));
    setRouteQuery("");
    setRouteSuggestions([]);
  }

  function removeRouteStop(index: number) {
    const lines = tripDraft.route_text
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((_, lineIndex) => lineIndex !== index);
    setTripDraft((prev) => ({ ...prev, route_text: lines.join("\n") }));
  }

  return {
    tripDraft,
    setTripDraft,
    tripFormValidation,
    setTripFormValidation,
    tripEditingId,
    setTripEditingId,
    routeQuery,
    setRouteQuery,
    routeSuggestions,
    setRouteSuggestions,
    routeSearching,
    startTripEdit,
    resetTripEditor,
    appendRouteSuggestion,
    removeRouteStop,
  };
}

function getDraftStorageKey(userId: string) {
  return `travel_log_trip_editor_${userId}`;
}

function toTripDraft(trip: Trip): TripDraftShape {
  return {
    version: trip.version,
    title: trip.title,
    trip_kind: trip.trip_kind,
    start_date: trip.start_date || "",
    end_date: trip.end_date || "",
    notes: trip.notes || "",
    route_text: getOrderedRoutePoints(trip.route)
      .map((point) => `${point.lat},${point.lng},${point.label || ""}`.replace(/,+$/, ""))
      .join("\n"),
    selected_people: [...trip.people],
    accommodations: trip.accommodations.length ? trip.accommodations.map((stay) => ({ ...stay })) : [emptyAccommodation()],
    itinerary: trip.itinerary.length ? trip.itinerary.map((item) => ({ ...item })) : [emptyItinerary()],
  };
}
