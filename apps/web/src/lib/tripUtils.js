export function getTripKindLabel(kind) {
  return kind === "wishlist" ? "Wish List" : "Past Trip";
}

export function createEmptyAccommodation() {
  return {
    name: "",
    location: "",
    check_in: "",
    check_out: "",
    notes: "",
  };
}

export function createEmptyItineraryEvent() {
  return {
    date: "",
    time: "",
    activity: "",
    location: "",
    notes: "",
  };
}

export function createEmptyForm() {
  return {
    title: "",
    trip_kind: "past",
    start_date: "",
    end_date: "",
    notes: "",
    selected_person_ids: [],
    route_text: "",
    accommodations: [createEmptyAccommodation()],
    itinerary: [createEmptyItineraryEvent()],
  };
}

export function parseRoute(text) {
  if (!text.trim()) return [];
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, idx) => {
      const [lat, lng, ...labelParts] = line.split(",").map((part) => part.trim());
      const latitude = Number(lat);
      const longitude = Number(lng);
      if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
        throw new Error(`Invalid route line: "${line}"`);
      }
      return {
        lat: latitude,
        lng: longitude,
        label: labelParts.join(", ") || `Stop ${idx + 1}`,
        order: idx,
      };
    });
}

export function formatRouteLine(point) {
  return `${point.lat},${point.lng},${point.label || ""}`.replace(/,+$/, "");
}

export function formatRouteText(route) {
  return (route || []).map(formatRouteLine).join("\n");
}

export function appendRouteStopText(routeText, stop) {
  const line = formatRouteLine(stop);
  return routeText.trim() ? `${routeText.trim()}\n${line}` : line;
}

export function removeRouteStopText(routeText, index) {
  return routeText
    .split("\n")
    .filter((line) => line.trim())
    .filter((_, lineIndex) => lineIndex !== index)
    .join("\n");
}

export function normalizeAccommodationRows(accommodations) {
  const rows = (accommodations || []).map((stay) => ({
    name: stay.name || "",
    location: stay.location || "",
    check_in: stay.check_in || "",
    check_out: stay.check_out || "",
    notes: stay.notes || "",
  }));
  return rows.length ? rows : [createEmptyAccommodation()];
}

export function cleanAccommodationRows(accommodations) {
  return (accommodations || [])
    .map((stay) => ({
      name: stay.name.trim(),
      location: stay.location.trim(),
      check_in: stay.check_in.trim(),
      check_out: stay.check_out.trim(),
      notes: stay.notes.trim(),
    }))
    .filter((stay) => Object.values(stay).some(Boolean))
    .map((stay) => ({
      name: stay.name,
      location: stay.location,
      check_in: stay.check_in || null,
      check_out: stay.check_out || null,
      notes: stay.notes,
    }));
}

export function normalizeItineraryRows(itinerary) {
  const rows = (itinerary || []).map((item) => ({
    date: item.date || "",
    time: item.time || "",
    activity: item.activity || "",
    location: item.location || "",
    notes: item.notes || "",
  }));
  return rows.length ? rows : [createEmptyItineraryEvent()];
}

export function cleanItineraryRows(itinerary) {
  return (itinerary || [])
    .map((item) => ({
      date: (item.date || "").trim(),
      time: (item.time || "").trim(),
      activity: (item.activity || "").trim(),
      location: (item.location || "").trim(),
      notes: (item.notes || "").trim(),
    }))
    .filter((item) => item.date && item.activity)
    .map((item) => ({
      date: item.date,
      time: item.time,
      activity: item.activity,
      location: item.location,
      notes: item.notes,
    }));
}

export function parseItemsText(text) {
  const seen = new Set();
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

export function formatItemsText(items) {
  return (items || []).join("\n");
}

export function normalizePersonName(name) {
  return (name || "").trim().toLowerCase();
}

export function isInvalidDateRange(startDate, endDate) {
  return Boolean(startDate && endDate && endDate < startDate);
}

export function normalizeTripKind(kind) {
  return kind === "wishlist" ? "wishlist" : "past";
}

export function sortTrips(trips, sortBy) {
  return [...trips].sort((a, b) => {
    if (sortBy === "name_asc" || sortBy === "name_desc") {
      const result = (a.title || "").localeCompare(b.title || "");
      return sortBy === "name_asc" ? result : -result;
    }
    const aDate = a.start_date || "";
    const bDate = b.start_date || "";
    if (!aDate && !bDate) return (b.id || 0) - (a.id || 0);
    if (!aDate) return 1;
    if (!bDate) return -1;
    const result = aDate.localeCompare(bDate);
    return sortBy === "date_asc" ? result : -result;
  });
}

export function reorderByIds(list, draggedId, targetId) {
  if (!draggedId || !targetId || draggedId === targetId) return list;
  const current = [...list];
  const fromIndex = current.findIndex((item) => item.id === draggedId);
  const toIndex = current.findIndex((item) => item.id === targetId);
  if (fromIndex < 0 || toIndex < 0) return list;
  const [moved] = current.splice(fromIndex, 1);
  current.splice(toIndex, 0, moved);
  return current.map((item, index) => ({ ...item, sort_order: index + 1 }));
}
