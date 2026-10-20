import AuthPortal from "./components/AuthPortal";
import PlannerIcon from "./components/PlannerIcon";
import PlannerTripView from "./components/PlannerTripView";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import {
  CircleMarker,
  MapContainer,
  Marker,
  Polyline,
  Popup,
  TileLayer,
} from "react-leaflet";
import { getTripMarkerIcon, getTripLineColor, getTripLineWeight, getOrderedRoutePoints, getRouteArrowSegments, createRouteArrowIcon, MapFocus, splitPlaceName, formatSuggestionLocation, MapSearchResultsLayer, ClusteredTripMarkers, TripHeatmapLayer } from "./components/TripMapLayers";
import { AccommodationRepeater, ItineraryRepeater } from "./components/TripPlanFields";
import TripItineraryTimeline from "./components/TripItineraryTimeline";
import {
  clearAuthState,
  createPackingTemplate,
  createPeopleProfile,
  createTrip,
  deletePackingTemplate,
  deletePeopleProfile,
  deleteTrip,
  fetchMe,
  fetchTrip,
  ApiError,
  fetchPackingTemplates,
  fetchPeopleProfiles,
  fetchTrips,
  getAuthState,
  login,
  logout,
  reorderPeopleProfiles,
  register,
  requestPasswordReset,
  resetPassword,
  searchPlaces,
  updatePackingTemplate,
  updatePeopleProfile,
  updateMyProfile,
  updateTrip,
} from "./api";
import { buildWebTripPayload } from "./lib/tripWorkflow";
import { AddStopDialog, TripDetailsDialog, TripDialog } from "./components/TripDialogs";
import { useWebCalendarActions } from "./hooks/useWebCalendarActions";
import { useWebMapSelection } from "./hooks/useWebMapSelection";
import { useWebTripDrafts } from "./hooks/useWebTripDrafts";
import { useWebTripFilters } from "./hooks/useWebTripFilters";
import {
  appendRouteStopText,
  cleanAccommodationRows,
  cleanItineraryRows,
  createEmptyAccommodation,
  createEmptyForm,
  createEmptyItineraryEvent,
  formatItemsText,
  formatRouteText,
  getTripKindLabel,
  isInvalidDateRange,
  normalizeAccommodationRows,
  normalizeItineraryRows,
  normalizePersonName,
  normalizeTripKind,
  parseItemsText,
  parseRoute,
  removeRouteStopText,
  reorderByIds,
  sortTrips,
} from "./lib/tripUtils";
import {
  buildCalendarEvents,
  buildGoogleCalendarUrl,
  buildTripIcsText,
} from "./lib/calendarUtils";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import "./styles.css";

function friendlyErrorMessage(error, context = "default") {
  const message = error instanceof Error ? error.message : String(error || "Something went wrong.");
  const lower = message.toLowerCase();
  if (lower.includes("failed to fetch") || lower.includes("networkerror") || lower.includes("network request")) {
    return "Could not reach the backend. Confirm the server is running and your API URL is correct.";
  }
  if (lower.includes("email") && lower.includes("not configured")) {
    return "Password reset email is not set up yet. Ask the app owner to configure SMTP on the backend.";
  }
  if (lower.includes("rate-limit") || lower.includes("too many") || lower.includes("429")) {
    return "That action is temporarily limited for safety. Wait a minute, then try again.";
  }
  if (context === "location") {
    return message || "Location search is unavailable. Try again later or enter route stops manually.";
  }
  if (context === "calendar") {
    return message || "Calendar export could not open. Try the ICS option instead.";
  }
  return message;
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

function isValidEmail(value) {
  return /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test((value || "").trim());
}

function RouteBuilderPanel({
  routeText,
  onRouteTextChange,
  routeQuery,
  setRouteQuery,
  routeResults,
  routeSuggestions,
  routeSuggestionsOpen,
  routeSearching,
  routeSuggesting,
  onSearch,
  onSelectSuggestion,
}) {
  let stops = [];
  let routeParseError = "";
  try {
    stops = parseRoute(routeText);
  } catch (err) {
    routeParseError = err.message || "Could not read route stops.";
  }

  const removeStop = (index) => {
    onRouteTextChange(removeRouteStopText(routeText, index));
  };

  return (
    <div className="route-builder-box">
      <div className="route-builder-header">
        <div>
          <strong>Map Route Builder</strong>
          <p className="helper-text">Search places, then click a map label to confirm adding that stop in travel order.</p>
        </div>
      </div>
      <div className="route-search-form">
        <div className="route-search-input-wrap">
          <input
            value={routeQuery}
            onChange={(event) => setRouteQuery(event.target.value)}
            placeholder="Search location (e.g., Woodland Park)"
            autoComplete="off"
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                onSearch();
              }
            }}
          />
          {routeSuggestionsOpen && routeSuggestions.length ? (
            <ul className="route-suggestion-list">
              {routeSuggestions.map((result) => {
                const place = splitPlaceName(result.display_name);
                const location = formatSuggestionLocation(result);
                return (
                  <li key={`suggestion-${result.place_id}`}>
                    <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => onSelectSuggestion(result)}>
                      <span>{place.primary}</span>
                      {location ? <small>{location}</small> : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
        <button type="button" onClick={onSearch}>
          {routeSearching ? "Searching..." : "Find"}
        </button>
      </div>
      {routeSuggesting ? <p className="helper-text">Finding matching places...</p> : null}
      {routeResults.length ? (
        <div className="route-results-note">
          <p className="helper-text">{routeResults.length} result{routeResults.length === 1 ? "" : "s"} pinned on the map. Click a map label to add one.</p>
        </div>
      ) : null}
      {routeParseError ? <p className="form-warning">{routeParseError}</p> : null}
      {stops.length ? (
        <ol className="route-stop-list">
          {stops.map((stop, index) => (
            <li key={`${stop.lat}-${stop.lng}-${index}`}>
              <span>
                <strong>{index + 1}. {stop.label || `Stop ${index + 1}`}</strong>
                <small>{stop.lat.toFixed(5)}, {stop.lng.toFixed(5)}</small>
              </span>
              <button type="button" className="ghost-btn" onClick={() => removeStop(index)}>Remove</button>
            </li>
          ))}
        </ol>
      ) : (
        <p className="helper-text">No route stops yet.</p>
      )}
      {stops.length ? (
        <button type="button" className="ghost-btn" onClick={() => onRouteTextChange("")}>Clear route</button>
      ) : null}
    </div>
  );
}

function TripPopupContent({ trip, stopLabel }) {
  return (
    <div className="trip-popup">
      <h4>{trip.title}</h4>
      <p><strong>{getTripKindLabel(trip.trip_kind)}</strong></p>
      {stopLabel ? <p><strong>Stop:</strong> {stopLabel}</p> : null}
      <p>
        <strong>Dates:</strong> {trip.start_date || "Dates not set"}{trip.end_date ? ` – ${trip.end_date}` : ""}
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
  const [peopleLoaded, setPeopleLoaded] = useState(false);
  const [tripConflictId, setTripConflictId] = useState(null);
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
  const [activeTab, setActiveTab] = useState("trips");
  const [showCreateTrip, setShowCreateTrip] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [listMode, setListMode] = useState("list");
  const [detailTripId, setDetailTripId] = useState(null);
  const [addStopTarget, setAddStopTarget] = useState(null);
  const [workflowNotice, setWorkflowNotice] = useState(null);
  const [tripSaving, setTripSaving] = useState(false);
  const tripSaveLock = useRef(false);
  const mapReturnRef = useRef(null);
  const navigationScroll = useRef({});
  const detailReturnScroll = useRef(0);
  const previousTab = useRef("trips");
  const detailTrip = trips.find((trip) => trip.id === detailTripId);

  useEffect(() => {
    const oldTab = previousTab.current;
    if (oldTab === activeTab) return;
    previousTab.current = activeTab;
    requestAnimationFrame(() => window.scrollTo(0, navigationScroll.current[activeTab] || 0));
  }, [activeTab]);

  function navigateTab(nextTab) {
    navigationScroll.current[activeTab] = window.scrollY;
    setActiveTab(nextTab);
  }

  function openDetails(trip) {
    detailReturnScroll.current = window.scrollY;
    setDetailTripId(trip.id);
  }
  function closeDetails() {
    setDetailTripId(null);
    requestAnimationFrame(() => window.scrollTo(0, detailReturnScroll.current));
  }
  function openTripMap(trip) {
    mapReturnRef.current = { tripId: trip.id, detail: detailTripId === trip.id };
    setDetailTripId(null);
    setSelectedTripIds([trip.id]);
    showTripDetail(trip);
    navigateTab("map");
  }
  function returnFromMap() {
    const origin = mapReturnRef.current;
    navigateTab("trips");
    if (origin?.detail) setDetailTripId(origin.tripId);
    mapReturnRef.current = null;
  }

  const [routeQuery, setRouteQuery] = useState("");
  const [routeResults, setRouteResults] = useState([]);
  const [routeSuggestions, setRouteSuggestions] = useState([]);
  const [routeSuggestionsOpen, setRouteSuggestionsOpen] = useState(false);
  const [routeSearchTarget, setRouteSearchTarget] = useState("create");
  const [routeSearching, setRouteSearching] = useState(false);
  const [routeSuggesting, setRouteSuggesting] = useState(false);
  const [tripEdit, setTripEdit] = useState(null);
  const [personEdit, setPersonEdit] = useState(null);
  const [draggingPersonId, setDraggingPersonId] = useState(null);
  const [packingEdit, setPackingEdit] = useState(null);
  const [activePackingTemplateId, setActivePackingTemplateId] = useState(null);
  const [checkedPackingItems, setCheckedPackingItems] = useState({});
  const packingChecksHydratedRef = useRef(false);
  const drafts = useWebTripDrafts({ user: authReady ? currentUserId : "", form, tripEdit, showCreateTrip, setForm, setTripEdit, setShowCreateTrip, peopleProfiles });

  async function reviewLatestTrip() {
    try {
      const latest = await fetchTrip(tripConflictId);
      setTrips((current) => current.map((trip) => trip.id === latest.id ? latest : trip));
      openDetails(latest);
    } catch (error) { setError(error.message || "Could not load the latest trip. Your draft is kept."); }
  }

  const {
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
  } = useWebTripFilters({
    trips,
    peopleProfiles,
    normalizePersonName,
    normalizeTripKind,
    sortTrips,
  });

  const {
    setSelectedTripIds,
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
  } = useWebMapSelection({ activeTab, displayedTrips });

  const {
    calendarSyncTripId,
    setCalendarSyncTripId,
    calendarFallbackTrip,
    setCalendarFallbackTrip,
    onDownloadTripIcs,
    onOpenTripInGoogleCalendar,
  } = useWebCalendarActions({
    buildCalendarEvents,
    buildGoogleCalendarUrl,
    buildTripIcsText,
    setError,
  });

  useEffect(() => {
    if (!["trips", "map", "hub"].includes(activeTab)) {
      navigateTab("trips");
    }
  }, [activeTab]);

  const loadTrips = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchTrips();
      setTrips(
        data.map((trip) => ({
          ...trip,
          trip_kind: normalizeTripKind(trip.trip_kind || (trip.start_date || trip.end_date ? "past" : "wishlist")),
        }))
      );
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
      setPeopleLoaded(true);
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
    if (!peopleLoaded) return;
    const validIds = new Set(peopleProfiles.map((person) => person.id));
    const preservePeople = (draft) => {
      if (!draft) return draft;
      const missing = draft.selected_person_ids.filter((id) => !validIds.has(id));
      if (!missing.length) return draft;
      const names = missing.map((id) => draft.person_names_by_id?.[id]).filter(Boolean);
      return { ...draft, selected_person_ids: draft.selected_person_ids.filter((id) => validIds.has(id)),
        unmatched_people: [...new Set([...(draft.unmatched_people || []), ...names])] };
    };
    setForm(preservePeople);
    setTripEdit(preservePeople);
  }, [peopleProfiles, peopleLoaded]);

  useEffect(() => {
    if (tripEdit) requestAnimationFrame(() => document.getElementById("trip-edit-form")?.scrollIntoView({ block: "start" }));
  }, [tripEdit?.id]);

  const visibleMapTrips = selectedTrips.length ? selectedTrips : displayedTrips;
  const mapCenter = useMemo(() => tripToMapCenter(filteredTrips), [filteredTrips]);
  const createDateRangeInvalid = isInvalidDateRange(form.start_date, form.end_date);
  const editDateRangeInvalid = isInvalidDateRange(tripEdit?.start_date, tripEdit?.end_date);

  useEffect(() => {
    const validIds = new Set(displayedTrips.map((trip) => trip.id));
    setCalendarSyncTripId((prev) => (prev && validIds.has(prev) ? prev : null));
  }, [displayedTrips]);

  useEffect(() => {
    const queryText = routeQuery.trim();
    if (queryText.length < 3) {
      setRouteSuggestions([]);
      setRouteSuggestionsOpen(false);
      setRouteSuggesting(false);
      return undefined;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      setRouteSuggesting(true);
      try {
        const data = await searchPlaces(queryText, 5, { signal: controller.signal });
        if (!controller.signal.aborted) {
          setRouteSuggestions(Array.isArray(data) ? data : []);
          setRouteSuggestionsOpen(Array.isArray(data) && data.length > 0);
        }
      } catch (err) {
        if (err.name !== "AbortError") {
          setRouteSuggestions([]);
          setRouteSuggestionsOpen(false);
        }
      } finally {
        if (!controller.signal.aborted) setRouteSuggesting(false);
      }
    }, 350);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [routeQuery]);

  const onFormChange = (field) => (event) => {
    const value = event.target.value;
    setForm((prev) => {
      return { ...prev, [field]: value };
    });
  };

  const onTogglePerson = (personId) => (event) => {
    setForm((prev) => {
      const current = prev.selected_person_ids;
      const next = event.target.checked
        ? [...current, personId]
        : current.filter((id) => id !== personId);
      return { ...prev, selected_person_ids: next, person_names_by_id: { ...(prev.person_names_by_id || {}), ...Object.fromEntries(peopleProfiles.map((person) => [person.id, person.name])) } };
    });
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    setError("");
    if (createDateRangeInvalid) {
      setError("End date cannot be before start date.");
      return;
    }
    if (tripSaveLock.current) return;
    tripSaveLock.current = true;
    setTripSaving(true);
    try {
      const payload = buildWebTripPayload(form, peopleProfiles);
      const saved = await createTrip(payload);
      setTrips((prev) => [saved, ...prev.filter((trip) => trip.id !== saved.id)]);
      setShowCreateTrip(false);
      setWorkflowNotice({ message: `Trip created: ${saved.title}`, tripId: saved.id });
      openDetails(saved);
      drafts.clear();
      setForm(createEmptyForm());
      setRouteSearchTarget("create");
    } catch (err) {
      setError(err.message || "Could not save trip");
    } finally { tripSaveLock.current = false; setTripSaving(false); }
  };

  const peopleNamesToIds = (names) => {
    const normalized = new Set((names || []).map((name) => normalizePersonName(name)));
    const matchedIds = [];
    const consumedNames = new Set();
    peopleProfiles.forEach((person) => {
      const key = normalizePersonName(person.name);
      if (normalized.has(key) && !consumedNames.has(key)) {
        matchedIds.push(person.id);
        consumedNames.add(key);
      }
    });
    return matchedIds;
  };

  const onStartTripEdit = (trip) => {
    if (tripEdit && !window.confirm("Replace your unfinished edit with this saved trip?")) return;
    drafts.clear();
    setError("");
    setTripConflictId(null);
    setTripEdit({
      version: trip.version,
      person_names_by_id: Object.fromEntries(peopleProfiles.map((person) => [person.id, person.name])),
      id: trip.id,
      title: trip.title || "",
      trip_kind: normalizeTripKind(trip.trip_kind),
      start_date: trip.start_date || "",
      end_date: trip.end_date || "",
      notes: trip.notes || "",
      selected_person_ids: peopleNamesToIds(trip.people),
      unmatched_people: (trip.people || []).filter((name) => !peopleProfiles.some((person) => normalizePersonName(person.name) === normalizePersonName(name))),
      excluded_people: [],
      route_text: formatRouteText(trip.route),
      accommodations: normalizeAccommodationRows(trip.accommodations),
      itinerary: normalizeItineraryRows(trip.itinerary),
    });
  };

  const onTripEditChange = (field) => (event) => {
    const value = event.target.value;
    setTripEdit((prev) => {
      if (!prev) return prev;
      return { ...prev, [field]: value };
    });
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
    if (tripSaveLock.current) return;
    tripSaveLock.current = true;
    setTripSaving(true);
    try {
      const payload = buildWebTripPayload(tripEdit, peopleProfiles);
      const saved = await updateTrip(tripEdit.id, payload);
      setTrips((prev) => prev.map((trip) => trip.id === saved.id ? saved : trip));
      setDetailTripId(saved.id);
      setWorkflowNotice({ message: `Trip updated: ${saved.title}`, tripId: saved.id });
      drafts.clear();
      setTripEdit(null);
      setTripConflictId(null);
      setRouteSearchTarget("create");
    } catch (err) {
      setError(err.message || "Could not update trip");
      if (err instanceof ApiError && (err.status === 409 || err.status === 428)) {
        setTripConflictId(tripEdit.id);
        requestAnimationFrame(() => document.getElementById("trip-edit-form")?.scrollIntoView({ block: "start" }));
      }
    } finally { tripSaveLock.current = false; setTripSaving(false); }
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
    const name = personEdit.name.trim();
    if (peopleProfiles.some((person) => person.id !== personEdit.id && normalizePersonName(person.name) === normalizePersonName(name))) {
      setError("A profile with that name already exists.");
      return;
    }
    setError("");
    try {
      await updatePeopleProfile(personEdit.id, {
        name,
        relationship: personEdit.relationship.trim(),
        notes: personEdit.notes.trim(),
      });
      setPersonEdit(null);
      await loadPeopleProfiles();
      await loadTrips(query);
    } catch (err) {
      setError(err.message || "Could not update profile");
    }
  };

  const updateRouteTextForTarget = (target, updater) => {
    if (target === "edit") {
      setTripEdit((prev) => (prev ? { ...prev, route_text: updater(prev.route_text || "") } : prev));
      return;
    }
    setForm((prev) => ({ ...prev, route_text: updater(prev.route_text || "") }));
  };

  const addRouteStop = (target, stop) => {
    updateRouteTextForTarget(target, (routeText) => appendRouteStopText(routeText, stop));
  };

  const activeRouteSearchTarget = routeSearchTarget === "edit" && tripEdit ? "edit" : "create";

  const searchRouteLocations = async () => {
    const queryText = routeQuery.trim();
    if (!queryText) {
      setRouteResults([]);
      return;
    }
    setRouteSearching(true);
    setRouteSuggestionsOpen(false);
    setError("");
    try {
      const data = await searchPlaces(queryText, 6);
      setRouteResults(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(friendlyErrorMessage(err, "location"));
      setRouteResults([]);
    } finally {
      setRouteSearching(false);
    }
  };

  const selectRouteSuggestion = (result, target = activeRouteSearchTarget) => {
    const place = splitPlaceName(result.display_name);
    setRouteQuery(place.primary);
    setRouteResults([result]);
    setRouteSuggestionsOpen(false);
    setRouteSuggestions([]);
    setRouteSearchTarget(target);
  };

  const appendRoutePoint = (result, target = activeRouteSearchTarget) => {
    const lat = Number(result.lat);
    const lng = Number(result.lon);
    if (Number.isNaN(lat) || Number.isNaN(lng)) return;
    const label = (result.display_name || "").split(",").slice(0, 2).join(",").trim() || "Stop";
    addRouteStop(target, { lat: Number(lat.toFixed(5)), lng: Number(lng.toFixed(5)), label });
    setRouteQuery("");
    setRouteResults([]);
    setRouteSuggestions([]);
    setRouteSuggestionsOpen(false);
  };

  const onPersonDraftChange = (field) => (event) => {
    setPersonDraft((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const onCreatePersonProfile = async () => {
    const name = personDraft.name.trim();
    if (!name) {
      setError("Profile name is required");
      return;
    }
    if (peopleProfiles.some((person) => normalizePersonName(person.name) === normalizePersonName(name))) {
      setError("A profile with that name already exists.");
      return;
    }
    setError("");
    try {
      await createPeopleProfile({
        name,
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

  const onStartDragPersonProfile = (personId) => (event) => {
    setDraggingPersonId(personId);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(personId));
  };

  const onDropPersonProfile = (targetPersonId) => async (event) => {
    event.preventDefault();
    const sourceIdText = event.dataTransfer.getData("text/plain");
    const sourceId = Number(sourceIdText);
    const draggedId = Number.isFinite(sourceId) && sourceId > 0 ? sourceId : draggingPersonId;
    if (!draggedId || draggedId === targetPersonId) {
      setDraggingPersonId(null);
      return;
    }

    const current = [...peopleProfiles];
    const reordered = reorderByIds(current, draggedId, targetPersonId);
    if (reordered === current) {
      setDraggingPersonId(null);
      return;
    }

    setPeopleProfiles(reordered);
    try {
      const ordered = await reorderPeopleProfiles(reordered.map((person) => person.id));
      setPeopleProfiles(ordered);
    } catch (err) {
      setPeopleProfiles(current);
      setError(err.message || "Could not save family profile order");
    } finally {
      setDraggingPersonId(null);
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
    if (!window.confirm("Delete this trip? This cannot be undone.")) return;
    try {
      await deleteTrip(tripId);
      await loadTrips(query);
    } catch (err) {
      setError(err.message || "Could not delete trip");
    }
  };

  const onSearchSubmit = async (event) => {
    event.preventDefault();
    // Search is applied locally so clearing it restores the complete library.
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
    navigateTab("hub");
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
    drafts.flush();
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
    setPeopleLoaded(false);
    setTripConflictId(null);
    setForm(createEmptyForm());
    setTripEdit(null);
    setPackingTemplates([]);
    setSelectedTripIds([]);
    setCalendarSyncTripId(null);
    setActivePackingTemplateId(null);
    setCheckedPackingItems({});
    packingChecksHydratedRef.current = false;
  };

  if (!authReady) {
    return <AuthPortal {...{ error, authNotice, authMode, authForm, resetForm, resetCodeSent,
      onAuthSubmit, onAuthFormChange, onResetPasswordSubmit, onResetFormChange, onRequestPasswordResetCode }}
      onChangeMode={(mode) => {
        setError(""); setAuthNotice(""); setResetCodeSent(false);
        if (mode === "reset") setResetForm({ user_id: "", email_code: "", new_password: "", confirm_password: "", reset_key: "" });
        setAuthMode(mode);
      }} />;
  }

  return (
    <div className="page app-shell">
      <aside className="app-sidebar" aria-label="Workspace navigation">
      <header className="topbar">
        <h1 className="planner-brand"><PlannerIcon name="compass" /><span>Family <br />Travel Log</span></h1>
        <div className="user-box">
          <button type="button" className="user-name-btn" onClick={onOpenProfile} title="Open Family Hub">
            {currentUserId}
          </button>

        </div>
      </header>

          <nav className="tab-nav" aria-label="Main navigation">
            <button
              type="button"
              aria-current={activeTab === "trips" ? "page" : undefined}
              className={`tab-btn ${activeTab === "trips" ? "is-active" : ""}`}
              onClick={() => activeTab === "map" && mapReturnRef.current ? returnFromMap() : navigateTab("trips")}
            >
              <PlannerIcon name="trips" />Trips
            </button>
            <button
              type="button"
              aria-current={activeTab === "map" ? "page" : undefined}
              className={`tab-btn ${activeTab === "map" ? "is-active" : ""}`}
              onClick={() => navigateTab("map")}
            >
              <PlannerIcon name="map" />Map
            </button>
            <button
              type="button"
              aria-current={activeTab === "hub" ? "page" : undefined}
              className={`tab-btn ${activeTab === "hub" ? "is-active" : ""}`}
              onClick={() => {
                navigateTab("hub");
                onOpenProfile();
              }}
            >
              <PlannerIcon name="family" />Family
            </button>
          </nav>
          <p className="sidebar-caption">Your family workspace</p>
      </aside>
      <div className="workspace">
        <header className="workspace-header"><p className="breadcrumb">Family workspace / {activeTab === "trips" ? "Trips" : activeTab === "map" ? "Map" : "Family"}</p><h2>{activeTab === "trips" ? (showCreateTrip ? "Create a trip" : "Your trips") : activeTab === "map" ? "Your travel map" : "Your family"}</h2><p className="helper-text">{activeTab === "trips" ? "Bring your places, people, and plans together." : activeTab === "map" ? "Explore the places in your family's travel plans." : "Travel companions and packing lists, all in one place."}</p></header>
      {activeTab === "hub" ? (
        <section className="panel profile-panel">
          <div className="profile-panel-header">
            <h2>Family Hub</h2>
            <button
              type="button"
              className="ghost-btn"
              onClick={() => {
                setIsProfileOpen(false);
                setProfileNotice("");
                if (activeTab === "hub") navigateTab("trips");
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
            <button type="submit">Save Account</button>
            <button type="button" className="ghost-btn" onClick={onLogout}>Log Out</button>
            {profileNotice ? <p className="helper-text">{profileNotice}</p> : null}
          </form>
          <div className="profile-family-section">
            <h3>Family Profiles</h3>
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
                <li
                  key={`profile-panel-${person.id}`}
                  draggable
                  onDragStart={onStartDragPersonProfile(person.id)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={onDropPersonProfile(person.id)}
                  onDragEnd={() => setDraggingPersonId(null)}
                  className={draggingPersonId === person.id ? "is-dragging" : ""}
                >
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
          </div>
        </section>
      ) : null}

      {error ? <p className="error">{error}</p> : null}
      {calendarFallbackTrip ? (
        <div className="calendar-fallback" role="status">
          <div>
            <strong>Calendar fallback ready</strong>
            <p>Use the ICS file for {calendarFallbackTrip.title || "this trip"} if Google Calendar does not open.</p>
          </div>
          <div className="trip-actions">
            <button type="button" className="calendar-ics-btn" onClick={() => onDownloadTripIcs(calendarFallbackTrip)}>
              Download ICS
            </button>
            <button type="button" className="ghost-btn" onClick={() => setCalendarFallbackTrip(null)}>
              Dismiss
            </button>
          </div>
        </div>
      ) : null}

      {workflowNotice ? <div className="workflow-notice" role="status">{workflowNotice.message}<button type="button" className="ghost-btn" onClick={() => { const trip = trips.find((item) => item.id === workflowNotice.tripId); if (trip) openDetails(trip); }}>View trip</button><button type="button" className="ghost-btn" aria-label="Dismiss confirmation" onClick={() => setWorkflowNotice(null)}>Dismiss</button></div> : null}
      {detailTrip && !addStopTarget ? <TripDetailsDialog trip={detailTrip} onClose={closeDetails}
        onAddStop={() => setAddStopTarget({ tripId: detailTrip.id })}
        onEdit={() => { setDetailTripId(null); onStartTripEdit(detailTrip); navigateTab("trips"); setShowCreateTrip(false); }}
        onMap={() => openTripMap(detailTrip)}
        onCalendar={() => onOpenTripInGoogleCalendar(detailTrip)}
        renderItinerary={(trip) => <TripItineraryTimeline trip={trip} />} /> : null}
      {addStopTarget ? <AddStopDialog trips={trips} initialTripId={addStopTarget.tripId}
        onClose={() => setAddStopTarget(null)} onSaved={(saved) => { setTrips((prev) => prev.map((trip) => trip.id === saved.id ? saved : trip)); setAddStopTarget(null); setWorkflowNotice({ message: `Stop added to ${saved.title}.`, tripId: saved.id }); }} /> : null}
      {drafts.pendingRestore ? <TripDialog title="Restore unfinished trip?" onClose={() => {}} dismissible={false}>
        <p>Your unfinished trip is saved on this browser. Restore it to continue editing, or discard it to start fresh.</p>
        <p><strong>{drafts.pendingRestore.tripEdit?.title || drafts.pendingRestore.form.title || "Untitled trip"}</strong></p>
        <div className="action-row"><button type="button" onClick={() => { drafts.restore(); navigateTab("trips"); }}>Restore draft</button><button type="button" className="ghost-btn" onClick={drafts.discard}>Discard saved draft</button></div>
      </TripDialog> : null}
      {drafts.storageError ? <p role="status" className="form-warning">Draft recovery is unavailable in this browser. Keep this page open until you save your trip.</p> : null}
      <main className={`content-grid ${activeTab === "map" ? "map-layout" : activeTab === "trips" && (showCreateTrip || tripEdit) ? "with-map" : "planner-layout"}`}>
        <section className="panel left-panel">


          <div className="tab-panel">
            <div hidden={activeTab !== "trips" || !showCreateTrip}>
                <div className="dialog-header"><h2>New Trip</h2><button type="button" className="ghost-btn" onClick={() => setShowCreateTrip(false)}>Back to trips</button></div>
                <p className="helper-text">Start with a name. Dates and other details are optional. Your draft stays here when you leave this screen.</p>
                <form className="trip-form" onSubmit={onSubmit}>
                  <label>
                    Trip Name
                    <input className="aligned-input" value={form.title} onChange={onFormChange("title")} required />
                  </label>
                  <label>
                    Trip Type
                    <select value={form.trip_kind} onChange={onFormChange("trip_kind")}>
                      <option value="past">Past Trip</option>
                      <option value="wishlist">Wishlist</option>
                    </select>
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
                  {normalizeTripKind(form.trip_kind) === "wishlist" ? (
                    <p className="helper-text">Dates are optional. Changing trip type keeps the dates you entered.</p>
                  ) : null}
                  {createDateRangeInvalid ? (
                    <p className="form-warning">End date cannot be earlier than start date.</p>
                  ) : null}
                  <details><summary>Add people, places, stays, and itinerary (optional)</summary>
                  <fieldset className="members-fieldset">
                    <legend>Family Members</legend>
                    {!peopleProfiles.length ? <p className="helper-text">Add a profile in Family Hub to start selecting members.</p> : null}
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
                    {(form.unmatched_people || []).map((name) => <label key={name} className="member-item"><input type="checkbox" checked={!(form.excluded_people || []).includes(name)} onChange={(event) => { const checked = event.target.checked; setForm((prev) => ({ ...prev, excluded_people: checked ? (prev.excluded_people || []).filter((entry) => entry !== name) : [...(prev.excluded_people || []), name] })); }} /><span>{name} (saved in this draft)</span></label>)}
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
                  <RouteBuilderPanel
                    routeText={form.route_text}
                    onRouteTextChange={(route_text) => setForm((prev) => ({ ...prev, route_text }))}
                    routeQuery={routeQuery}
                    setRouteQuery={(value) => {
                      setRouteSearchTarget("create");
                      setRouteQuery(value);
                    }}
                    routeResults={routeSearchTarget === "create" ? routeResults : []}
                    routeSuggestions={routeSearchTarget === "create" ? routeSuggestions : []}
                    routeSuggestionsOpen={routeSearchTarget === "create" && routeSuggestionsOpen}
                    routeSearching={routeSearching && routeSearchTarget === "create"}
                    routeSuggesting={routeSuggesting && routeSearchTarget === "create"}
                    onSearch={() => {
                      setRouteSearchTarget("create");
                      searchRouteLocations();
                    }}
                    onSelectSuggestion={(result) => selectRouteSuggestion(result, "create")}
                  />
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
                  </details>
                  <button type="button" className="ghost-btn" disabled={tripSaving} onClick={() => { if (window.confirm("Discard this unfinished trip?")) { drafts.clear(); setForm(createEmptyForm()); setShowCreateTrip(false); } }}>Discard draft</button>
                  <button type="submit" disabled={createDateRangeInvalid || tripSaving}>{tripSaving ? "Saving…" : "Create Trip"}</button>
                </form>
            </div>

            <div hidden={activeTab !== "trips" || showCreateTrip}>
                {!tripEdit && !loading && displayedTrips[0] ? <PlannerTripView key={displayedTrips[0].id} trip={displayedTrips[0]} onOpen={() => openDetails(displayedTrips[0])} onAddStop={() => setAddStopTarget({ tripId: displayedTrips[0].id })} /> : null}
                <div className="library-header"><h2>Trips</h2><div className="action-row">
                  <button type="button" onClick={() => setShowCreateTrip(true)}>Add Trip</button>
                  <button type="button" className="ghost-btn" onClick={() => setAddStopTarget({ tripId: null })}>Add Stop</button>
                </div></div>
        <form onSubmit={onSearchSubmit} className="search-form">
          <input
            aria-label="Search trips" placeholder="Search trips, people, or places"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button type="submit">Search</button>
        </form>

                <div className="library-toolbar" role="group" aria-label="Trip views and selection">
                  <button type="button" aria-pressed={listMode === "list"} onClick={() => setListMode("list")}>List</button>
                  <button type="button" aria-pressed={listMode === "timeline"} onClick={() => setListMode("timeline")}>Timeline</button>
                  <button type="button" className="ghost-btn" aria-pressed={selectionMode} onClick={() => { setSelectionMode(!selectionMode); setSelectedTripIds([]); }}>{selectionMode ? "Done" : "Select"}</button>
                </div>
                {selectionMode ? <div className="selection-bar"><span>{selectedTrips.length} selected</span><button type="button" disabled={!selectedTrips.length} onClick={() => { mapReturnRef.current = null; navigateTab("map"); }}>View on Map</button><button type="button" className="ghost-btn" onClick={() => setSelectedTripIds([])}>Clear selection</button></div> : null}
                <div className="trips-header">
                  <div className="trips-controls">
                    <div className="sort-control">
                      People
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
                    </div>
                    <label className="sort-control">
                      Type
                      <select
                        value={selectedTripKindFilter}
                        onChange={(event) => setSelectedTripKindFilter(event.target.value)}
                      >
                        <option value="all">All trips</option>
                        <option value="past">Past trips</option>
                        <option value="wishlist">Wish list</option>
                      </select>
                    </label>
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
                {!loading && !displayedTrips.length ? <div className="empty-guidance"><h3>{trips.length ? "No trips match your filters" : "Your first trip starts here"}</h3><p>{trips.length ? "Try a different search, type, or family member." : "Add a trip with just a name. You can add places and people later."}</p>{trips.length ? <button type="button" className="ghost-btn" onClick={() => { setQuery(""); setSelectedTripKindFilter("all"); setSelectedPeopleFilters([]); }}>Clear filters</button> : null}</div> : null}
                {tripEdit ? (
                  <div className="edit-card" id="trip-edit-form">
                    <h3>Edit Trip</h3>
                    {tripConflictId === tripEdit.id ? <div role="alert" className="form-warning"><p>Your draft is kept. This trip has changed; review the latest trip before starting a fresh edit.</p><button type="button" className="ghost-btn" onClick={reviewLatestTrip}>Review latest trip</button></div> : null}
                    <label>
                      Trip Name
                      <input value={tripEdit.title} onChange={onTripEditChange("title")} />
                    </label>
                    <label>
                      Trip Type
                      <select value={tripEdit.trip_kind} onChange={onTripEditChange("trip_kind")}>
                        <option value="past">Past Trip</option>
                        <option value="wishlist">Wishlist</option>
                      </select>
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
                    {normalizeTripKind(tripEdit.trip_kind) === "wishlist" ? (
                      <p className="helper-text">Dates are optional. Changing trip type keeps the dates you entered.</p>
                    ) : null}
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
                      {(tripEdit.unmatched_people || []).map((name) => <label key={name} className="member-item"><input type="checkbox" checked={!(tripEdit.excluded_people || []).includes(name)} onChange={(event) => { const checked = event.target.checked; setTripEdit((prev) => ({ ...prev, excluded_people: checked ? prev.excluded_people.filter((entry) => entry !== name) : [...prev.excluded_people, name] })); }} /><span>{name} (saved on this trip)</span></label>)}
                    </fieldset>
                    <label>
                      Notes
                      <textarea rows={3} value={tripEdit.notes} onChange={onTripEditChange("notes")} />
                    </label>
                    <label>
                      Route
                      <textarea rows={4} value={tripEdit.route_text} onChange={onTripEditChange("route_text")} />
                    </label>
                    <RouteBuilderPanel
                      routeText={tripEdit.route_text}
                      onRouteTextChange={(route_text) =>
                        setTripEdit((prev) => (prev ? { ...prev, route_text } : prev))
                      }
                      routeQuery={routeQuery}
                      setRouteQuery={(value) => {
                        setRouteSearchTarget("edit");
                        setRouteQuery(value);
                      }}
                      routeResults={routeSearchTarget === "edit" ? routeResults : []}
                      routeSuggestions={routeSearchTarget === "edit" ? routeSuggestions : []}
                      routeSuggestionsOpen={routeSearchTarget === "edit" && routeSuggestionsOpen}
                      routeSearching={routeSearching && routeSearchTarget === "edit"}
                      routeSuggesting={routeSuggesting && routeSearchTarget === "edit"}
                      onSearch={() => {
                        setRouteSearchTarget("edit");
                        searchRouteLocations();
                      }}
                      onSelectSuggestion={(result) => selectRouteSuggestion(result, "edit")}
                    />
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
                    <div className="action-row">
                      <button type="button" onClick={onSaveTripEdit} disabled={editDateRangeInvalid || tripSaving}>{tripSaving ? "Saving…" : "Save Changes"}</button>
                      <button
                        type="button"
                        className="ghost-btn"
                        onClick={() => {
                          if (!window.confirm("Discard this unfinished edit?")) return;
                          drafts.clear();
                          setTripConflictId(null);
                          setDetailTripId(tripEdit.id);
                          setTripEdit(null);
                          setRouteSearchTarget("create");
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : null}
                <ul className={`trip-list ${listMode === "timeline" ? "trip-timeline" : ""}`}>
                  {(listMode === "timeline" ? sortTrips(displayedTrips, "date_desc") : displayedTrips).map((trip) => {
                    return (
                      <li
                        key={trip.id}
                        className={selectedTripIdsSet.has(trip.id) ? "is-selected" : ""}
                        onClick={(event) => {
                          if (!event.target.closest("button, input, label, summary, details, a")) openDetails(trip);
                        }}
                      >
                        <div className="trip-header">
                          <div className="trip-open-heading">
                            {selectionMode ? <label className="trip-checkbox"><input type="checkbox" checked={selectedTripIdsSet.has(trip.id)} onChange={() => toggleTripSelection(trip.id)} aria-label={`Select ${trip.title}`} />Select</label> : null}
                            <h3><button type="button" className="trip-title-button" onClick={() => openDetails(trip)}>{trip.title}</button></h3>
                          </div>
                          <div className="trip-actions">
                            <button type="button" className="ghost-btn" onClick={() => openTripMap(trip)}>Map</button>
                            <button type="button" className="ghost-btn" onClick={() => setAddStopTarget({ tripId: trip.id })}>Add Stop</button>
                            <details className="trip-overflow"><summary>More</summary><div className="trip-overflow-actions">
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
                              Calendar
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
                            </div></details>
                          </div>
                        </div>
                        <p>
                          {trip.start_date || "Dates not set"}{trip.end_date ? ` – ${trip.end_date}` : ""}
                        </p>
                        <p><strong>{getTripKindLabel(trip.trip_kind)}</strong></p>
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
                              Add Summary to Google Calendar
                            </button>
                            <button type="button" className="calendar-ics-btn" onClick={() => onDownloadTripIcs(trip)}>
                              Download ICS
                            </button>
                          </div>
                        ) : null}

                      </li>
                    );
                  })}
                </ul>
            </div>

            {activeTab === "map" ? (
              <div className="map-tab-card">
                <h3>Map</h3>
                <button type="button" className="ghost-btn" onClick={returnFromMap}>Back to {mapReturnRef.current?.detail ? "trip details" : "trips"}</button>
                <p className="helper-text">
                  Explore your saved places and routes. Choose a trip in Trips to focus the map on its stops.
                </p>
              </div>
            ) : null}

            {activeTab === "hub" ? (
              <>
                <h3>Family Hub: Packing Lists</h3>
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

          </div>
        </section>

        {activeTab === "map" || (activeTab === "trips" && (showCreateTrip || tripEdit)) ? <section className="panel map-panel" aria-label="Map">
          <div className="map-header">
            <h2>Map</h2>
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
              <label className="map-layer-toggle">
                <input
                  type="checkbox"
                  checked={showRouteArrows}
                  onChange={(event) => setShowRouteArrows(event.target.checked)}
                />
                <span>Route Direction</span>
              </label>
            </div>
          </div>
          {showSavedTripMapLayers && !visibleMapTrips.some((trip) => trip.route?.length) ? <div className="empty-guidance" role="status"><strong>{visibleMapTrips.length ? "These trips don't have map stops yet" : "No trips match your filters"}</strong><p>{visibleMapTrips.length ? "Use Add Stop from a trip to show its places here." : "Try a different search, type, or family member."}</p></div> : null}
          <MapContainer
            center={mapCenter}
            zoom={4}
            minZoom={2}
            maxBounds={[[-85, -180], [85, 180]]}
            maxBoundsViscosity={1}
            scrollWheelZoom
            className="map-view"
          >
            <MapFocus selectedTrips={showSavedTripMapLayers ? (selectedTrips.length ? selectedTrips : focusedTrip ? [focusedTrip] : []) : []} />
            <MapSearchResultsLayer
              results={routeResults}
              targetLabel={activeRouteSearchTarget === "edit" ? "edited trip" : "new trip"}
              onAddResult={(result) => appendRoutePoint(result, activeRouteSearchTarget)}
            />
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              noWrap
              bounds={[[-85, -180], [85, 180]]}
            />
            {showSavedTripMapLayers && showHeatmap ? <TripHeatmapLayer trips={heatmapTrips} /> : null}
            {showSavedTripMapLayers ? visibleMapTrips.map((trip) => {
              const isSelected = selectedTripIdsSet.has(trip.id);
              const shouldHighlight = !hasExplicitSelection || isSelected;
              const orderedRoute = getOrderedRoutePoints(trip.route);
              const coords = orderedRoute.map((point) => [point.lat, point.lng]);
              const lineColor = getTripLineColor(trip.trip_kind, shouldHighlight);
              const arrowSegments = getRouteArrowSegments(orderedRoute);
              return (
                <Fragment key={trip.id}>
                  {showRouteArrows && coords.length > 1 ? (
                    <Polyline
                      positions={coords}
                      eventHandlers={{
                        click: (event) => showTripDetail(trip, "", [event.latlng.lat, event.latlng.lng]),
                      }}
                      pathOptions={{
                        color: lineColor,
                        weight: getTripLineWeight(shouldHighlight),
                        opacity: shouldHighlight ? 0.85 : 0.22,
                      }}
                    />
                  ) : null}
                  {showRouteArrows ? arrowSegments.map((segment, idx) => (
                    <Marker
                      key={`${trip.id}-route-arrow-${idx}`}
                      position={segment.position}
                      icon={createRouteArrowIcon(lineColor, segment.angle, shouldHighlight)}
                      interactive={false}
                      keyboard={false}
                      opacity={shouldHighlight ? 0.95 : 0.4}
                      zIndexOffset={shouldHighlight ? 450 : 150}
                    />
                  )) : null}
                </Fragment>
              );
            }) : null}
            {showSavedTripMapLayers && showMarkerClusters ? (
              <ClusteredTripMarkers
                trips={visibleMapTrips}
                selectedTripIdsSet={selectedTripIdsSet}
                hasExplicitSelection={hasExplicitSelection}
                onToggleTripSelection={toggleTripSelection}
                onShowTripDetail={showTripDetail}
              />
            ) : showSavedTripMapLayers ? (
              visibleMapTrips.map((trip) => {
                const isSelected = selectedTripIdsSet.has(trip.id);
                const shouldHighlight = !hasExplicitSelection || isSelected;
                return (trip.route || []).map((point, idx) => (
                  <Marker
                    key={`${trip.id}-${idx}`}
                    position={[point.lat, point.lng]}
                    icon={getTripMarkerIcon(trip.trip_kind)}
                    opacity={shouldHighlight ? 1 : 0.55}
                    eventHandlers={{
                      click: () => {
                        toggleTripSelection(trip.id);
                        showTripDetail(trip, point.label || "Stop", [point.lat, point.lng]);
                      },
                    }}
                  />
                ));
              })
            ) : null}
            {showSavedTripMapLayers ? selectedTrips.flatMap((trip) =>
              (trip.route || []).map((point, idx) => (
                <CircleMarker
                  key={`selected-${trip.id}-${idx}`}
                  center={[point.lat, point.lng]}
                  radius={13}
                  pathOptions={{
                    color: normalizeTripKind(trip.trip_kind) === "wishlist" ? "#5f6b76" : "#e55f2b",
                    fillColor: normalizeTripKind(trip.trip_kind) === "wishlist" ? "#cbd4dd" : "#ffd16a",
                    fillOpacity: 0.45,
                    weight: 3,
                  }}
                />
              ))
            ) : null}
            {showSavedTripMapLayers && mapDetailTrip && mapDetail?.position ? (
              <Popup
                position={mapDetail.position}
                closeButton={false}
                autoClose={false}
                closeOnClick={false}
                className="map-inline-popup"
                offset={[16, -22]}
              >
                <div className="map-inline-detail">
                  <button
                    type="button"
                    className="map-inline-close"
                    onClick={() => setMapDetail(null)}
                    aria-label="Close trip details"
                  >
                    x
                  </button>
                  <TripPopupContent trip={mapDetailTrip} stopLabel={mapDetail.stopLabel || ""} />
                </div>
              </Popup>
            ) : null}
          </MapContainer>
        </section> : null}

      </main>
      </div>
    </div>
  );
}
