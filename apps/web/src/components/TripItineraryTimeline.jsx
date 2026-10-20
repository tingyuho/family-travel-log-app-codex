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

export default function TripItineraryTimeline({ trip }) {
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
