import { useId, useState } from "react";
import TripItineraryTimeline from "./TripItineraryTimeline";

export default function PlannerTripView({ trip, onOpen, onAddStop, showHeading = true }) {
  const [activeSection, setActiveSection] = useState("Itinerary");
  const sectionId = useId();
  const date = trip.start_date ? new Date(`${trip.start_date}T00:00:00`) : null;
  const validDate = date && !Number.isNaN(date.getTime());
  return (
    <section className="planner-trip" aria-label={`Plan for ${trip.title}`}>
      {showHeading ? <div className="planner-heading-row">
        <div><p className="eyebrow">Trip overview</p><h2>{trip.title}</h2></div>
        <button type="button" onClick={onAddStop}>+ Add Stop</button>
      </div> : null}
      <div className="planner-date-summary">
        <div className="date-tile" aria-hidden="true"><span>{validDate ? date.toLocaleDateString(undefined, { month: "short" }) : "DATE"}</span><strong>{validDate ? date.getDate() : "—"}</strong></div>
        <div><strong>{trip.start_date || "Dates to be planned"}{trip.end_date ? ` – ${trip.end_date}` : ""}</strong><p>{trip.route?.length || 0} saved places · {trip.people?.length || 0} travelers · {trip.trip_kind === "wishlist" ? "Wishlist" : "Past trip"}</p></div>
      </div>
      <div className="planner-section-tabs" role="group" aria-label="Trip plan sections">
        {["Itinerary", "Places", "Stays"].map((name) => <button key={name} type="button" aria-pressed={name === activeSection} aria-controls={sectionId} onClick={() => setActiveSection(name)}>{name}</button>)}
      </div>
      <div className="planner-detail-grid">
        <div id={sectionId} className="planner-plan-content" aria-label={activeSection}>
          {activeSection === "Itinerary" ? <TripItineraryTimeline trip={trip} /> : null}
          {activeSection === "Places" ? <><h3>Saved places</h3>{trip.route?.length ? <ol className="planner-place-list">{[...trip.route].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map((stop, index) => <li key={index}><span>{String(index + 1).padStart(2, "0")}</span><strong>{stop.label || `Stop ${index + 1}`}</strong></li>)}</ol> : <p className="helper-text">No places yet. Add a stop to start your route.</p>}</> : null}
          {activeSection === "Stays" ? <><h3>Where you're staying</h3>{trip.accommodations?.length ? <ul className="planner-stay-list">{trip.accommodations.map((stay, index) => <li key={index}><strong>{stay.name}</strong><p>{stay.location}</p><small>{stay.check_in || "Check-in to be planned"}{stay.check_out ? ` – ${stay.check_out}` : ""}</small>{stay.notes ? <p className="preserve-lines">{stay.notes}</p> : null}</li>)}</ul> : <p className="helper-text">No stays saved. Add accommodations when you edit this trip.</p>}</> : null}
        </div>
        <aside className="planner-trip-facts" aria-label="Trip summary">
          <img className="planner-cover-photo" src="/images/planner-cover.jpg" alt="" width="1200" height="675" />
          <dl><dt>Travelers</dt><dd>{trip.people?.join(", ") || "Add your travel companions"}</dd><dt>Trip notes</dt><dd className="preserve-lines">{trip.notes || "Room for the details that matter."}</dd></dl>
          {onOpen ? <button type="button" className="ghost-btn" onClick={onOpen}>Open full trip →</button> : null}
        </aside>
      </div>
    </section>
  );
}
