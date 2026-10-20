import { useMemo, useState } from "react";

import type { Trip } from "../api";

export function useMapSelection(trips: Trip[]) {
  const [selectedTripId, setSelectedTripId] = useState<number | null>(null);
  const [selectedTripIds, setSelectedTripIds] = useState<number[]>([]);
  const [selectedStopLabel, setSelectedStopLabel] = useState("");

  const selectedTrip = useMemo(
    () => (selectedTripId ? trips.find((trip) => trip.id === selectedTripId) || null : null),
    [selectedTripId, trips]
  );
  const selectedTrips = useMemo(
    () => selectedTripIds.map((id) => trips.find((trip) => trip.id === id)).filter((trip): trip is Trip => Boolean(trip)),
    [selectedTripIds, trips]
  );

  function toggleTripSelection(tripId: number) {
    setSelectedStopLabel("");
    if (selectedTripIds.includes(tripId)) {
      const next = selectedTripIds.filter((id) => id !== tripId);
      setSelectedTripIds(next);
      setSelectedTripId((current) => (current === tripId ? next[0] || null : current));
      return;
    }
    setSelectedTripIds([...selectedTripIds, tripId]);
    setSelectedTripId(tripId);
  }

  function clearTripSelections() {
    setSelectedTripIds([]);
    setSelectedTripId(null);
    setSelectedStopLabel("");
  }

  function selectOnlyTrip(tripId: number) {
    setSelectedTripIds([tripId]);
    setSelectedTripId(tripId);
    setSelectedStopLabel("");
  }

  return {
    selectedTripId,
    setSelectedTripId,
    selectedTripIds,
    setSelectedTripIds,
    selectedStopLabel,
    setSelectedStopLabel,
    selectedTrip,
    selectedTrips,
    toggleTripSelection,
    clearTripSelections,
    selectOnlyTrip,
  };
}
