import { useEffect, useMemo, useRef, useState } from "react";

export function useWebTripFilters({
  trips,
  peopleProfiles,
  normalizePersonName,
  normalizeTripKind,
  sortTrips,
}) {
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState("date_desc");
  const [selectedPeopleFilters, setSelectedPeopleFilters] = useState([]);
  const [selectedTripKindFilter, setSelectedTripKindFilter] = useState("all");
  const [isPersonFilterOpen, setIsPersonFilterOpen] = useState(false);
  const personFilterRef = useRef(null);

  const peopleFilterOptions = useMemo(() => {
    const allNames = [
      ...peopleProfiles.map((person) => person.name),
      ...trips.flatMap((trip) => trip.people || []),
    ];
    return [...new Set(allNames.map((name) => name.trim()).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b)
    );
  }, [peopleProfiles, trips]);

  const filteredTrips = useMemo(() => {
    let list = trips;
    if (selectedTripKindFilter !== "all") {
      list = list.filter((trip) => normalizeTripKind(trip.trip_kind) === selectedTripKindFilter);
    }
    if (!selectedPeopleFilters.length) return list;
    const selectedSet = new Set(selectedPeopleFilters.map(normalizePersonName));
    return list.filter((trip) => {
      const tripPeopleSet = new Set((trip.people || []).map(normalizePersonName));
      return [...selectedSet].every((selectedName) => tripPeopleSet.has(selectedName));
    });
  }, [trips, selectedPeopleFilters, selectedTripKindFilter, normalizePersonName, normalizeTripKind]);

  const displayedTrips = useMemo(() => sortTrips(filteredTrips, sortBy), [filteredTrips, sortBy, sortTrips]);

  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (!personFilterRef.current) return;
      if (!personFilterRef.current.contains(event.target)) {
        setIsPersonFilterOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  const togglePersonFilter = (personName) => {
    setSelectedPeopleFilters((prev) =>
      prev.includes(personName)
        ? prev.filter((name) => name !== personName)
        : [...prev, personName]
    );
  };

  return {
    query,
    setQuery,
    sortBy,
    setSortBy,
    selectedPeopleFilters,
    setSelectedPeopleFilters,
    selectedTripKindFilter,
    setSelectedTripKindFilter,
    isPersonFilterOpen,
    setIsPersonFilterOpen,
    personFilterRef,
    peopleFilterOptions,
    filteredTrips,
    displayedTrips,
    togglePersonFilter,
  };
}
