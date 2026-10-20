import { createEmptyAccommodation, createEmptyItineraryEvent } from "../lib/tripUtils.js";

export function AccommodationRepeater({ accommodations, onChange }) {
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

export function ItineraryRepeater({ itinerary, onChange }) {
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
