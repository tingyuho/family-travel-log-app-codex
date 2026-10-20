import type { AccommodationInput, ItineraryEventInput, RoutePoint, Trip, TripWritePayload } from "./api";

export type TripDraftShape = {
  version?: number;
  title: string;
  trip_kind: "past" | "wishlist";
  start_date: string;
  end_date: string;
  notes: string;
  route_text: string;
  selected_people: string[];
  accommodations: AccommodationInput[];
  itinerary: ItineraryEventInput[];
};

export type TripSort = "date_desc" | "date_asc" | "name_asc" | "name_desc";

export type TripFormValidation = {
  accommodationNameByIndex: Record<number, string>;
  accommodationDateByIndex: Record<number, string>;
  itineraryByIndex: Record<number, string>;
  itineraryDateByIndex: Record<number, string>;
};

export function normalizeText(value: string) {
  return (value || "").trim().toLowerCase();
}

export function isValidEmail(value: string) {
  return /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test((value || "").trim());
}

export function formatDateRange(start?: string | null, end?: string | null) {
  if (!start && !end) return "No dates yet";
  if (start && end) return `${start} to ${end}`;
  return start || end || "No dates yet";
}

export function parseItems(text: string) {
  const seen = new Set<string>();
  return text
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => {
      const key = item.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function parseRouteText(text: string): RoutePoint[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const [latText, lngText, ...labelParts] = line.split(",").map((part) => part.trim());
      const lat = Number(latText);
      const lng = Number(lngText);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        throw new Error(`Invalid route line: ${line}`);
      }
      return {
        lat,
        lng,
        label: labelParts.join(", ") || `Stop ${index + 1}`,
        order: index,
      };
    });
}

export function parseRouteLines(text: string): RoutePoint[] {
  try {
    return parseRouteText(text);
  } catch {
    return [];
  }
}

export function getRouteTextError(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return "";
  try {
    parseRouteText(trimmed);
    return "";
  } catch (error) {
    return error instanceof Error ? error.message : "Route stops could not be read.";
  }
}

export function isInvalidDateRange(startDate?: string | null, endDate?: string | null) {
  return Boolean(startDate && endDate && endDate < startDate);
}

export function isIsoDateString(value?: string | null) {
  const trimmed = (value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return false;

  const parsed = parseIsoDateParts(trimmed);
  if (!parsed) return false;

  const date = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day));
  return (
    date.getUTCFullYear() === parsed.year &&
    date.getUTCMonth() === parsed.month - 1 &&
    date.getUTCDate() === parsed.day
  );
}

export function addDaysToDateString(value: string, days: number) {
  if (!isIsoDateString(value)) return value;

  const parsed = parseIsoDateParts(value.trim());
  if (!parsed) return value;

  const date = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day + days));
  return date.toISOString().slice(0, 10);
}

export function getStayNightCount(checkIn?: string | null, checkOut?: string | null) {
  const start = toUtcDay(checkIn);
  const end = toUtcDay(checkOut);
  if (start === null || end === null || end < start) return null;
  return Math.round((end - start) / 86400000);
}

export function validateTripDraft(draft: TripDraftShape): TripFormValidation {
  const accommodationNameByIndex: Record<number, string> = {};
  const accommodationDateByIndex: Record<number, string> = {};
  const itineraryByIndex: Record<number, string> = {};
  const itineraryDateByIndex: Record<number, string> = {};

  draft.accommodations.forEach((stay, index) => {
    const checkIn = (stay.check_in || "").trim();
    const checkOut = (stay.check_out || "").trim();
    const hasAnyValue = Boolean(
      stay.name.trim() ||
      stay.location.trim() ||
      checkIn ||
      checkOut ||
      stay.notes.trim()
    );
    if (hasAnyValue && !stay.name.trim()) {
      accommodationNameByIndex[index] = "Accommodation name is required.";
    }
    if ((checkIn && !isIsoDateString(checkIn)) || (checkOut && !isIsoDateString(checkOut))) {
      accommodationDateByIndex[index] = "Use YYYY-MM-DD for stay dates.";
    } else if (isInvalidDateRange(checkIn, checkOut)) {
      accommodationDateByIndex[index] = "Check-out cannot be before check-in.";
    }
  });

  draft.itinerary.forEach((event, index) => {
    const hasAnyValue = Boolean(
      event.date.trim() ||
      event.time.trim() ||
      event.activity.trim() ||
      event.location.trim() ||
      event.notes.trim()
    );
    if (!hasAnyValue) return;
    if (!event.date.trim() || !event.activity.trim()) {
      itineraryByIndex[index] = "Itinerary rows need both date and activity.";
    }
    if (event.date.trim() && !isIsoDateString(event.date)) {
      itineraryDateByIndex[index] = "Use YYYY-MM-DD for itinerary dates.";
    }
  });

  return {
    accommodationNameByIndex,
    accommodationDateByIndex,
    itineraryByIndex,
    itineraryDateByIndex,
  };
}

export function hasTripValidationErrors(validation: TripFormValidation) {
  return Boolean(
    Object.keys(validation.accommodationNameByIndex).length ||
      Object.keys(validation.accommodationDateByIndex).length ||
      Object.keys(validation.itineraryByIndex).length ||
      Object.keys(validation.itineraryDateByIndex).length
  );
}

export function getTripValidationSummary(validation: TripFormValidation) {
  if (Object.keys(validation.accommodationNameByIndex).length) {
    return "Fix the highlighted stay name before saving.";
  }
  if (Object.keys(validation.accommodationDateByIndex).length) {
    return "Fix the highlighted stay dates before saving.";
  }
  if (Object.keys(validation.itineraryByIndex).length) {
    return "Fix the highlighted itinerary row before saving.";
  }
  if (Object.keys(validation.itineraryDateByIndex).length) {
    return "Fix the highlighted itinerary date before saving.";
  }
  return "";
}

export function hasTripDraftContent(draft: TripDraftShape) {
  return Boolean(
    draft.title.trim() ||
      draft.start_date.trim() ||
      draft.end_date.trim() ||
      draft.notes.trim() ||
      draft.route_text.trim() ||
      draft.selected_people.length ||
      draft.accommodations.some((stay) =>
        Boolean(stay.name.trim() || stay.location.trim() || (stay.check_in || "").trim() || (stay.check_out || "").trim() || stay.notes.trim())
      ) ||
      draft.itinerary.some((item) =>
        Boolean(item.date.trim() || item.time.trim() || item.activity.trim() || item.location.trim() || item.notes.trim())
      )
  );
}

export function buildTripPayload(draft: TripDraftShape): TripWritePayload {
  const validation = validateTripDraft(draft);
  if (Object.keys(validation.accommodationNameByIndex).length > 0) {
    const firstBadIndex = Number(Object.keys(validation.accommodationNameByIndex)[0]);
    throw new Error(`Accommodation ${firstBadIndex + 1} requires a name.`);
  }
  if (Object.keys(validation.accommodationDateByIndex).length > 0) {
    const firstBadIndex = Number(Object.keys(validation.accommodationDateByIndex)[0]);
    throw new Error(`Accommodation ${firstBadIndex + 1} has invalid stay dates.`);
  }
  if (Object.keys(validation.itineraryByIndex).length > 0) {
    const firstBadIndex = Number(Object.keys(validation.itineraryByIndex)[0]);
    throw new Error(`Itinerary row ${firstBadIndex + 1} needs a date and activity.`);
  }
  if (Object.keys(validation.itineraryDateByIndex).length > 0) {
    const firstBadIndex = Number(Object.keys(validation.itineraryDateByIndex)[0]);
    throw new Error(`Itinerary row ${firstBadIndex + 1} has an invalid date.`);
  }

  return {
    version: draft.version,
    title: draft.title.trim(),
    trip_kind: draft.trip_kind,
    start_date: normalizeDate(draft.start_date),
    end_date: normalizeDate(draft.end_date),
    notes: draft.notes.trim(),
    route: parseRouteText(draft.route_text),
    people: uniqNames(draft.selected_people),
    accommodations: draft.accommodations
      .map((stay) => ({
        name: stay.name.trim(),
        location: stay.location.trim(),
        check_in: normalizeDate(stay.check_in || ""),
        check_out: normalizeDate(stay.check_out || ""),
        notes: stay.notes.trim(),
      }))
      .filter((stay) => Object.values(stay).some(Boolean)),
    itinerary: draft.itinerary
      .map((event) => ({
        date: event.date.trim(),
        time: event.time.trim(),
        activity: event.activity.trim(),
        location: event.location.trim(),
        notes: event.notes.trim(),
      }))
      .filter((event) => event.date && event.activity),
  };
}

function normalizeDate(value: string) {
  const trimmed = value.trim();
  return trimmed || null;
}

function parseIsoDateParts(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

function toUtcDay(value?: string | null) {
  const trimmed = (value || "").trim();
  if (!isIsoDateString(trimmed)) return null;

  const parsed = parseIsoDateParts(trimmed);
  if (!parsed) return null;

  return Date.UTC(parsed.year, parsed.month - 1, parsed.day);
}

function uniqNames(names: string[]) {
  const seen = new Set<string>();
  return names
    .map((name) => name.trim())
    .filter(Boolean)
    .filter((name) => {
      const key = name.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function sortTrips(trips: Trip[], sortBy: TripSort) {
  const list = [...trips];
  if (sortBy === "name_asc") return list.sort((a, b) => a.title.localeCompare(b.title));
  if (sortBy === "name_desc") return list.sort((a, b) => b.title.localeCompare(a.title));
  if (sortBy === "date_asc") {
    return list.sort((a, b) => compareDateTrips(a, b, "asc"));
  }
  return list.sort((a, b) => compareDateTrips(a, b, "desc"));
}

function compareDateTrips(a: Trip, b: Trip, direction: "asc" | "desc") {
  const aRank = toDateRank(a);
  const bRank = toDateRank(b);

  if (aRank === null && bRank === null) return a.title.localeCompare(b.title);
  if (aRank === null) return 1;
  if (bRank === null) return -1;

  return direction === "asc" ? aRank - bRank : bRank - aRank;
}

function toDateRank(trip: Trip) {
  const parsed = Date.parse(trip.start_date || trip.end_date || trip.created_at || "");
  return Number.isNaN(parsed) ? null : parsed;
}
