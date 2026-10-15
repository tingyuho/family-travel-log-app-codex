import { useEffect, useMemo, useState } from "react";

export function useWebMapSelection({ activeTab, displayedTrips }) {
  const [selectedTripIds, setSelectedTripIds] = useState([]);
  const [focusedTripId, setFocusedTripId] = useState(null);
  const [mapDetail, setMapDetail] = useState(null);
  const [showMarkerClusters, setShowMarkerClusters] = useState(true);
  const [showHeatmap, setShowHeatmap] = useState(true);
  const [showRouteArrows, setShowRouteArrows] = useState(true);

  const selectedTripIdsSet = useMemo(() => new Set(selectedTripIds), [selectedTripIds]);
  const hasExplicitSelection = selectedTripIds.length > 0;
  const selectedTrips = useMemo(
    () => displayedTrips.filter((trip) => selectedTripIdsSet.has(trip.id)),
    [displayedTrips, selectedTripIdsSet]
  );
  const heatmapTrips = useMemo(() => {
    if (!hasExplicitSelection) return displayedTrips;
    return displayedTrips.filter((trip) => selectedTripIdsSet.has(trip.id));
  }, [displayedTrips, hasExplicitSelection, selectedTripIdsSet]);
  const focusedTrip = useMemo(
    () => displayedTrips.find((trip) => trip.id === focusedTripId) || null,
    [displayedTrips, focusedTripId]
  );
  const showSavedTripMapLayers = activeTab === "trips" || activeTab === "map";
  const mapDetailTrip = useMemo(() => {
    if (!mapDetail) return null;
    return displayedTrips.find((trip) => trip.id === mapDetail.tripId) || null;
  }, [displayedTrips, mapDetail]);

  useEffect(() => {
    const validIds = new Set(displayedTrips.map((trip) => trip.id));
    setSelectedTripIds((prev) => prev.filter((id) => validIds.has(id)));
    setFocusedTripId((prev) => (prev && validIds.has(prev) ? prev : null));
    setMapDetail((prev) => (prev && validIds.has(prev.tripId) ? prev : null));
  }, [displayedTrips]);

  const toggleTripSelection = (tripId, shouldFocus = true) => {
    setSelectedTripIds((prev) => {
      const alreadySelected = prev.includes(tripId);
      const next = alreadySelected
        ? prev.filter((id) => id !== tripId)
        : [...prev, tripId];
      if (shouldFocus) {
        if (alreadySelected) {
          setFocusedTripId(next.length ? next[next.length - 1] : null);
        } else {
          setFocusedTripId(tripId);
        }
      }
      return next;
    });
  };

  const showTripDetail = (trip, stopLabel = "", position = null) => {
    const fallback = trip.route?.[0] ? [trip.route[0].lat, trip.route[0].lng] : null;
    setMapDetail({ tripId: trip.id, stopLabel, position: position || fallback });
  };

  return {
    selectedTripIds,
    setSelectedTripIds,
    focusedTripId,
    setFocusedTripId,
    mapDetail,
    setMapDetail,
    showMarkerClusters,
    setShowMarkerClusters,
    showHeatmap,
    setShowHeatmap,
    showRouteArrows,
    setShowRouteArrows,
    selectedTripIdsSet,
    hasExplicitSelection,
    selectedTrips,
    heatmapTrips,
    focusedTrip,
    showSavedTripMapLayers,
    mapDetailTrip,
    toggleTripSelection,
    showTripDetail,
  };
}
