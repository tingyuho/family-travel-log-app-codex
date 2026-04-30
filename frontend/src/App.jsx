import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import {
  CircleMarker,
  MapContainer,
  Marker,
  Polyline,
  Popup,
  TileLayer,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import {
  clearAuthState,
  createPackingTemplate,
  createPeopleProfile,
  createTrip,
  deletePackingTemplate,
  deletePeopleProfile,
  deleteTrip,
  fetchMe,
  fetchPackingTemplates,
  fetchPeopleProfiles,
  fetchTrips,
  getAuthState,
  login,
  logout,
  register,
  requestPasswordReset,
  resetPassword,
  updatePackingTemplate,
  updatePeopleProfile,
  updateMyProfile,
  updateTrip,
} from "./api";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import "leaflet.heat";
import "./styles.css";

const pinIcon = new L.Icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

function createEmptyAccommodation() {
  return {
    name: "",
    location: "",
    check_in: "",
    check_out: "",
    notes: "",
  };
}

function createEmptyItineraryEvent() {
  return {
    date: "",
    time: "",
    activity: "",
    location: "",
    notes: "",
  };
}

function createEmptyForm() {
  return {
    title: "",
    start_date: "",
    end_date: "",
    notes: "",
    selected_person_ids: [],
    route_text: "",
    accommodations: [createEmptyAccommodation()],
    itinerary: [createEmptyItineraryEvent()],
  };
}

function parseRoute(text) {
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

function formatRouteText(route) {
  return (route || [])
    .map((point) => `${point.lat},${point.lng},${point.label || ""}`.replace(/,+$/, ""))
    .join("\n");
}

function normalizeAccommodationRows(accommodations) {
  const rows = (accommodations || []).map((stay) => ({
    name: stay.name || "",
    location: stay.location || "",
    check_in: stay.check_in || "",
    check_out: stay.check_out || "",
    notes: stay.notes || "",
  }));
  return rows.length ? rows : [createEmptyAccommodation()];
}

function cleanAccommodationRows(accommodations) {
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

function normalizeItineraryRows(itinerary) {
  const rows = (itinerary || []).map((item) => ({
    date: item.date || "",
    time: item.time || "",
    activity: item.activity || "",
    location: item.location || "",
    notes: item.notes || "",
  }));
  return rows.length ? rows : [createEmptyItineraryEvent()];
}

function cleanItineraryRows(itinerary) {
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

function parseItemsText(text) {
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

function formatItemsText(items) {
  return (items || []).join("\n");
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function toDateInputValue(date) {
  return date.toISOString().slice(0, 10);
}

function weatherDescription(code) {
  if (code === 0) return "Clear";
  if ([1, 2, 3].includes(code)) return "Partly cloudy";
  if ([45, 48].includes(code)) return "Fog";
  if ([51, 53, 55, 56, 57].includes(code)) return "Drizzle";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "Rain";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "Snow";
  if ([95, 96, 99].includes(code)) return "Thunderstorms";
  return "Mixed weather";
}

function weatherPackingHints(days) {
  const hints = new Set();
  days.forEach((day) => {
    if ((day.precipitation || 0) > 0.05) hints.add("Pack rain jackets or umbrellas");
    if ((day.tempMin || 999) < 50) hints.add("Pack warm layers");
    if ((day.tempMax || 0) > 82) hints.add("Pack sunscreen and extra water bottles");
    if ((day.wind || 0) > 20) hints.add("Plan for windy outdoor activities");
    if ([71, 73, 75, 77, 85, 86].includes(day.code)) hints.add("Pack snow-ready footwear");
  });
  return [...hints];
}

function weatherVisualKind(code) {
  if (code === 0) return "clear";
  if ([1, 2, 3].includes(code)) return "partly";
  if ([45, 48].includes(code)) return "fog";
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "rain";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "snow";
  if ([95, 96, 99].includes(code)) return "storm";
  return "cloud";
}

function formatTemperatureRange(min, max) {
  const low = Number.isFinite(min) ? Math.round(min) : null;
  const high = Number.isFinite(max) ? Math.round(max) : null;
  const toCelsius = (fahrenheit) => Math.round((fahrenheit - 32) * (5 / 9));
  if (low === null && high === null) return "N/A";
  if (low === null) return `${high} F (${toCelsius(high)} C)`;
  if (high === null) return `${low} F (${toCelsius(low)} C)`;
  return `${low}-${high} F (${toCelsius(low)}-${toCelsius(high)} C)`;
}

async function getWeatherReportsForTrip(trip, signal) {
  const stops = (trip.route || []).slice(0, 6);
  if (!trip.start_date || !trip.end_date || !stops.length) return [];

  const today = new Date();
  const todayText = toDateInputValue(today);
  const forecastLimit = toDateInputValue(addDays(today, 15));
  const isHistorical = trip.end_date < todayText;
  const startDate = isHistorical
    ? trip.start_date
    : trip.start_date < todayText
      ? todayText
      : trip.start_date;
  const endDate = isHistorical
    ? trip.end_date
    : trip.end_date > forecastLimit
      ? forecastLimit
      : trip.end_date;

  if (!isHistorical && startDate > forecastLimit) {
    throw new Error("Forecasts are only available for trips within about the next 16 days.");
  }

  const endpoint = isHistorical
    ? "https://archive-api.open-meteo.com/v1/archive"
    : "https://api.open-meteo.com/v1/forecast";

  return Promise.all(
    stops.map(async (stop, index) => {
      const params = new URLSearchParams({
        latitude: String(stop.lat),
        longitude: String(stop.lng),
        daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max",
        temperature_unit: "fahrenheit",
        wind_speed_unit: "mph",
        precipitation_unit: "inch",
        timezone: "auto",
        start_date: startDate,
        end_date: endDate < startDate ? startDate : endDate,
      });
      const response = await fetch(`${endpoint}?${params.toString()}`, { signal });
      if (!response.ok) {
        throw new Error("Weather lookup failed.");
      }
      const data = await response.json();
      const daily = data.daily || {};
      const days = (daily.time || []).map((date, dayIndex) => ({
        date,
        code: daily.weather_code?.[dayIndex],
        summary: weatherDescription(daily.weather_code?.[dayIndex]),
        tempMax: daily.temperature_2m_max?.[dayIndex],
        tempMin: daily.temperature_2m_min?.[dayIndex],
        precipitation: daily.precipitation_sum?.[dayIndex],
        wind: daily.wind_speed_10m_max?.[dayIndex],
      }));
      return {
        id: `${trip.id || "trip"}-${index}`,
        label: stop.label || `Stop ${index + 1}`,
        mode: isHistorical ? "Historical" : "Forecast",
        days,
        hints: weatherPackingHints(days),
      };
    })
  );
}

function WeatherPicture({ code, label }) {
  const kind = weatherVisualKind(code);
  return (
    <div className={`weather-picture weather-${kind}`} role="img" aria-label={label}>
      {["clear", "partly"].includes(kind) ? <span className="weather-sun" /> : null}
      {kind !== "clear" ? <span className="weather-cloud" /> : null}
      {kind === "rain" ? (
        <span className="weather-rain">
          <i />
          <i />
          <i />
        </span>
      ) : null}
      {kind === "snow" ? (
        <span className="weather-snow">
          <i />
          <i />
          <i />
        </span>
      ) : null}
      {kind === "storm" ? <span className="weather-bolt" /> : null}
      {kind === "fog" ? (
        <span className="weather-fog">
          <i />
          <i />
          <i />
        </span>
      ) : null}
    </div>
  );
}

function tripToMapCenter(trips) {
  const points = trips.flatMap((trip) => trip.route || []);
  if (!points.length) return [37.0902, -95.7129];
  return [points[0].lat, points[0].lng];
}

function normalizePersonName(name) {
  return (name || "").trim().toLowerCase();
}

function isInvalidDateRange(startDate, endDate) {
  return Boolean(startDate && endDate && endDate < startDate);
}

function isValidEmail(value) {
  return /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test((value || "").trim());
}

function sortTrips(trips, sortBy) {
  const list = [...trips];
  if (sortBy === "name_asc") {
    return list.sort((a, b) => a.title.localeCompare(b.title));
  }
  if (sortBy === "name_desc") {
    return list.sort((a, b) => b.title.localeCompare(a.title));
  }

  const direction = sortBy === "date_asc" ? 1 : -1;
  return list.sort((a, b) => {
    const aDate = Date.parse(a.start_date || a.end_date || a.created_at || "");
    const bDate = Date.parse(b.start_date || b.end_date || b.created_at || "");
    const aRank = Number.isNaN(aDate) ? Number.POSITIVE_INFINITY : aDate;
    const bRank = Number.isNaN(bDate) ? Number.POSITIVE_INFINITY : bDate;
    if (aRank === bRank) return a.title.localeCompare(b.title);
    return (aRank - bRank) * direction;
  });
}

function normalizeLng(lng) {
  return ((((lng + 180) % 360) + 360) % 360) - 180;
}

function buildFocusBounds(points) {
  const latLngs = points.map(([lat, lng]) => L.latLng(lat, lng));
  if (!latLngs.length) return null;

  let bounds = L.latLngBounds(latLngs);
  const directSpan = bounds.getEast() - bounds.getWest();

  // If selected points straddle the date line, shift negative longitudes to reduce span.
  if (directSpan > 180) {
    const shifted = latLngs.map((point) =>
      L.latLng(point.lat, point.lng < 0 ? point.lng + 360 : point.lng)
    );
    const shiftedBounds = L.latLngBounds(shifted);
    const sw = shiftedBounds.getSouthWest();
    const ne = shiftedBounds.getNorthEast();
    bounds = L.latLngBounds(
      [sw.lat, normalizeLng(sw.lng)],
      [ne.lat, normalizeLng(ne.lng)]
    );
  }

  return bounds.pad(0.14);
}

function MapFocus({ selectedTrips }) {
  const map = useMap();
  useEffect(() => {
    if (!selectedTrips?.length) return;
    const points = selectedTrips
      .flatMap((trip) => trip.route || [])
      .map((point) => [point.lat, point.lng]);
    if (!points.length) return;
    if (points.length === 1) {
      map.setView(points[0], Math.max(map.getZoom(), 7), { animate: true });
      return;
    }
    const bounds = buildFocusBounds(points);
    if (!bounds || !bounds.isValid()) return;
    map.fitBounds(bounds, {
      padding: [42, 42],
      maxZoom: 8,
      animate: true,
    });
  }, [map, selectedTrips]);
  return null;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildTripPopupHtml(trip, stopLabel) {
  const stays = (trip.accommodations || [])
    .map((stay) => {
      const stayName = escapeHtml(stay.name || "Stay");
      const stayLocation = stay.location ? `, ${escapeHtml(stay.location)}` : "";
      const stayDates = stay.check_in || stay.check_out
        ? ` (${escapeHtml(stay.check_in || "?")} - ${escapeHtml(stay.check_out || "?")})`
        : "";
      return `<li>${stayName}${stayLocation}${stayDates}</li>`;
    })
    .join("");

  return `
    <div class="trip-popup">
      <h4>${escapeHtml(trip.title || "Trip")}</h4>
      ${stopLabel ? `<p><strong>Stop:</strong> ${escapeHtml(stopLabel)}</p>` : ""}
      <p><strong>Dates:</strong> ${escapeHtml(trip.start_date || "Unknown start")} - ${escapeHtml(trip.end_date || "Unknown end")}</p>
      ${trip.notes ? `<p>${escapeHtml(trip.notes)}</p>` : ""}
      ${(trip.people || []).length ? `<p><strong>People:</strong> ${(trip.people || []).map(escapeHtml).join(", ")}</p>` : ""}
      ${stays ? `<div><strong>Stays:</strong><ul>${stays}</ul></div>` : ""}
    </div>
  `;
}

function ClusteredTripMarkers({
  trips,
  selectedTripIdsSet,
  hasExplicitSelection,
  onToggleTripSelection,
  onShowTripDetail,
}) {
  const map = useMap();

  useEffect(() => {
    const globalLeaflet = typeof window !== "undefined" ? window.L : null;
    const clusterFactory = L.markerClusterGroup || globalLeaflet?.markerClusterGroup;
    if (typeof clusterFactory !== "function") return undefined;

    const clusterGroup = clusterFactory({
      chunkedLoading: true,
      disableClusteringAtZoom: 10,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
    });

    trips.forEach((trip) => {
      const isSelected = selectedTripIdsSet.has(trip.id);
      const shouldHighlight = !hasExplicitSelection || isSelected;
      (trip.route || []).forEach((point, idx) => {
        const marker = L.marker([point.lat, point.lng], {
          icon: pinIcon,
          opacity: shouldHighlight ? 1 : 0.55,
        });
        marker.on("click", () => {
          onToggleTripSelection(trip.id);
          onShowTripDetail(trip, point.label || `Stop ${idx + 1}`);
        });
        marker.bindPopup(buildTripPopupHtml(trip, point.label || `Stop ${idx + 1}`));
        clusterGroup.addLayer(marker);
      });
    });

    map.addLayer(clusterGroup);
    return () => {
      map.removeLayer(clusterGroup);
    };
  }, [map, trips, selectedTripIdsSet, hasExplicitSelection, onToggleTripSelection]);

  return null;
}

function TripHeatmapLayer({ trips }) {
  const map = useMap();

  useEffect(() => {
    const globalLeaflet = typeof window !== "undefined" ? window.L : null;
    const heatFactory = L.heatLayer || globalLeaflet?.heatLayer;
    if (typeof heatFactory !== "function") return undefined;

    const bucketedPoints = new Map();
    trips.forEach((trip) => {
      (trip.route || []).forEach((point) => {
        const key = `${point.lat.toFixed(2)}|${point.lng.toFixed(2)}`;
        const existing = bucketedPoints.get(key);
        if (existing) {
          existing.count += 1;
          return;
        }
        bucketedPoints.set(key, { lat: point.lat, lng: point.lng, count: 1 });
      });
    });

    const pointList = [...bucketedPoints.values()];
    if (!pointList.length) return undefined;

    const maxCount = Math.max(...pointList.map((point) => point.count));
    const heatPoints = pointList.map((point) => [
      point.lat,
      point.lng,
      Math.max(0.25, point.count / Math.max(1, maxCount)),
    ]);

    const heatLayer = heatFactory(heatPoints, {
      radius: 28,
      blur: 24,
      minOpacity: 0.3,
      maxZoom: 7,
      gradient: {
        0.2: "#4cc9f0",
        0.4: "#3a86ff",
        0.6: "#ffbe0b",
        0.8: "#fb5607",
        1: "#d00000",
      },
    });

    map.addLayer(heatLayer);
    return () => {
      map.removeLayer(heatLayer);
    };
  }, [map, trips]);

  return null;
}

function TripPopupContent({ trip, stopLabel }) {
  return (
    <div className="trip-popup">
      <h4>{trip.title}</h4>
      {stopLabel ? <p><strong>Stop:</strong> {stopLabel}</p> : null}
      <p>
        <strong>Dates:</strong> {trip.start_date || "Unknown start"} - {trip.end_date || "Unknown end"}
      </p>
      {trip.notes ? <p>{trip.notes}</p> : null}
      {trip.people?.length ? <p><strong>People:</strong> {trip.people.join(", ")}</p> : null}
      {trip.accommodations?.length ? (
        <div>
          <strong>Stays:</strong>
          <ul>
            {trip.accommodations.map((stay, idx) => (
              <li key={`${trip.id}-stay-${idx}`}>
                {stay.name}
                {stay.location ? `, ${stay.location}` : ""}
                {stay.check_in || stay.check_out
                  ? ` (${stay.check_in || "?"} - ${stay.check_out || "?"})`
                  : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function MapTripDetailPanel({ trip, stopLabel, onClose }) {
  if (!trip) return null;
  return (
    <aside className="map-detail-panel" role="dialog" aria-label="Trip details">
      <button
        type="button"
        className="map-detail-close"
        onClick={onClose}
        aria-label="Close trip details"
      >
        x
      </button>
      <TripPopupContent trip={trip} stopLabel={stopLabel} />
    </aside>
  );
}

function AccommodationRepeater({ accommodations, onChange }) {
  const rows = Array.isArray(accommodations) && accommodations.length
    ? accommodations
    : [createEmptyAccommodation()];

  const updateRow = (index, field, value) => {
    const next = rows.map((row, rowIndex) => (rowIndex === index ? { ...row, [field]: value } : row));
    onChange(next);
  };

  const addRow = () => {
    onChange([...rows, createEmptyAccommodation()]);
  };

  const removeRow = (index) => {
    const next = rows.filter((_, rowIndex) => rowIndex !== index);
    onChange(next.length ? next : [createEmptyAccommodation()]);
  };

  return (
    <div className="accommodation-repeater">
      {rows.map((row, index) => (
        <div key={`stay-${index}`} className="accommodation-row">
          <div className="accommodation-row-header">
            <strong>Accommodation {index + 1}</strong>
            <button type="button" className="ghost-btn" onClick={() => removeRow(index)}>
              Remove
            </button>
          </div>
          <div className="accommodation-grid">
            <label>
              Name
              <input
                value={row.name}
                onChange={(event) => updateRow(index, "name", event.target.value)}
                placeholder="Hotel, rental, lodge..."
              />
            </label>
            <label>
              Location
              <input
                value={row.location}
                onChange={(event) => updateRow(index, "location", event.target.value)}
                placeholder="Seattle, WA"
              />
            </label>
            <label>
              Check-in
              <input
                type="date"
                value={row.check_in}
                onChange={(event) => updateRow(index, "check_in", event.target.value)}
              />
            </label>
            <label>
              Check-out
              <input
                type="date"
                value={row.check_out}
                onChange={(event) => updateRow(index, "check_out", event.target.value)}
              />
            </label>
            <label className="accommodation-notes">
              Notes
              <textarea
                rows={2}
                value={row.notes}
                onChange={(event) => updateRow(index, "notes", event.target.value)}
                placeholder="Near the beach, parking included..."
              />
            </label>
          </div>
        </div>
      ))}
      <button type="button" className="ghost-btn accommodation-add-btn" onClick={addRow}>
        + Add another stay
      </button>
    </div>
  );
}

function ItineraryRepeater({ itinerary, onChange }) {
  const rows = Array.isArray(itinerary) && itinerary.length ? itinerary : [createEmptyItineraryEvent()];

  const updateRow = (index, field, value) => {
    const next = rows.map((row, rowIndex) => (rowIndex === index ? { ...row, [field]: value } : row));
    onChange(next);
  };

  const addRow = () => {
    onChange([...rows, createEmptyItineraryEvent()]);
  };

  const removeRow = (index) => {
    const next = rows.filter((_, rowIndex) => rowIndex !== index);
    onChange(next.length ? next : [createEmptyItineraryEvent()]);
  };

  return (
    <div className="itinerary-repeater">
      {rows.map((row, index) => (
        <div key={`itinerary-${index}`} className="itinerary-row">
          <div className="itinerary-row-header">
            <strong>Item {index + 1}</strong>
            <button type="button" className="ghost-btn" onClick={() => removeRow(index)}>
              Remove
            </button>
          </div>
          <div className="itinerary-grid">
            <label>
              Date
              <input
                type="date"
                value={row.date}
                onChange={(event) => updateRow(index, "date", event.target.value)}
              />
            </label>
            <label>
              Time
              <input
                type="time"
                value={row.time}
                onChange={(event) => updateRow(index, "time", event.target.value)}
              />
            </label>
            <label>
              Activity
              <input
                value={row.activity}
                onChange={(event) => updateRow(index, "activity", event.target.value)}
                placeholder="Museum visit, beach time, check-in"
              />
            </label>
            <label>
              Location
              <input
                value={row.location}
                onChange={(event) => updateRow(index, "location", event.target.value)}
                placeholder="Location"
              />
            </label>
            <label className="itinerary-notes">
              Notes
              <textarea
                rows={2}
                value={row.notes}
                onChange={(event) => updateRow(index, "notes", event.target.value)}
                placeholder="Tickets booked, meeting point, reminders"
              />
            </label>
          </div>
        </div>
      ))}
      <button type="button" className="ghost-btn itinerary-add-btn" onClick={addRow}>
        + Add itinerary item
      </button>
      <p className="helper-text">Only items with both date and activity are saved.</p>
    </div>
  );
}

function formatTimelineDate(dateText) {
  if (!dateText) return "General";
  const parsed = new Date(`${dateText}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return dateText;
  return parsed.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function buildTripTimelineDays(trip) {
  const buckets = new Map();

  const pushItem = (date, item) => {
    const key = date || "general";
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(item);
  };

  (trip.itinerary || []).forEach((event) => {
    pushItem(event.date, {
      type: "activity",
      time: event.time || "",
      title: event.activity,
      location: event.location || "",
      notes: event.notes || "",
    });
  });

  (trip.accommodations || []).forEach((stay) => {
    if (stay.check_in) {
      pushItem(stay.check_in, {
        type: "stay",
        time: "",
        title: `Check-in: ${stay.name}`,
        location: stay.location || "",
        notes: stay.notes || "",
      });
    }
    if (stay.check_out) {
      pushItem(stay.check_out, {
        type: "stay",
        time: "",
        title: `Check-out: ${stay.name}`,
        location: stay.location || "",
        notes: stay.notes || "",
      });
    }
  });

  if (trip.notes?.trim()) {
    pushItem(trip.start_date || "", {
      type: "note",
      time: "",
      title: "Trip Notes",
      location: "",
      notes: trip.notes.trim(),
    });
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => {
      if (a === "general") return 1;
      if (b === "general") return -1;
      return a.localeCompare(b);
    })
    .map(([date, items]) => ({
      date,
      label: formatTimelineDate(date === "general" ? "" : date),
      items: [...items].sort((a, b) => (a.time || "99:99").localeCompare(b.time || "99:99")),
    }));
}

function TripItineraryTimeline({ trip }) {
  const days = buildTripTimelineDays(trip);
  if (!days.length) {
    return <p className="helper-text">No itinerary items yet.</p>;
  }

  return (
    <div className="itinerary-timeline">
      {days.map((day) => (
        <section key={`${trip.id}-${day.date || "general"}`} className="itinerary-day-card">
          <h4>{day.label}</h4>
          <ul>
            {day.items.map((item, idx) => (
              <li key={`${trip.id}-${day.date}-${idx}`}>
                <div className="itinerary-item-head">
                  <span className={`itinerary-badge itinerary-${item.type}`}>{item.type}</span>
                  <strong>{item.title}</strong>
                  {item.time ? <time>{item.time}</time> : null}
                </div>
                {item.location ? <p className="itinerary-location">{item.location}</p> : null}
                {item.notes ? <p className="itinerary-notes-text">{item.notes}</p> : null}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function addDaysToDateText(dateText, days) {
  if (!dateText) return "";
  const [year, month, day] = dateText.split("-").map((part) => Number(part));
  const date = new Date(year, (month || 1) - 1, day || 1);
  if (Number.isNaN(date.getTime())) return dateText;
  date.setDate(date.getDate() + days);
  const yyyy = String(date.getFullYear()).padStart(4, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function toCompactDate(dateText) {
  return (dateText || "").replaceAll("-", "");
}

function toCompactDateTime(dateText, timeText) {
  const datePart = toCompactDate(dateText);
  const [hours = "00", minutes = "00"] = (timeText || "").split(":");
  return `${datePart}T${hours.padStart(2, "0")}${minutes.padStart(2, "0")}00`;
}

function escapeIcsText(text) {
  return (text || "")
    .replaceAll("\\", "\\\\")
    .replaceAll("\n", "\\n")
    .replaceAll(",", "\\,")
    .replaceAll(";", "\\;");
}

function buildCalendarEvents(trip) {
  const events = [];
  const tripSummaryLines = [];

  if (trip.notes?.trim()) tripSummaryLines.push(`Trip notes: ${trip.notes.trim()}`);
  if (trip.people?.length) tripSummaryLines.push(`People: ${trip.people.join(", ")}`);
  if (trip.route?.length) {
    const stops = trip.route.map((point) => point.label || `${point.lat},${point.lng}`).join(" -> ");
    tripSummaryLines.push(`Route: ${stops}`);
  }

  const accommodations = trip.accommodations || [];
  if (accommodations.length) {
    tripSummaryLines.push("Accommodations:");
    accommodations.forEach((stay) => {
      tripSummaryLines.push(
        `- ${stay.name}${stay.location ? ` (${stay.location})` : ""}${stay.check_in || stay.check_out ? ` ${stay.check_in || "?"} to ${stay.check_out || "?"}` : ""}`
      );
    });
  }

  const itinerary = trip.itinerary || [];
  if (itinerary.length) {
    tripSummaryLines.push("Itinerary:");
    itinerary.forEach((item) => {
      tripSummaryLines.push(
        `- ${item.date}${item.time ? ` ${item.time}` : ""}: ${item.activity}${item.location ? ` @ ${item.location}` : ""}${item.notes ? ` (${item.notes})` : ""}`
      );
    });
  }

  if (trip.start_date) {
    events.push({
      title: trip.title || "Trip",
      isAllDay: true,
      startDate: trip.start_date,
      endDateExclusive: addDaysToDateText(trip.end_date || trip.start_date, 1),
      location: accommodations[0]?.location || "",
      details: tripSummaryLines.join("\n"),
    });
  }

  accommodations.forEach((stay) => {
    if (stay.check_in) {
      events.push({
        title: `Check-in: ${stay.name}`,
        isAllDay: true,
        startDate: stay.check_in,
        endDateExclusive: addDaysToDateText(stay.check_in, 1),
        location: stay.location || "",
        details: stay.notes || "",
      });
    }
    if (stay.check_out) {
      events.push({
        title: `Check-out: ${stay.name}`,
        isAllDay: true,
        startDate: stay.check_out,
        endDateExclusive: addDaysToDateText(stay.check_out, 1),
        location: stay.location || "",
        details: stay.notes || "",
      });
    }
  });

  itinerary.forEach((item) => {
    if (!item.date || !item.activity) return;
    if (item.time) {
      const [h = "09", m = "00"] = item.time.split(":");
      const startDateTime = `${item.date}T${h.padStart(2, "0")}:${m.padStart(2, "0")}:00`;
      const dateObj = new Date(startDateTime);
      const endObj = Number.isNaN(dateObj.getTime()) ? new Date(`${item.date}T10:00:00`) : new Date(dateObj.getTime() + 60 * 60 * 1000);
      const endDateText = `${endObj.getFullYear()}-${String(endObj.getMonth() + 1).padStart(2, "0")}-${String(endObj.getDate()).padStart(2, "0")}`;
      const endTimeText = `${String(endObj.getHours()).padStart(2, "0")}:${String(endObj.getMinutes()).padStart(2, "0")}`;
      events.push({
        title: item.activity,
        isAllDay: false,
        startDate: item.date,
        startTime: item.time,
        endDate: endDateText,
        endTime: endTimeText,
        location: item.location || "",
        details: item.notes || "",
      });
    } else {
      events.push({
        title: item.activity,
        isAllDay: true,
        startDate: item.date,
        endDateExclusive: addDaysToDateText(item.date, 1),
        location: item.location || "",
        details: item.notes || "",
      });
    }
  });

  return events.filter((event) => event.startDate && event.title);
}

function buildGoogleCalendarUrl(event) {
  const base = "https://calendar.google.com/calendar/render";
  const params = new URLSearchParams();
  params.set("action", "TEMPLATE");
  params.set("text", event.title);
  if (event.isAllDay) {
    params.set("dates", `${toCompactDate(event.startDate)}/${toCompactDate(event.endDateExclusive || addDaysToDateText(event.startDate, 1))}`);
  } else {
    params.set(
      "dates",
      `${toCompactDateTime(event.startDate, event.startTime || "09:00")}/${toCompactDateTime(event.endDate || event.startDate, event.endTime || "10:00")}`
    );
  }
  if (event.location) params.set("location", event.location);
  if (event.details) params.set("details", event.details);
  return `${base}?${params.toString()}`;
}

function buildTripIcsText(trip) {
  const now = new Date();
  const stamp = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}${String(now.getUTCDate()).padStart(2, "0")}T${String(now.getUTCHours()).padStart(2, "0")}${String(now.getUTCMinutes()).padStart(2, "0")}${String(now.getUTCSeconds()).padStart(2, "0")}Z`;
  const events = buildCalendarEvents(trip);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Family Travel Log//EN",
    "CALSCALE:GREGORIAN",
  ];

  events.forEach((event, index) => {
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${trip.id}-${index}@family-travel-log`);
    lines.push(`DTSTAMP:${stamp}`);
    lines.push(`SUMMARY:${escapeIcsText(event.title)}`);
    if (event.location) lines.push(`LOCATION:${escapeIcsText(event.location)}`);
    if (event.details) lines.push(`DESCRIPTION:${escapeIcsText(event.details)}`);
    if (event.isAllDay) {
      lines.push(`DTSTART;VALUE=DATE:${toCompactDate(event.startDate)}`);
      lines.push(`DTEND;VALUE=DATE:${toCompactDate(event.endDateExclusive || addDaysToDateText(event.startDate, 1))}`);
    } else {
      lines.push(`DTSTART:${toCompactDateTime(event.startDate, event.startTime || "09:00")}`);
      lines.push(`DTEND:${toCompactDateTime(event.endDate || event.startDate, event.endTime || "10:00")}`);
    }
    lines.push("END:VEVENT");
  });

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

function WeatherPreview({ trip }) {
  const [reports, setReports] = useState([]);
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");
  const stops = trip?.route || [];
  const lookupKey = JSON.stringify({
    start: trip?.start_date || "",
    end: trip?.end_date || "",
    route: stops.slice(0, 6).map((stop) => [stop.lat, stop.lng, stop.label || ""]),
  });

  useEffect(() => {
    if (!trip?.start_date || !trip?.end_date || !stops.length) {
      setReports([]);
      setStatus("idle");
      setMessage("");
      return undefined;
    }

    const controller = new AbortController();
    setStatus("loading");
    setMessage("");
    getWeatherReportsForTrip(trip, controller.signal)
      .then((nextReports) => {
        setReports(nextReports);
        setStatus("ready");
      })
      .catch((err) => {
        if (err.name === "AbortError") return;
        setReports([]);
        setStatus("error");
        setMessage(err.message || "Could not load weather.");
      });

    return () => controller.abort();
  }, [lookupKey]);

  if (!trip?.start_date || !trip?.end_date) {
    return <p className="helper-text">Weather appears after Start and End dates are selected.</p>;
  }

  if (!stops.length) {
    return <p className="helper-text">Add route stops to preview weather for this trip.</p>;
  }

  return (
    <div className="weather-preview">
      <div className="weather-preview-header">
        <h3>Weather</h3>
        {status === "loading" ? <span>Loading...</span> : null}
        {reports[0]?.mode ? <span>{reports[0].mode}</span> : null}
      </div>
      {status === "error" ? <p className="helper-text">{message}</p> : null}
      {reports.length ? (
        <div className="weather-report-list">
          {reports.map((report) => (
            <section key={report.id} className="weather-card">
              <div className="weather-card-header">
                <h3>{report.label}</h3>
              </div>
              {report.hints.length ? (
                <div className="weather-hints">
                  {report.hints.map((hint) => (
                    <span key={`${report.id}-${hint}`}>{hint}</span>
                  ))}
                </div>
              ) : null}
              <ul>
                {report.days.map((day) => (
                  <li
                    key={`${report.id}-${day.date}`}
                    className="weather-day-picture"
                    title={`${day.date}: ${day.summary}`}
                  >
                    <time dateTime={day.date}>
                      {new Date(`${day.date}T00:00:00`).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })}
                    </time>
                    <WeatherPicture code={day.code} label={day.summary} />
                    <span className="weather-temp-range">
                      {formatTemperatureRange(day.tempMin, day.tempMax)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function App() {
  const [trips, setTrips] = useState([]);
  const [peopleProfiles, setPeopleProfiles] = useState([]);
  const [packingTemplates, setPackingTemplates] = useState([]);
  const [authReady, setAuthReady] = useState(false);
  const [currentUserId, setCurrentUserId] = useState("");
  const [currentUserEmail, setCurrentUserEmail] = useState("");
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [profileForm, setProfileForm] = useState({ email: "" });
  const [profileNotice, setProfileNotice] = useState("");
  const [resetCodeSent, setResetCodeSent] = useState(false);
  const [authMode, setAuthMode] = useState("login");
  const [authForm, setAuthForm] = useState({
    user_id: "",
    email: "",
    password: "",
    confirm_password: "",
  });
  const [resetForm, setResetForm] = useState({
    user_id: "",
    email_code: "",
    new_password: "",
    confirm_password: "",
    reset_key: "",
  });
  const [authNotice, setAuthNotice] = useState("");
  const [query, setQuery] = useState("");
  const [form, setForm] = useState(createEmptyForm);
  const [personDraft, setPersonDraft] = useState({
    name: "",
    relationship: "",
    notes: "",
  });
  const [packingDraft, setPackingDraft] = useState({
    name: "",
    items_text: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sortBy, setSortBy] = useState("date_desc");
  const [selectedPeopleFilters, setSelectedPeopleFilters] = useState([]);
  const [selectedTripIds, setSelectedTripIds] = useState([]);
  const [expandedWeatherTripIds, setExpandedWeatherTripIds] = useState([]);
  const [calendarSyncTripId, setCalendarSyncTripId] = useState(null);
  const [focusedTripId, setFocusedTripId] = useState(null);
  const [mapDetail, setMapDetail] = useState(null);
  const [showMarkerClusters, setShowMarkerClusters] = useState(true);
  const [showHeatmap, setShowHeatmap] = useState(true);
  const [isPersonFilterOpen, setIsPersonFilterOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("log");
  const [routeQuery, setRouteQuery] = useState("");
  const [routeResults, setRouteResults] = useState([]);
  const [routeSearching, setRouteSearching] = useState(false);
  const [tripEdit, setTripEdit] = useState(null);
  const [personEdit, setPersonEdit] = useState(null);
  const [packingEdit, setPackingEdit] = useState(null);
  const [activePackingTemplateId, setActivePackingTemplateId] = useState(null);
  const [checkedPackingItems, setCheckedPackingItems] = useState({});
  const personFilterRef = useRef(null);
  const packingChecksHydratedRef = useRef(false);

  const loadTrips = async (searchText = "") => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchTrips(searchText);
      setTrips(data);
    } catch (err) {
      setError(err.message || "Failed to load trips");
    } finally {
      setLoading(false);
    }
  };

  const loadPeopleProfiles = async () => {
    try {
      const data = await fetchPeopleProfiles();
      setPeopleProfiles(data);
    } catch (err) {
      setError(err.message || "Failed to load people profiles");
    }
  };

  const loadPackingTemplates = async () => {
    try {
      const data = await fetchPackingTemplates();
      setPackingTemplates(data);
      setActivePackingTemplateId((prev) => prev || data[0]?.id || null);
    } catch (err) {
      setError(err.message || "Failed to load packing templates");
    }
  };

  useEffect(() => {
    const boot = async () => {
      const auth = getAuthState();
      if (!auth.token) {
        setAuthReady(false);
        return;
      }
      try {
        const me = await fetchMe();
        setCurrentUserId(me.user_id);
        setCurrentUserEmail(me.email || "");
        setProfileForm({ email: me.email || "" });
        setAuthReady(true);
      } catch (_err) {
        clearAuthState();
        setAuthReady(false);
      }
    };
    boot();
  }, []);

  useEffect(() => {
    if (!authReady) return;
    loadTrips();
    loadPeopleProfiles();
    loadPackingTemplates();
  }, [authReady]);

  useEffect(() => {
    if (!authReady || !currentUserId) return;
    const stored = localStorage.getItem(`travel_log_packing_checks_${currentUserId}`);
    try {
      setCheckedPackingItems(stored ? JSON.parse(stored) : {});
    } catch (_err) {
      setCheckedPackingItems({});
    }
    packingChecksHydratedRef.current = true;
  }, [authReady, currentUserId]);

  useEffect(() => {
    if (!authReady || !currentUserId || !packingChecksHydratedRef.current) return;
    localStorage.setItem(
      `travel_log_packing_checks_${currentUserId}`,
      JSON.stringify(checkedPackingItems)
    );
  }, [authReady, checkedPackingItems, currentUserId]);

  useEffect(() => {
    const validIds = new Set(peopleProfiles.map((person) => person.id));
    setForm((prev) => ({
      ...prev,
      selected_person_ids: prev.selected_person_ids.filter((id) => validIds.has(id)),
    }));
    setTripEdit((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        selected_person_ids: prev.selected_person_ids.filter((id) => validIds.has(id)),
      };
    });
  }, [peopleProfiles]);

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
    if (!selectedPeopleFilters.length) return trips;
    const selectedSet = new Set(selectedPeopleFilters.map(normalizePersonName));
    return trips.filter((trip) => {
      const tripPeopleSet = new Set((trip.people || []).map(normalizePersonName));
      return [...selectedSet].every((selectedName) => tripPeopleSet.has(selectedName));
    });
  }, [trips, selectedPeopleFilters]);

  const mapCenter = useMemo(() => tripToMapCenter(filteredTrips), [filteredTrips]);
  const displayedTrips = useMemo(() => sortTrips(filteredTrips, sortBy), [filteredTrips, sortBy]);
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
  const mapDetailTrip = useMemo(() => {
    if (!mapDetail) return null;
    return displayedTrips.find((trip) => trip.id === mapDetail.tripId) || null;
  }, [displayedTrips, mapDetail]);
  const formWeatherTrip = useMemo(() => {
    let route = [];
    try {
      route = parseRoute(form.route_text);
    } catch (_err) {
      route = [];
    }
    return {
      id: "new-trip",
      title: form.title || "New trip",
      start_date: form.start_date,
      end_date: form.end_date,
      route,
    };
  }, [form.end_date, form.route_text, form.start_date, form.title]);
  const tripEditWeatherTrip = useMemo(() => {
    if (!tripEdit) return null;
    let route = [];
    try {
      route = parseRoute(tripEdit.route_text);
    } catch (_err) {
      route = [];
    }
    return {
      id: `edit-${tripEdit.id}`,
      title: tripEdit.title || "Trip",
      start_date: tripEdit.start_date,
      end_date: tripEdit.end_date,
      route,
    };
  }, [tripEdit]);
  const createDateRangeInvalid = isInvalidDateRange(form.start_date, form.end_date);
  const editDateRangeInvalid = isInvalidDateRange(tripEdit?.start_date, tripEdit?.end_date);

  useEffect(() => {
    const validIds = new Set(displayedTrips.map((trip) => trip.id));
    setSelectedTripIds((prev) => prev.filter((id) => validIds.has(id)));
    setExpandedWeatherTripIds((prev) => prev.filter((id) => validIds.has(id)));
    setFocusedTripId((prev) => (prev && validIds.has(prev) ? prev : null));
    setCalendarSyncTripId((prev) => (prev && validIds.has(prev) ? prev : null));
    setMapDetail((prev) => (prev && validIds.has(prev.tripId) ? prev : null));
  }, [displayedTrips]);

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

  const showTripDetail = (trip, stopLabel = "") => {
    setMapDetail({ tripId: trip.id, stopLabel });
  };

  const toggleTripWeather = (tripId) => {
    setExpandedWeatherTripIds((prev) =>
      prev.includes(tripId) ? prev.filter((id) => id !== tripId) : [...prev, tripId]
    );
  };

  const togglePersonFilter = (personName) => {
    setSelectedPeopleFilters((prev) =>
      prev.includes(personName)
        ? prev.filter((name) => name !== personName)
        : [...prev, personName]
    );
  };

  const onFormChange = (field) => (event) => {
    setForm((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const onTogglePerson = (personId) => (event) => {
    setForm((prev) => {
      const current = prev.selected_person_ids;
      const next = event.target.checked
        ? [...current, personId]
        : current.filter((id) => id !== personId);
      return { ...prev, selected_person_ids: next };
    });
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    setError("");
    if (createDateRangeInvalid) {
      setError("End date cannot be before start date.");
      return;
    }
    try {
      const peopleMap = new Map(peopleProfiles.map((person) => [person.id, person.name]));
      const payload = {
        title: form.title.trim(),
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        notes: form.notes,
        people: form.selected_person_ids.map((id) => peopleMap.get(id)).filter(Boolean),
        route: parseRoute(form.route_text),
        accommodations: cleanAccommodationRows(form.accommodations),
        itinerary: cleanItineraryRows(form.itinerary),
      };
      await createTrip(payload);
      setForm(createEmptyForm());
      await loadTrips(query);
    } catch (err) {
      setError(err.message || "Could not save trip");
    }
  };

  const peopleNamesToIds = (names) => {
    const normalized = new Set((names || []).map((name) => normalizePersonName(name)));
    return peopleProfiles
      .filter((person) => normalized.has(normalizePersonName(person.name)))
      .map((person) => person.id);
  };

  const onStartTripEdit = (trip) => {
    setTripEdit({
      id: trip.id,
      title: trip.title || "",
      start_date: trip.start_date || "",
      end_date: trip.end_date || "",
      notes: trip.notes || "",
      selected_person_ids: peopleNamesToIds(trip.people),
      route_text: formatRouteText(trip.route),
      accommodations: normalizeAccommodationRows(trip.accommodations),
      itinerary: normalizeItineraryRows(trip.itinerary),
    });
  };

  const onTripEditChange = (field) => (event) => {
    setTripEdit((prev) => (prev ? { ...prev, [field]: event.target.value } : prev));
  };

  const onTripEditTogglePerson = (personId) => (event) => {
    setTripEdit((prev) => {
      if (!prev) return prev;
      const current = prev.selected_person_ids;
      const next = event.target.checked
        ? [...current, personId]
        : current.filter((id) => id !== personId);
      return { ...prev, selected_person_ids: next };
    });
  };

  const onSaveTripEdit = async () => {
    if (!tripEdit) return;
    setError("");
    if (editDateRangeInvalid) {
      setError("End date cannot be before start date.");
      return;
    }
    try {
      const peopleMap = new Map(peopleProfiles.map((person) => [person.id, person.name]));
      const payload = {
        title: tripEdit.title.trim(),
        start_date: tripEdit.start_date || null,
        end_date: tripEdit.end_date || null,
        notes: tripEdit.notes,
        people: tripEdit.selected_person_ids.map((id) => peopleMap.get(id)).filter(Boolean),
        route: parseRoute(tripEdit.route_text),
        accommodations: cleanAccommodationRows(tripEdit.accommodations),
        itinerary: cleanItineraryRows(tripEdit.itinerary),
      };
      await updateTrip(tripEdit.id, payload);
      setTripEdit(null);
      await loadTrips(query);
    } catch (err) {
      setError(err.message || "Could not update trip");
    }
  };

  const onStartPersonEdit = (person) => {
    setPersonEdit({
      id: person.id,
      name: person.name || "",
      relationship: person.relationship || "",
      notes: person.notes || "",
    });
  };

  const onPersonEditChange = (field) => (event) => {
    setPersonEdit((prev) => (prev ? { ...prev, [field]: event.target.value } : prev));
  };

  const onSavePersonEdit = async () => {
    if (!personEdit) return;
    setError("");
    try {
      await updatePeopleProfile(personEdit.id, {
        name: personEdit.name.trim(),
        relationship: personEdit.relationship.trim(),
        notes: personEdit.notes.trim(),
      });
      setPersonEdit(null);
      await loadPeopleProfiles();
    } catch (err) {
      setError(err.message || "Could not update profile");
    }
  };

  const searchRouteLocations = async () => {
    const queryText = routeQuery.trim();
    if (!queryText) {
      setRouteResults([]);
      return;
    }
    setRouteSearching(true);
    setError("");
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&q=${encodeURIComponent(queryText)}`
      );
      if (!response.ok) {
        throw new Error("Location search failed");
      }
      const data = await response.json();
      setRouteResults(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || "Could not search locations");
      setRouteResults([]);
    } finally {
      setRouteSearching(false);
    }
  };

  const appendRoutePoint = (result) => {
    const lat = Number(result.lat);
    const lng = Number(result.lon);
    if (Number.isNaN(lat) || Number.isNaN(lng)) return;
    const label = (result.display_name || "").split(",").slice(0, 2).join(",").trim() || "Stop";
    const line = `${lat.toFixed(5)},${lng.toFixed(5)},${label}`;
    setForm((prev) => ({
      ...prev,
      route_text: prev.route_text.trim() ? `${prev.route_text.trim()}\n${line}` : line,
    }));
    setRouteQuery("");
    setRouteResults([]);
  };

  const onPersonDraftChange = (field) => (event) => {
    setPersonDraft((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const onCreatePersonProfile = async () => {
    if (!personDraft.name.trim()) {
      setError("Profile name is required");
      return;
    }
    setError("");
    try {
      await createPeopleProfile({
        name: personDraft.name.trim(),
        relationship: personDraft.relationship.trim(),
        notes: personDraft.notes.trim(),
      });
      setPersonDraft({ name: "", relationship: "", notes: "" });
      await loadPeopleProfiles();
    } catch (err) {
      setError(err.message || "Could not create profile");
    }
  };

  const onDeletePersonProfile = async (personId) => {
    setError("");
    try {
      await deletePeopleProfile(personId);
      setForm((prev) => ({
        ...prev,
        selected_person_ids: prev.selected_person_ids.filter((id) => id !== personId),
      }));
      await loadPeopleProfiles();
    } catch (err) {
      setError(err.message || "Could not delete profile");
    }
  };

  const activePackingTemplate = useMemo(
    () => packingTemplates.find((template) => template.id === activePackingTemplateId) || null,
    [packingTemplates, activePackingTemplateId]
  );

  const onPackingDraftChange = (field) => (event) => {
    setPackingDraft((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const onCreatePackingTemplate = async () => {
    if (!packingDraft.name.trim()) {
      setError("Packing template name is required");
      return;
    }
    setError("");
    try {
      const created = await createPackingTemplate({
        name: packingDraft.name.trim(),
        items: parseItemsText(packingDraft.items_text),
      });
      setPackingDraft({ name: "", items_text: "" });
      setActivePackingTemplateId(created.id);
      await loadPackingTemplates();
    } catch (err) {
      setError(err.message || "Could not create packing template");
    }
  };

  const onStartPackingEdit = (template) => {
    setPackingEdit({
      id: template.id,
      name: template.name,
      items_text: formatItemsText(template.items),
    });
  };

  const onPackingEditChange = (field) => (event) => {
    setPackingEdit((prev) => (prev ? { ...prev, [field]: event.target.value } : prev));
  };

  const onSavePackingEdit = async () => {
    if (!packingEdit) return;
    setError("");
    try {
      await updatePackingTemplate(packingEdit.id, {
        name: packingEdit.name.trim(),
        items: parseItemsText(packingEdit.items_text),
      });
      setPackingEdit(null);
      await loadPackingTemplates();
    } catch (err) {
      setError(err.message || "Could not update packing template");
    }
  };

  const onDeletePackingTemplate = async (templateId) => {
    setError("");
    try {
      await deletePackingTemplate(templateId);
      setCheckedPackingItems((prev) => {
        const next = { ...prev };
        delete next[templateId];
        return next;
      });
      if (activePackingTemplateId === templateId) {
        setActivePackingTemplateId(null);
      }
      await loadPackingTemplates();
    } catch (err) {
      setError(err.message || "Could not delete packing template");
    }
  };

  const onTogglePackingItem = (templateId, item) => {
    setCheckedPackingItems((prev) => {
      const current = new Set(prev[templateId] || []);
      if (current.has(item)) {
        current.delete(item);
      } else {
        current.add(item);
      }
      return { ...prev, [templateId]: [...current] };
    });
  };

  const resetActivePackingChecklist = () => {
    if (!activePackingTemplateId) return;
    setCheckedPackingItems((prev) => ({ ...prev, [activePackingTemplateId]: [] }));
  };

  const onDelete = async (tripId) => {
    setError("");
    try {
      await deleteTrip(tripId);
      await loadTrips(query);
    } catch (err) {
      setError(err.message || "Could not delete trip");
    }
  };

  const onDownloadTripIcs = (trip) => {
    try {
      const icsText = buildTripIcsText(trip);
      const blob = new Blob([icsText], { type: "text/calendar;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${(trip.title || "trip").replace(/[^\w\-]+/g, "_")}.ics`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message || "Could not build ICS file");
    }
  };

  const onOpenTripInGoogleCalendar = (trip) => {
    const events = buildCalendarEvents(trip);
    if (!events.length) {
      setError("No trip date data available for calendar sync.");
      return;
    }
    window.open(buildGoogleCalendarUrl(events[0]), "_blank", "noopener,noreferrer");
  };

  const onSearchSubmit = async (event) => {
    event.preventDefault();
    await loadTrips(query);
  };

  const onAuthFormChange = (field) => (event) => {
    setAuthForm((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const onAuthSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setAuthNotice("");
    try {
      const userId = authForm.user_id.trim();
      const password = authForm.password;
      if (authMode === "login") {
        await login({ user_id: userId, password });
      } else {
        const email = authForm.email.trim().toLowerCase();
        if (!isValidEmail(email)) {
          setError("Please enter a valid email address.");
          return;
        }
        if (password !== authForm.confirm_password) {
          setError("Password and confirm password must match.");
          return;
        }
        await register({ user_id: userId, email, password });
      }
      const me = await fetchMe();
      setCurrentUserId(me.user_id);
      setCurrentUserEmail(me.email || "");
      setProfileForm({ email: me.email || "" });
      setProfileNotice("");
      setResetCodeSent(false);
      setAuthReady(true);
      setAuthForm({ user_id: "", email: "", password: "", confirm_password: "" });
    } catch (err) {
      setError(err.message || "Authentication failed");
    }
  };

  const onResetFormChange = (field) => (event) => {
    setResetForm((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const onRequestPasswordResetCode = async () => {
    const userId = resetForm.user_id.trim();
    if (!userId) {
      setError("Enter your user ID first.");
      return;
    }
    setError("");
    setAuthNotice("");
    try {
      await requestPasswordReset({ user_id: userId });
      setResetCodeSent(true);
      setAuthNotice("Verification code sent to your email.");
    } catch (err) {
      setError(err.message || "Could not send verification code");
    }
  };

  const onProfileFormChange = (field) => (event) => {
    setProfileForm((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const onOpenProfile = () => {
    setError("");
    setProfileNotice("");
    setProfileForm({ email: currentUserEmail || "" });
    setIsProfileOpen(true);
  };

  const onSaveProfile = async (event) => {
    event.preventDefault();
    setError("");
    setProfileNotice("");
    const email = profileForm.email.trim().toLowerCase();
    if (!isValidEmail(email)) {
      setError("Please enter a valid email address.");
      return;
    }
    try {
      const updated = await updateMyProfile({ email });
      setCurrentUserEmail(updated.email || "");
      setProfileForm({ email: updated.email || "" });
      setProfileNotice("Profile updated.");
    } catch (err) {
      setError(err.message || "Could not update profile");
    }
  };

  const onResetPasswordSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setAuthNotice("");
    if (!resetForm.email_code.trim()) {
      setError("Please enter the verification code sent to your email.");
      return;
    }
    if (resetForm.new_password !== resetForm.confirm_password) {
      setError("New password and confirm password must match");
      return;
    }
    try {
      await resetPassword({
        user_id: resetForm.user_id.trim(),
        email_code: resetForm.email_code.trim(),
        new_password: resetForm.new_password,
        reset_key: resetForm.reset_key.trim(),
      });
      setResetForm({ user_id: "", email_code: "", new_password: "", confirm_password: "", reset_key: "" });
      setResetCodeSent(false);
      setAuthMode("login");
      setAuthNotice("Password reset complete. Please log in with your new password.");
    } catch (err) {
      setError(err.message || "Could not reset password");
    }
  };

  const onLogout = async () => {
    try {
      await logout();
    } catch (_err) {
      // Token may already be expired/revoked; continue local logout cleanup.
    }
    clearAuthState();
    setAuthReady(false);
    setCurrentUserId("");
    setCurrentUserEmail("");
    setIsProfileOpen(false);
    setProfileForm({ email: "" });
    setProfileNotice("");
    setResetCodeSent(false);
    setTrips([]);
    setPeopleProfiles([]);
    setPackingTemplates([]);
    setSelectedTripIds([]);
    setExpandedWeatherTripIds([]);
    setCalendarSyncTripId(null);
    setActivePackingTemplateId(null);
    setCheckedPackingItems({});
    packingChecksHydratedRef.current = false;
  };

  if (!authReady) {
    return (
      <div className="page">
        <header className="topbar">
          <h1>Family Travel Log</h1>
        </header>
        {error ? <p className="error">{error}</p> : null}
        {authNotice ? <p className="helper-text">{authNotice}</p> : null}
        <main className="auth-wrap">
          <section className="panel auth-panel">
            <h2>{authMode === "reset" ? "Reset Password" : authMode === "login" ? "Sign In" : "Create Account"}</h2>
            {authMode !== "reset" ? (
              <>
                <form className="trip-form" onSubmit={onAuthSubmit}>
                  <label>
                    User ID
                    <input value={authForm.user_id} onChange={onAuthFormChange("user_id")} required />
                  </label>
                  {authMode === "register" ? (
                    <label>
                      Email
                      <input
                        type="email"
                        value={authForm.email}
                        onChange={onAuthFormChange("email")}
                        placeholder="you@example.com"
                        required
                      />
                    </label>
                  ) : null}
                  <label>
                    Password
                    <input
                      type="password"
                      value={authForm.password}
                      onChange={onAuthFormChange("password")}
                      minLength={8}
                      required
                    />
                  </label>
                  {authMode === "register" ? (
                    <label>
                      Confirm Password
                      <input
                        type="password"
                        value={authForm.confirm_password}
                        onChange={onAuthFormChange("confirm_password")}
                        minLength={8}
                        required
                      />
                    </label>
                  ) : null}
                  <button type="submit">{authMode === "login" ? "Log In" : "Create Account"}</button>
                </form>
                <p className="helper-text">
                  {authMode === "login" ? "Need a new account?" : "Already have an account?"}{" "}
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => {
                      setAuthNotice("");
                      setResetCodeSent(false);
                      setAuthMode((prev) => (prev === "login" ? "register" : "login"));
                    }}
                  >
                    {authMode === "login" ? "Create one" : "Log in"}
                  </button>
                </p>
                {authMode === "login" ? (
                  <p className="helper-text">
                    Forgot your password?{" "}
                    <button
                      type="button"
                      className="link-button"
                      onClick={() => {
                        setError("");
                        setAuthNotice("");
                        setResetCodeSent(false);
                        setResetForm({ user_id: "", email_code: "", new_password: "", confirm_password: "", reset_key: "" });
                        setAuthMode("reset");
                      }}
                    >
                      Reset it
                    </button>
                  </p>
                ) : null}
              </>
            ) : (
              <>
                <form className="trip-form" onSubmit={onResetPasswordSubmit}>
                  <label>
                    User ID
                    <input value={resetForm.user_id} onChange={onResetFormChange("user_id")} required />
                  </label>
                  <div className="action-row">
                    <button type="button" onClick={onRequestPasswordResetCode}>
                      Send Verification Code
                    </button>
                  </div>
                  <label>
                    Email Verification Code
                    <input
                      value={resetForm.email_code}
                      onChange={onResetFormChange("email_code")}
                      placeholder="6-digit code"
                      required
                    />
                  </label>
                  {resetCodeSent ? (
                    <p className="helper-text">
                      Check your email for the verification code, then enter it below.
                    </p>
                  ) : null}
                  <label>
                    New Password
                    <input
                      type="password"
                      value={resetForm.new_password}
                      onChange={onResetFormChange("new_password")}
                      minLength={8}
                      required
                    />
                  </label>
                  <label>
                    Confirm New Password
                    <input
                      type="password"
                      value={resetForm.confirm_password}
                      onChange={onResetFormChange("confirm_password")}
                      minLength={8}
                      required
                    />
                  </label>
                  <label>
                    Admin Reset Key (optional)
                    <input value={resetForm.reset_key} onChange={onResetFormChange("reset_key")} />
                  </label>
                  <button type="submit">Reset Password</button>
                </form>
                <p className="helper-text">
                  Remembered your password?{" "}
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => {
                      setError("");
                      setAuthNotice("");
                      setResetCodeSent(false);
                      setAuthMode("login");
                    }}
                  >
                    Back to log in
                  </button>
                </p>
              </>
            )}
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="page">
      <header className="topbar">
        <h1>Family Travel Log</h1>
        <form onSubmit={onSearchSubmit} className="search-form">
          <input
            placeholder="Search notes, people, places..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button type="submit">Search</button>
        </form>
        <div className="user-box">
          <button type="button" className="user-name-btn" onClick={onOpenProfile} title="View or edit profile">
            {currentUserId}
          </button>
          <button type="button" onClick={onLogout}>Log Out</button>
        </div>
      </header>

      {isProfileOpen ? (
        <section className="panel profile-panel">
          <div className="profile-panel-header">
            <h2>User Profile</h2>
            <button
              type="button"
              className="ghost-btn"
              onClick={() => {
                setIsProfileOpen(false);
                setProfileNotice("");
              }}
            >
              Close
            </button>
          </div>
          <form className="trip-form profile-form" onSubmit={onSaveProfile}>
            <label>
              User ID
              <input value={currentUserId} disabled />
            </label>
            <label>
              Email
              <input
                type="email"
                value={profileForm.email}
                onChange={onProfileFormChange("email")}
                placeholder="you@example.com"
                required
              />
            </label>
            <button type="submit">Save Profile</button>
            {profileNotice ? <p className="helper-text">{profileNotice}</p> : null}
          </form>
        </section>
      ) : null}

      {error ? <p className="error">{error}</p> : null}

      <main className="content-grid">
        <section className="panel left-panel">
          <div className="tab-nav" role="tablist" aria-label="Travel sections">
            <button
              type="button"
              className={`tab-btn ${activeTab === "log" ? "is-active" : ""}`}
              onClick={() => setActiveTab("log")}
            >
              Log A Trip
            </button>
            <button
              type="button"
              className={`tab-btn ${activeTab === "trips" ? "is-active" : ""}`}
              onClick={() => setActiveTab("trips")}
            >
              Trips
            </button>
            <button
              type="button"
              className={`tab-btn ${activeTab === "packing" ? "is-active" : ""}`}
              onClick={() => setActiveTab("packing")}
            >
              Packing Lists
            </button>
            <button
              type="button"
              className={`tab-btn ${activeTab === "members" ? "is-active" : ""}`}
              onClick={() => setActiveTab("members")}
            >
              Family Profiles
            </button>
          </div>

          <div className="tab-panel">
            {activeTab === "log" ? (
              <>
                <h2>Log A Trip</h2>
                <form className="trip-form" onSubmit={onSubmit}>
                  <label>
                    Trip Name
                    <input className="aligned-input" value={form.title} onChange={onFormChange("title")} required />
                  </label>
                  <div className="row">
                    <label>
                      Start
                      <input
                        className="aligned-input"
                        type="date"
                        value={form.start_date}
                        onChange={onFormChange("start_date")}
                        max={form.end_date || undefined}
                      />
                    </label>
                    <label>
                      End
                      <input
                        className="aligned-input"
                        type="date"
                        value={form.end_date}
                        onChange={onFormChange("end_date")}
                        min={form.start_date || undefined}
                      />
                    </label>
                  </div>
                  {createDateRangeInvalid ? (
                    <p className="form-warning">End date cannot be earlier than start date.</p>
                  ) : null}
                  <fieldset className="members-fieldset">
                    <legend>Family Members</legend>
                    {!peopleProfiles.length ? <p className="helper-text">Add a profile in Family Profiles to start selecting members.</p> : null}
                    <div className="member-list">
                      {peopleProfiles.map((person) => (
                        <label key={person.id} className="member-item">
                          <input
                            type="checkbox"
                            checked={form.selected_person_ids.includes(person.id)}
                            onChange={onTogglePerson(person.id)}
                          />
                          <span>
                            <strong>{person.name}</strong>
                            {person.relationship ? ` (${person.relationship})` : ""}
                          </span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <label>
                    Notes
                    <textarea
                      rows={3}
                      value={form.notes}
                      onChange={onFormChange("notes")}
                      placeholder="Highlights, favorite meals, travel tips..."
                    />
                  </label>
                  <label>
                    Route (one per line: lat,lng,label)
                    <textarea
                      rows={5}
                      value={form.route_text}
                      onChange={onFormChange("route_text")}
                      placeholder="34.0522,-118.2437,Los Angeles&#10;36.1699,-115.1398,Las Vegas"
                    />
                  </label>
                  <div className="route-search-box">
                    <div className="route-search-form">
                      <input
                        value={routeQuery}
                        onChange={(event) => setRouteQuery(event.target.value)}
                        placeholder="Search location (e.g., Seattle Space Needle)"
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            searchRouteLocations();
                          }
                        }}
                      />
                      <button type="button" onClick={searchRouteLocations}>
                        {routeSearching ? "Searching..." : "Find"}
                      </button>
                    </div>
                    {routeResults.length ? (
                      <ul className="route-results">
                        {routeResults.map((result) => (
                          <li key={result.place_id}>
                            <button type="button" onClick={() => appendRoutePoint(result)}>
                              {result.display_name}
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                  <div className="field-group trip-plan-group">
                    <span className="field-group-label">Trip Plan: Accommodations + Day-by-Day Itinerary</span>
                    <AccommodationRepeater
                      accommodations={form.accommodations}
                      onChange={(accommodations) =>
                        setForm((prev) => ({ ...prev, accommodations }))
                      }
                    />
                    <ItineraryRepeater
                      itinerary={form.itinerary}
                      onChange={(itinerary) =>
                        setForm((prev) => ({ ...prev, itinerary }))
                      }
                    />
                  </div>
                  <WeatherPreview trip={formWeatherTrip} />
                  <button type="submit" disabled={createDateRangeInvalid}>Save Trip</button>
                </form>
              </>
            ) : null}

            {activeTab === "trips" ? (
              <>
                <div className="trips-header">
                  <h2>Trips</h2>
                  <div className="trips-controls">
                    <div className="person-filter-menu" ref={personFilterRef}>
                      <button
                        type="button"
                        className="person-filter-trigger"
                        onClick={() => setIsPersonFilterOpen((prev) => !prev)}
                      >
                        <span>Person</span>
                        <span className="person-filter-count">
                          {selectedPeopleFilters.length ? `${selectedPeopleFilters.length} selected` : "All people"}
                        </span>
                      </button>
                      {isPersonFilterOpen ? (
                        <div className="person-filter-list">
                          <button type="button" onClick={() => setSelectedPeopleFilters([])}>Clear</button>
                          {peopleFilterOptions.map((name) => (
                            <label key={`person-filter-${name}`} className="person-filter-item">
                              <input
                                type="checkbox"
                                checked={selectedPeopleFilters.includes(name)}
                                onChange={() => togglePersonFilter(name)}
                              />
                              <span>{name}</span>
                            </label>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    <label className="sort-control">
                      Sort
                      <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
                        <option value="date_desc">Date (newest first)</option>
                        <option value="date_asc">Date (oldest first)</option>
                        <option value="name_asc">Trip name (A-Z)</option>
                        <option value="name_desc">Trip name (Z-A)</option>
                      </select>
                    </label>
                  </div>
                </div>
                {loading ? <p>Loading...</p> : null}
                {!loading && !displayedTrips.length ? <p>No trips yet.</p> : null}
                {tripEdit ? (
                  <div className="edit-card">
                    <h3>Edit Trip</h3>
                    <label>
                      Trip Name
                      <input value={tripEdit.title} onChange={onTripEditChange("title")} />
                    </label>
                    <div className="row">
                      <label>
                        Start
                        <input
                          type="date"
                          value={tripEdit.start_date}
                          onChange={onTripEditChange("start_date")}
                          max={tripEdit.end_date || undefined}
                        />
                      </label>
                      <label>
                        End
                        <input
                          type="date"
                          value={tripEdit.end_date}
                          onChange={onTripEditChange("end_date")}
                          min={tripEdit.start_date || undefined}
                        />
                      </label>
                    </div>
                    {editDateRangeInvalid ? (
                      <p className="form-warning">End date cannot be earlier than start date.</p>
                    ) : null}
                    <fieldset className="members-fieldset">
                      <legend>Family Members</legend>
                      <div className="member-list">
                        {peopleProfiles.map((person) => (
                          <label key={`edit-member-${person.id}`} className="member-item">
                            <input
                              type="checkbox"
                              checked={tripEdit.selected_person_ids.includes(person.id)}
                              onChange={onTripEditTogglePerson(person.id)}
                            />
                            <span>{person.name}</span>
                          </label>
                        ))}
                      </div>
                    </fieldset>
                    <label>
                      Notes
                      <textarea rows={3} value={tripEdit.notes} onChange={onTripEditChange("notes")} />
                    </label>
                    <label>
                      Route
                      <textarea rows={4} value={tripEdit.route_text} onChange={onTripEditChange("route_text")} />
                    </label>
                    <div className="field-group trip-plan-group">
                      <span className="field-group-label">Trip Plan: Accommodations + Day-by-Day Itinerary</span>
                      <AccommodationRepeater
                        accommodations={tripEdit.accommodations}
                        onChange={(accommodations) =>
                          setTripEdit((prev) => (prev ? { ...prev, accommodations } : prev))
                        }
                      />
                      <ItineraryRepeater
                        itinerary={tripEdit.itinerary}
                        onChange={(itinerary) =>
                          setTripEdit((prev) => (prev ? { ...prev, itinerary } : prev))
                        }
                      />
                    </div>
                    <WeatherPreview trip={tripEditWeatherTrip} />
                    <div className="action-row">
                      <button type="button" onClick={onSaveTripEdit} disabled={editDateRangeInvalid}>Save Changes</button>
                      <button type="button" className="ghost-btn" onClick={() => setTripEdit(null)}>Cancel</button>
                    </div>
                  </div>
                ) : null}
                <ul className="trip-list">
                  {displayedTrips.map((trip) => {
                    const isWeatherExpanded = expandedWeatherTripIds.includes(trip.id);
                    const canShowWeather = Boolean(trip.start_date && trip.end_date && trip.route?.length);
                    return (
                      <li
                        key={trip.id}
                        className={selectedTripIdsSet.has(trip.id) ? "is-selected" : ""}
                        onClick={() => toggleTripSelection(trip.id)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            toggleTripSelection(trip.id);
                          }
                        }}
                      >
                        <div className="trip-header">
                          <h3>{trip.title}</h3>
                          <div className="trip-actions">
                            <button
                              type="button"
                              className="edit-btn"
                              onClick={(event) => {
                                event.stopPropagation();
                                onStartTripEdit(trip);
                              }}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="calendar-btn"
                              onClick={(event) => {
                                event.stopPropagation();
                                setCalendarSyncTripId((prev) => (prev === trip.id ? null : trip.id));
                              }}
                            >
                              Calendar Sync
                            </button>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                onDelete(trip.id);
                              }}
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                        <p>
                          {trip.start_date || "Unknown start"} - {trip.end_date || "Unknown end"}
                        </p>
                        <p>{trip.notes}</p>
                        {trip.people?.length ? <p><strong>People:</strong> {trip.people.join(", ")}</p> : null}
                        {trip.accommodations?.length ? (
                          <p>
                            <strong>Stays:</strong>{" "}
                            {trip.accommodations.map((a) => `${a.name} (${a.location || "N/A"})`).join("; ")}
                          </p>
                        ) : null}
                        {calendarSyncTripId === trip.id ? (
                          <div
                            className="calendar-sync-actions"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <button type="button" className="calendar-google-btn" onClick={() => onOpenTripInGoogleCalendar(trip)}>
                              Push to Google Calendar
                            </button>
                            <button type="button" className="calendar-ics-btn" onClick={() => onDownloadTripIcs(trip)}>
                              Download ICS
                            </button>
                          </div>
                        ) : null}
                        <div className="trip-itinerary-block">
                          <h4>Day-by-Day Itinerary</h4>
                          <TripItineraryTimeline trip={trip} />
                        </div>
                        {canShowWeather ? (
                          <div className="trip-weather-fold">
                            <button
                              type="button"
                              className="weather-toggle-btn"
                              aria-expanded={isWeatherExpanded}
                              onClick={(event) => {
                                event.stopPropagation();
                                toggleTripWeather(trip.id);
                              }}
                            >
                              {isWeatherExpanded ? "Hide Weather" : "Show Weather"}
                            </button>
                            {isWeatherExpanded ? <WeatherPreview trip={trip} /> : null}
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </>
            ) : null}

            {activeTab === "packing" ? (
              <>
                <h2>Packing Lists</h2>
                <div className="member-create-form">
                  <label>
                    Template Name
                    <input
                      value={packingDraft.name}
                      onChange={onPackingDraftChange("name")}
                      placeholder="Tournament weekend, Beach trip, Ski vacation"
                    />
                  </label>
                  <label>
                    Items (one per line)
                    <textarea
                      rows={5}
                      value={packingDraft.items_text}
                      onChange={onPackingDraftChange("items_text")}
                      placeholder="Tennis racket&#10;Soccer cleats&#10;Baseball glove&#10;Reusable water bottle"
                    />
                  </label>
                  <button type="button" onClick={onCreatePackingTemplate}>Add Template</button>
                </div>

                {packingEdit ? (
                  <div className="edit-card">
                    <h3>Edit Packing Template</h3>
                    <label>
                      Template Name
                      <input value={packingEdit.name} onChange={onPackingEditChange("name")} />
                    </label>
                    <label>
                      Items
                      <textarea rows={6} value={packingEdit.items_text} onChange={onPackingEditChange("items_text")} />
                    </label>
                    <div className="action-row">
                      <button type="button" onClick={onSavePackingEdit}>Save Changes</button>
                      <button type="button" className="ghost-btn" onClick={() => setPackingEdit(null)}>Cancel</button>
                    </div>
                  </div>
                ) : null}

                {packingTemplates.length ? (
                  <>
                    <label className="packing-select">
                      Active Checklist
                      <select
                        value={activePackingTemplateId || ""}
                        onChange={(event) => setActivePackingTemplateId(Number(event.target.value))}
                      >
                        {packingTemplates.map((template) => (
                          <option key={template.id} value={template.id}>{template.name}</option>
                        ))}
                      </select>
                    </label>
                    {activePackingTemplate ? (
                      <div className="packing-checklist">
                        <div className="packing-checklist-header">
                          <h3>{activePackingTemplate.name}</h3>
                          <button type="button" className="ghost-btn" onClick={resetActivePackingChecklist}>Reset</button>
                        </div>
                        {activePackingTemplate.items.length ? (
                          <ul>
                            {activePackingTemplate.items.map((item) => {
                              const checked = (checkedPackingItems[activePackingTemplate.id] || []).includes(item);
                              return (
                                <li key={`${activePackingTemplate.id}-${item}`}>
                                  <label className={checked ? "is-packed" : ""}>
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={() => onTogglePackingItem(activePackingTemplate.id, item)}
                                    />
                                    <span>{item}</span>
                                  </label>
                                </li>
                              );
                            })}
                          </ul>
                        ) : (
                          <p className="helper-text">This template has no items yet.</p>
                        )}
                      </div>
                    ) : null}
                  </>
                ) : (
                  <p className="helper-text">Create a template to start a reusable checklist.</p>
                )}

                <ul className="profile-list">
                  {packingTemplates.map((template) => (
                    <li key={`packing-${template.id}`}>
                      <div>
                        <strong>{template.name}</strong>
                        <p>{template.items.length} item{template.items.length === 1 ? "" : "s"}</p>
                      </div>
                      <div className="trip-actions">
                        <button type="button" className="edit-btn" onClick={() => onStartPackingEdit(template)}>Edit</button>
                        <button type="button" onClick={() => onDeletePackingTemplate(template.id)}>Remove</button>
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}

            {activeTab === "members" ? (
              <>
                <h2>Family Profiles</h2>
                {personEdit ? (
                  <div className="edit-card">
                    <h3>Edit Family Profile</h3>
                    <label>
                      Name
                      <input value={personEdit.name} onChange={onPersonEditChange("name")} />
                    </label>
                    <label>
                      Relationship
                      <input value={personEdit.relationship} onChange={onPersonEditChange("relationship")} />
                    </label>
                    <label>
                      Notes
                      <input value={personEdit.notes} onChange={onPersonEditChange("notes")} />
                    </label>
                    <div className="action-row">
                      <button type="button" onClick={onSavePersonEdit}>Save Changes</button>
                      <button type="button" className="ghost-btn" onClick={() => setPersonEdit(null)}>Cancel</button>
                    </div>
                  </div>
                ) : null}
                <div className="member-create-form">
                  <label>
                    Name
                    <input value={personDraft.name} onChange={onPersonDraftChange("name")} />
                  </label>
                  <label>
                    Relationship
                    <input value={personDraft.relationship} onChange={onPersonDraftChange("relationship")} placeholder="Mom, Cousin, Friend" />
                  </label>
                  <label>
                    Notes
                    <input value={personDraft.notes} onChange={onPersonDraftChange("notes")} placeholder="Food allergies, passport reminders..." />
                  </label>
                  <button type="button" onClick={onCreatePersonProfile}>Add Profile</button>
                </div>
                <ul className="profile-list">
                  {peopleProfiles.map((person) => (
                    <li key={`profile-${person.id}`}>
                      <div>
                        <strong>{person.name}</strong>
                        {person.relationship ? <p>{person.relationship}</p> : null}
                      </div>
                      <div className="trip-actions">
                        <button type="button" className="edit-btn" onClick={() => onStartPersonEdit(person)}>Edit</button>
                        <button type="button" onClick={() => onDeletePersonProfile(person.id)}>Remove</button>
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </div>
        </section>

        <section className="panel map-panel">
          <div className="map-header">
            <h2>Travel Map</h2>
            <div className="map-layer-controls">
              <label className="map-layer-toggle">
                <input
                  type="checkbox"
                  checked={showMarkerClusters}
                  onChange={(event) => setShowMarkerClusters(event.target.checked)}
                />
                <span>Clusters</span>
              </label>
              <label className="map-layer-toggle">
                <input
                  type="checkbox"
                  checked={showHeatmap}
                  onChange={(event) => setShowHeatmap(event.target.checked)}
                />
                <span>Heatmap</span>
              </label>
            </div>
          </div>
          <MapContainer
            center={mapCenter}
            zoom={4}
            minZoom={2}
            maxBounds={[[-85, -180], [85, 180]]}
            maxBoundsViscosity={1}
            scrollWheelZoom
            className="map-view"
          >
            <MapFocus selectedTrips={selectedTrips.length ? selectedTrips : focusedTrip ? [focusedTrip] : []} />
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              noWrap
              bounds={[[-85, -180], [85, 180]]}
            />
            {showHeatmap ? <TripHeatmapLayer trips={heatmapTrips} /> : null}
            {displayedTrips.map((trip) => {
              const isSelected = selectedTripIdsSet.has(trip.id);
              const shouldHighlight = !hasExplicitSelection || isSelected;
              const coords = (trip.route || []).map((point) => [point.lat, point.lng]);
              return (
                <Fragment key={trip.id}>
                  {coords.length > 1 ? (
                    <Polyline
                      positions={coords}
                      eventHandlers={{
                        click: () => showTripDetail(trip),
                      }}
                      pathOptions={{
                        color: shouldHighlight ? "#e55f2b" : "#3388ff",
                        weight: shouldHighlight ? 6 : 3,
                        opacity: shouldHighlight ? 0.9 : 0.2,
                      }}
                    >
                      <Popup>
                        <TripPopupContent trip={trip} />
                      </Popup>
                    </Polyline>
                  ) : null}
                </Fragment>
              );
            })}
            {showMarkerClusters ? (
              <ClusteredTripMarkers
                trips={displayedTrips}
                selectedTripIdsSet={selectedTripIdsSet}
                hasExplicitSelection={hasExplicitSelection}
                onToggleTripSelection={toggleTripSelection}
                onShowTripDetail={showTripDetail}
              />
            ) : (
              displayedTrips.map((trip) => {
                const isSelected = selectedTripIdsSet.has(trip.id);
                const shouldHighlight = !hasExplicitSelection || isSelected;
                return (trip.route || []).map((point, idx) => (
                  <Marker
                    key={`${trip.id}-${idx}`}
                    position={[point.lat, point.lng]}
                    icon={pinIcon}
                    opacity={shouldHighlight ? 1 : 0.55}
                    eventHandlers={{
                      click: () => {
                        toggleTripSelection(trip.id);
                        showTripDetail(trip, point.label || "Stop");
                      },
                    }}
                  >
                    <Popup>
                      <TripPopupContent trip={trip} stopLabel={point.label || "Stop"} />
                    </Popup>
                  </Marker>
                ));
              })
            )}
            {selectedTrips.flatMap((trip) =>
              (trip.route || []).map((point, idx) => (
                <CircleMarker
                  key={`selected-${trip.id}-${idx}`}
                  center={[point.lat, point.lng]}
                  radius={13}
                  pathOptions={{ color: "#e55f2b", fillColor: "#ffd16a", fillOpacity: 0.45, weight: 3 }}
                />
              ))
            )}
          </MapContainer>
          <MapTripDetailPanel
            trip={mapDetailTrip}
            stopLabel={mapDetail?.stopLabel || ""}
            onClose={() => setMapDetail(null)}
          />
        </section>

      </main>
    </div>
  );
}
