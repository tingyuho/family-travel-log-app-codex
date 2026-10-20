import { useEffect, useId, useRef, useState } from "react";
import { searchPlaces, addTripStop } from "../api";
import { buildStopInput } from "../lib/tripWorkflow";
import PlannerTripView from "./PlannerTripView";

export function TripDialog({ title, onClose, children, busy = false, dismissible = true }) {
  const ref = useRef(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog ref={ref} className="trip-dialog" aria-labelledby={titleId}
      onCancel={(event) => { event.preventDefault(); if (!busy && dismissible) onClose(); }}>
      <div className="dialog-header"><h2 id={titleId}>{title}</h2>
        {dismissible ? <button type="button" className="ghost-btn" disabled={busy} onClick={onClose}>Back</button> : null}
      </div>
      {children}
    </dialog>
  );
}

export function TripDetailsDialog({ trip, onClose, onAddStop, onEdit, onMap, onCalendar }) {
  return (
    <TripDialog title={trip.title} onClose={onClose}>
      <div className="action-row">
        <button type="button" onClick={onAddStop}>Add Stop</button>
        <button type="button" className="ghost-btn" onClick={onEdit}>Edit Trip</button>
        <button type="button" className="ghost-btn" onClick={onMap}>Map</button>
        <button type="button" className="ghost-btn" onClick={onCalendar}>Calendar</button>
      </div>
      <PlannerTripView trip={trip} onAddStop={onAddStop} showHeading={false} />
    </TripDialog>
  );
}

export function AddStopDialog({ trips, initialTripId, onClose, onSaved }) {
  const [tripId, setTripId] = useState(initialTripId ? String(initialTripId) : "");
  const [tripSearch, setTripSearch] = useState("");
  const [query, setQuery] = useState("");
  const [place, setPlace] = useState(null);
  const [results, setResults] = useState([]);
  const [label, setLabel] = useState("");
  const [notes, setNotes] = useState("");
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const savingRef = useRef(false);
  const trip = trips.find((item) => String(item.id) === tripId);
  const matches = trips.filter((item) => item.id === trip?.id || `${item.title} ${item.start_date || ""} ${item.end_date || ""}`.toLowerCase().includes(tripSearch.trim().toLowerCase()));
  useEffect(() => {
    let cancelled = false;
    setResults([]);
    setError("");
    if (query.trim().length < 2 || place) { setSearching(false); return; }
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const data = await searchPlaces(query.trim());
        if (!cancelled) setResults(data.slice(0, 5));
      } catch {
        if (!cancelled) setError("Couldn't search places. Try again.");
      } finally { if (!cancelled) setSearching(false); }
    }, 350);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [query, place]);

  function requestClose() {
    if (savingRef.current) return;
    if ((query.trim() || notes.trim()) && !window.confirm("Discard this unsaved stop?")) return;
    onClose();
  }

  async function save(event) {
    event.preventDefault();
    if (!trip || !place || savingRef.current) return;
    const lat = Number(place.lat), lng = Number(place.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) { setError("Choose a place with a map location."); return; }
    savingRef.current = true;
    setSaving(true);
    setError("");
    try {
      const saved = await addTripStop(trip.id, buildStopInput(place, label, notes));
      onSaved(saved);
    } catch { setError("Couldn't save this stop. Your entry is still here; please try again."); }
    finally { savingRef.current = false; setSaving(false); }
  }

  return (
    <TripDialog title="Add Stop" onClose={requestClose} busy={saving}>
      <form className="trip-form" onSubmit={save}>
        <p>Choose a trip, find a place, and save it.</p>
        <label>Search trips<input value={tripSearch} onChange={(event) => setTripSearch(event.target.value)} placeholder="Trip name or date" /></label>
        <label>Adding to<select value={tripId} required onChange={(event) => setTripId(event.target.value)}>
          <option value="">Choose a trip</option>
          {matches.map((item) => <option key={item.id} value={item.id}>{item.title} · {item.start_date || "Dates not set"}</option>)}
        </select></label>
        {!trips.length ? <p>Create a trip before adding a stop.</p> : matches.length ? null : <p>No trips match your search.</p>}
        <label>Find place<input value={query} onChange={(event) => { setQuery(event.target.value); setPlace(null); }} placeholder="Search landmark, restaurant, or city" /></label>
        {searching ? <p role="status">Searching places…</p> : null}
        {results.length ? <ul className="place-results">{results.map((result) => <li key={result.place_id}><button type="button" className="ghost-btn" onClick={() => { setPlace(result); setQuery(result.display_name); setLabel(result.display_name.split(",")[0]); }}>{result.display_name}</button></li>)}</ul> : null}
        {!searching && query.trim().length >= 2 && !place && !results.length && !error ? <p>Try another place name or add a city to your search.</p> : null}
        <label>Stop name<input value={label} onChange={(event) => setLabel(event.target.value)} /></label>
        <label>Note (optional)<textarea rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
        {error ? <p role="alert" className="form-warning">{error}</p> : null}
        <p aria-live="polite">{trip ? `Saving to ${trip.title}` : "Choose a trip before saving."}</p>
        <div className="action-row"><button type="submit" disabled={!trip || !place || saving}>{saving ? "Saving…" : "Save Stop"}</button><button type="button" className="ghost-btn" disabled={saving} onClick={requestClose}>Cancel</button></div>
      </form>
    </TripDialog>
  );
}
