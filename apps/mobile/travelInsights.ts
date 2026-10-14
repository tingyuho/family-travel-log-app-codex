import type { PersonProfile, Trip } from "./api";
import { flattenTripRoutePoints, type MappedStop } from "./mapLayers";
import { normalizeText, sortTrips } from "./utils";

export type TimelineGroup = {
  key: string;
  title: string;
  trips: Trip[];
};

export type PersonTravelHistory = {
  person: PersonProfile;
  trips: Trip[];
  stops: MappedStop[];
  years: string[];
  companions: Array<{ name: string; count: number }>;
  recentTrip: Trip | null;
};

const monthNames = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export function groupTripsByTimeline(trips: Trip[]): TimelineGroup[] {
  const groups = new Map<string, TimelineGroup>();

  trips.forEach((trip) => {
    const key = getTimelineKey(trip);
    const title = getTimelineTitle(key);
    const current = groups.get(key) || { key, title, trips: [] };
    current.trips.push(trip);
    groups.set(key, current);
  });

  return [...groups.values()]
    .map((group) => ({ ...group, trips: sortTrips(group.trips, "date_desc") }))
    .sort((a, b) => compareTimelineKeys(a.key, b.key));
}

export function getPersonTravelHistory(person: PersonProfile, trips: Trip[]): PersonTravelHistory {
  const personName = normalizeText(person.name);
  const personTrips = sortTrips(
    trips.filter((trip) => trip.people.some((name) => normalizeText(name) === personName)),
    "date_desc"
  );
  const stops = flattenTripRoutePoints(personTrips);
  const years = getTripYears(personTrips);
  const companions = getTravelCompanions(person.name, personTrips);

  return {
    person,
    trips: personTrips,
    stops,
    years,
    companions,
    recentTrip: personTrips[0] || null,
  };
}

function getTimelineKey(trip: Trip) {
  const date = trip.start_date || trip.end_date || "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return date.slice(0, 7);
  }
  return trip.trip_kind === "wishlist" ? "wishlist-undated" : "undated";
}

function getTimelineTitle(key: string) {
  if (key === "wishlist-undated") return "Wishlist / No date yet";
  if (key === "undated") return "No date yet";

  const [yearText, monthText] = key.split("-");
  const monthIndex = Number(monthText) - 1;
  return `${monthNames[monthIndex] || "Unknown"} ${yearText}`;
}

function compareTimelineKeys(a: string, b: string) {
  const aDateKey = /^\d{4}-\d{2}$/.test(a);
  const bDateKey = /^\d{4}-\d{2}$/.test(b);

  if (aDateKey && bDateKey) return b.localeCompare(a);
  if (aDateKey) return -1;
  if (bDateKey) return 1;
  return a.localeCompare(b);
}

function getTripYears(trips: Trip[]) {
  const years = new Set<string>();
  trips.forEach((trip) => {
    const date = trip.start_date || trip.end_date || "";
    if (/^\d{4}/.test(date)) {
      years.add(date.slice(0, 4));
    }
  });
  return [...years].sort((a, b) => b.localeCompare(a));
}

function getTravelCompanions(personName: string, trips: Trip[]) {
  const selected = normalizeText(personName);
  const counts = new Map<string, number>();

  trips.forEach((trip) => {
    trip.people.forEach((name) => {
      const normalized = normalizeText(name);
      if (!normalized || normalized === selected) return;
      const label = name.trim();
      counts.set(label, (counts.get(label) || 0) + 1);
    });
  });

  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}
