import { useMemo, useState } from "react";

import type { Trip } from "../api";
import type { TripFilterKind } from "../forms";
import { normalizeText, sortTrips, type TripSort } from "../utils";

export function useTripFilters(trips: Trip[]) {
  const [tripSearch, setTripSearch] = useState("");
  const [tripSort, setTripSort] = useState<TripSort>("date_desc");
  const [tripFilterKind, setTripFilterKind] = useState<TripFilterKind>("all");
  const [tripPeopleFilter, setTripPeopleFilter] = useState<string[]>([]);

  const displayedTrips = useMemo(() => {
    const query = tripSearch.trim().toLowerCase();
    const filtered = trips.filter((trip) => {
      if (tripFilterKind !== "all" && trip.trip_kind !== tripFilterKind) return false;
      if (
        tripPeopleFilter.length &&
        !tripPeopleFilter.every((name) =>
          trip.people.some((personName) => normalizeText(personName) === normalizeText(name))
        )
      ) {
        return false;
      }
      if (!query) return true;
      const haystack = [
        trip.title,
        trip.notes,
        trip.people.join(" "),
        trip.route.map((point) => point.label || "").join(" "),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
    return sortTrips(filtered, tripSort);
  }, [trips, tripFilterKind, tripPeopleFilter, tripSearch, tripSort]);

  const upcomingTrips = useMemo(
    () => trips.filter((trip) => trip.trip_kind === "wishlist").length,
    [trips]
  );

  return {
    tripSearch,
    setTripSearch,
    tripSort,
    setTripSort,
    tripFilterKind,
    setTripFilterKind,
    tripPeopleFilter,
    setTripPeopleFilter,
    displayedTrips,
    upcomingTrips,
  };
}
