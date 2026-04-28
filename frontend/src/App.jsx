import { Fragment, useEffect, useMemo, useState } from "react";
import {
  CircleMarker,
  MapContainer,
  Marker,
  Polyline,
  Popup,
  TileLayer,
  Tooltip,
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

function MapFocus({ selectedTrip }) {
  const map = useMap();
  useEffect(() => {
    if (!selectedTrip || !selectedTrip.route?.length) return;
    const points = selectedTrip.route.map((p) => [p.lat, p.lng]);
    if (points.length === 1) {
      map.setView(points[0], Math.max(map.getZoom(), 7), { animate: true });
      return;
    }
    map.fitBounds(points, { padding: [28, 28] });
  }, [map, selectedTrip]);
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
  const [personFilter, setPersonFilter] = useState("all");
  const [selectedTripIds, setSelectedTripIds] = useState([]);
  const [focusedTripId, setFocusedTripId] = useState(null);

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
    if (personFilter === "all") return trips;
    return trips.filter((trip) => (trip.people || []).includes(personFilter));
  }, [trips, personFilter]);

  const mapCenter = useMemo(() => tripToMapCenter(filteredTrips), [filteredTrips]);
  const displayedTrips = useMemo(() => sortTrips(filteredTrips, sortBy), [filteredTrips, sortBy]);
  const selectedTripIdsSet = useMemo(() => new Set(selectedTripIds), [selectedTripIds]);
  const hasExplicitSelection = selectedTripIds.length > 0;
  const focusedTrip = useMemo(
    () => displayedTrips.find((trip) => trip.id === focusedTripId) || null,
    [displayedTrips, focusedTripId]
  );

  useEffect(() => {
    const validIds = new Set(displayedTrips.map((trip) => trip.id));
    setSelectedTripIds((prev) => prev.filter((id) => validIds.has(id)));
    setFocusedTripId((prev) => (prev && validIds.has(prev) ? prev : null));
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
        <section className="panel">
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
        </section>

        <section className="panel member-panel">
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
        </section>

        <section className="panel map-panel">
          <h2>Travel Map</h2>
          <MapContainer center={mapCenter} zoom={4} scrollWheelZoom className="map-view">
            <MapFocus selectedTrip={focusedTrip} />
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {displayedTrips.map((trip) => {
              const isSelected = selectedTripIdsSet.has(trip.id);
              const shouldHighlight = !hasExplicitSelection || isSelected;
              const showTripLabel = !hasExplicitSelection || isSelected;
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
                        {showTripLabel && idx === 0 ? <Tooltip permanent direction="top">{trip.title}</Tooltip> : null}
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

        <section className="panel list-panel">
          <div className="trips-header">
            <h2>Trips</h2>
            <div className="trips-controls">
              <label className="sort-control">
                Person
                <select value={personFilter} onChange={(e) => setPersonFilter(e.target.value)}>
                  <option value="all">All people</option>
                  {peopleFilterOptions.map((name) => (
                    <option key={`person-filter-${name}`} value={name}>{name}</option>
                  ))}
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
        </section>
      </main>
    </div>
  );
}
