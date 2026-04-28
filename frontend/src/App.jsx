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
  createPeopleProfile,
  createTrip,
  deletePeopleProfile,
  deleteTrip,
  fetchPeopleProfiles,
  fetchTrips,
} from "./api";
import "leaflet/dist/leaflet.css";
import "./styles.css";

const pinIcon = new L.Icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

const emptyForm = {
  title: "",
  start_date: "",
  end_date: "",
  notes: "",
  selected_person_ids: [],
  route_text: "",
  accommodations_text: "",
};

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

function parseAccommodations(text) {
  if (!text.trim()) return [];
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, location = "", checkIn = "", checkOut = "", notes = ""] = line
        .split("|")
        .map((piece) => piece.trim());
      if (!name) {
        throw new Error(`Accommodation line missing name: "${line}"`);
      }
      return {
        name,
        location,
        check_in: checkIn || null,
        check_out: checkOut || null,
        notes,
      };
    });
}

function tripToMapCenter(trips) {
  const points = trips.flatMap((trip) => trip.route || []);
  if (!points.length) return [37.0902, -95.7129];
  return [points[0].lat, points[0].lng];
}

function normalizePersonName(name) {
  return (name || "").trim().toLowerCase();
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

export default function App() {
  const [trips, setTrips] = useState([]);
  const [peopleProfiles, setPeopleProfiles] = useState([]);
  const [query, setQuery] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [personDraft, setPersonDraft] = useState({
    name: "",
    relationship: "",
    notes: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sortBy, setSortBy] = useState("date_desc");
  const [selectedPeopleFilters, setSelectedPeopleFilters] = useState([]);
  const [selectedTripIds, setSelectedTripIds] = useState([]);
  const [focusedTripId, setFocusedTripId] = useState(null);
  const [isPersonFilterOpen, setIsPersonFilterOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("log");
  const [routeQuery, setRouteQuery] = useState("");
  const [routeResults, setRouteResults] = useState([]);
  const [routeSearching, setRouteSearching] = useState(false);
  const personFilterRef = useRef(null);

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

  useEffect(() => {
    loadTrips();
    loadPeopleProfiles();
  }, []);

  useEffect(() => {
    const validIds = new Set(peopleProfiles.map((person) => person.id));
    setForm((prev) => ({
      ...prev,
      selected_person_ids: prev.selected_person_ids.filter((id) => validIds.has(id)),
    }));
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

  useEffect(() => {
    const validIds = new Set(displayedTrips.map((trip) => trip.id));
    setSelectedTripIds((prev) => prev.filter((id) => validIds.has(id)));
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
    try {
      const peopleMap = new Map(peopleProfiles.map((person) => [person.id, person.name]));
      const payload = {
        title: form.title.trim(),
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        notes: form.notes,
        people: form.selected_person_ids.map((id) => peopleMap.get(id)).filter(Boolean),
        route: parseRoute(form.route_text),
        accommodations: parseAccommodations(form.accommodations_text),
      };
      await createTrip(payload);
      setForm(emptyForm);
      await loadTrips(query);
    } catch (err) {
      setError(err.message || "Could not save trip");
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
      </header>

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
              className={`tab-btn ${activeTab === "members" ? "is-active" : ""}`}
              onClick={() => setActiveTab("members")}
            >
              Member Profiles
            </button>
          </div>

          <div className="tab-panel">
            {activeTab === "log" ? (
              <>
                <h2>Log A Trip</h2>
                <form className="trip-form" onSubmit={onSubmit}>
                  <label>
                    Trip Name
                    <input value={form.title} onChange={onFormChange("title")} required />
                  </label>
                  <div className="row">
                    <label>
                      Start
                      <input type="date" value={form.start_date} onChange={onFormChange("start_date")} />
                    </label>
                    <label>
                      End
                      <input type="date" value={form.end_date} onChange={onFormChange("end_date")} />
                    </label>
                  </div>
                  <fieldset className="members-fieldset">
                    <legend>Family Members</legend>
                    {!peopleProfiles.length ? <p className="helper-text">Add a profile in Member Profiles to start selecting members.</p> : null}
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
                  <label>
                    Accommodations (name|location|check_in|check_out|notes)
                    <textarea
                      rows={5}
                      value={form.accommodations_text}
                      onChange={onFormChange("accommodations_text")}
                      placeholder="Sea View Inn|Santa Monica|2026-03-04|2026-03-06|Close to beach"
                    />
                  </label>
                  <button type="submit">Save Trip</button>
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
                <ul className="trip-list">
                  {displayedTrips.map((trip) => (
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
                    </li>
                  ))}
                </ul>
              </>
            ) : null}

            {activeTab === "members" ? (
              <>
                <h2>Member Profiles</h2>
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
                      <button type="button" onClick={() => onDeletePersonProfile(person.id)}>Remove</button>
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
