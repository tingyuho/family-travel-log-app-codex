export default function TripSpotlight({ trip, onOpen, onAddStop }) {
  const placeCount = trip.route?.length || 0;
  const travelerCount = trip.people?.length || 0;

  return (
    <section className="trip-spotlight" aria-label={`Featured trip: ${trip.title}`}>
      <img src="/images/planner-cover.jpg" alt="" width="1200" height="675" />
      <div className="trip-spotlight-copy">
        <p className="eyebrow">Trip spotlight</p>
        <h3><button type="button" className="trip-title-button" onClick={onOpen}>{trip.title}</button></h3>
        <p className="trip-spotlight-dates">
          {trip.start_date || "Dates not set"}{trip.end_date ? ` – ${trip.end_date}` : ""}
          <span className="trip-kind">{trip.trip_kind === "wishlist" ? "Wishlist" : "Past trip"}</span>
        </p>
        <p className="trip-spotlight-stats">
          {placeCount} {placeCount === 1 ? "place" : "places"} · {travelerCount} {travelerCount === 1 ? "traveler" : "travelers"}
        </p>
        {trip.notes?.trim() ? <p className="trip-note-preview">{trip.notes}</p> : null}
      </div>
      <div className="trip-spotlight-actions">
        <button type="button" onClick={onOpen}>Open plan</button>
        <button type="button" className="ghost-btn" onClick={onAddStop}>Add Stop</button>
      </div>
    </section>
  );
}
