import type { Trip } from "./api";
import { normalizeText } from "./utils";

export const RECENT_TRIP_LIMIT = 5;

type FormatDates = (start?: string | null, end?: string | null) => string;

export function tripPickerDateLabel(trip: Trip, formatDates: FormatDates) {
  if (!trip.start_date && !trip.end_date) {
    return trip.trip_kind === "wishlist" ? "Wishlist · dates not set" : "Dates not set";
  }
  return formatDates(trip.start_date, trip.end_date);
}

// Search every trip, even when the initial list only shows recent trips.
export function filterTripPickerOptions(orderedTrips: Trip[], query: string, showAll: boolean, formatDates: FormatDates) {
  const words = normalizeText(query).split(/\s+/).filter(Boolean);
  if (!words.length) return showAll ? orderedTrips : orderedTrips.slice(0, RECENT_TRIP_LIMIT);
  return orderedTrips.filter((trip) => {
    const text = normalizeText(`${trip.title} ${trip.start_date || ""} ${trip.end_date || ""} ${tripPickerDateLabel(trip, formatDates)}`);
    return words.every((word) => text.includes(word));
  });
}
