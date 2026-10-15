export function addDaysToDateText(dateText, days) {
  const date = new Date(`${dateText}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

export function toCompactDate(dateText) {
  return (dateText || "").replace(/-/g, "");
}

export function toCompactDateTime(dateText, timeText) {
  const cleanDate = toCompactDate(dateText);
  if (!cleanDate) return "";
  const cleanTime = (timeText || "").replace(":", "").padEnd(4, "0").slice(0, 4);
  return cleanTime ? `${cleanDate}T${cleanTime}00` : cleanDate;
}

export function escapeIcsText(text) {
  return String(text || "")
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

export function buildCalendarEvents(trip) {
  if (!trip.start_date || !trip.end_date) return [];

  const routeLocation = (trip.route || []).map((point) => point.label || `${point.lat},${point.lng}`).join(" -> ");
  const tripSummaryLines = [];
  if (trip.people?.length) tripSummaryLines.push(`People: ${trip.people.join(", ")}`);
  if (trip.notes) tripSummaryLines.push(trip.notes);

  const events = [
    {
      id: `${trip.id}-summary`,
      title: trip.title || "Family Trip",
      start: toCompactDate(trip.start_date),
      end: toCompactDate(addDaysToDateText(trip.end_date || trip.start_date, 1)),
      allDay: true,
      details: tripSummaryLines.join("\n"),
      location: routeLocation,
    },
  ];

  for (const stay of trip.accommodations || []) {
    if (!stay.check_in && !stay.check_out) continue;
    events.push({
      id: `${trip.id}-stay-${events.length}`,
      title: `Stay: ${stay.name || "Accommodation"}`,
      start: toCompactDate(stay.check_in || trip.start_date),
      end: toCompactDate(addDaysToDateText(stay.check_out || stay.check_in || trip.end_date, 1)),
      allDay: true,
      details: stay.notes || "",
      location: stay.location || "",
    });
  }

  for (const item of trip.itinerary || []) {
    if (!item.date || !item.activity) continue;
    events.push({
      id: `${trip.id}-itinerary-${events.length}`,
      title: item.activity,
      start: toCompactDateTime(item.date, item.time),
      end: toCompactDateTime(item.date, item.time) || toCompactDate(item.date),
      allDay: !item.time,
      details: item.notes || "",
      location: item.location || "",
    });
  }

  return events;
}

export function buildGoogleCalendarUrl(event) {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${event.start}/${event.end || event.start}`,
    details: event.details || "",
    location: event.location || "",
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function buildTripIcsText(trip) {
  const events = buildCalendarEvents(trip);
  if (!events.length) {
    throw new Error("No trip date data available for calendar export.");
  }
  const now = new Date();
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Family Travel Log//EN",
    "CALSCALE:GREGORIAN",
  ];

  for (const event of events) {
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${event.id}@family-travel-log`);
    lines.push(`DTSTAMP:${stamp}`);
    lines.push(`SUMMARY:${escapeIcsText(event.title)}`);
    if (event.allDay) {
      lines.push(`DTSTART;VALUE=DATE:${event.start}`);
      lines.push(`DTEND;VALUE=DATE:${event.end || event.start}`);
    } else {
      lines.push(`DTSTART:${event.start}`);
      lines.push(`DTEND:${event.end || event.start}`);
    }
    if (event.details) lines.push(`DESCRIPTION:${escapeIcsText(event.details)}`);
    if (event.location) lines.push(`LOCATION:${escapeIcsText(event.location)}`);
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}
