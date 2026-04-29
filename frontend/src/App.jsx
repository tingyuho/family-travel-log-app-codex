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

function createEmptyForm() {
  return {
    title: "",
    start_date: "",
    end_date: "",
    notes: "",
    selected_person_ids: [],
    route_text: "",
    accommodations: [createEmptyAccommodation()],
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
  const [focusedTripId, setFocusedTripId] = useState(null);
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
  const focusedTrip = useMemo(
    () => displayedTrips.find((trip) => trip.id === focusedTripId) || null,
    [displayedTrips, focusedTripId]
  );
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
                  <div className="field-group">
                    <span className="field-group-label">Accommodations</span>
                    <AccommodationRepeater
                      accommodations={form.accommodations}
                      onChange={(accommodations) =>
                        setForm((prev) => ({ ...prev, accommodations }))
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
                    <div className="field-group">
                      <span className="field-group-label">Accommodations</span>
                      <AccommodationRepeater
                        accommodations={tripEdit.accommodations}
                        onChange={(accommodations) =>
                          setTripEdit((prev) => (prev ? { ...prev, accommodations } : prev))
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
          <h2>Travel Map</h2>
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
            {displayedTrips.map((trip) => {
              const isSelected = selectedTripIdsSet.has(trip.id);
              const shouldHighlight = !hasExplicitSelection || isSelected;
              const coords = (trip.route || []).map((point) => [point.lat, point.lng]);
              return (
                <Fragment key={trip.id}>
                  {coords.length > 1 ? (
                    <Polyline
                      positions={coords}
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
                  {(trip.route || []).map((point, idx) => (
                    <Fragment key={`${trip.id}-${idx}`}>
                      <Marker
                        position={[point.lat, point.lng]}
                        icon={pinIcon}
                        eventHandlers={{
                          click: () => toggleTripSelection(trip.id),
                        }}
                      >
                        <Popup>
                          <TripPopupContent trip={trip} stopLabel={point.label || "Stop"} />
                        </Popup>
                      </Marker>
                      {isSelected ? (
                        <CircleMarker
                          center={[point.lat, point.lng]}
                          radius={13}
                          pathOptions={{ color: "#e55f2b", fillColor: "#ffd16a", fillOpacity: 0.45, weight: 3 }}
                        />
                      ) : null}
                    </Fragment>
                  ))}
                </Fragment>
              );
            })}
          </MapContainer>
        </section>

      </main>
    </div>
  );
}
