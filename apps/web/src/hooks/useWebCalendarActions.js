import { useState } from "react";

export function useWebCalendarActions({
  buildCalendarEvents,
  buildGoogleCalendarUrl,
  buildTripIcsText,
  setError,
}) {
  const [calendarSyncTripId, setCalendarSyncTripId] = useState(null);
  const [calendarFallbackTrip, setCalendarFallbackTrip] = useState(null);

  const onDownloadTripIcs = (trip) => {
    try {
      const icsText = buildTripIcsText(trip);
      const blob = new Blob([icsText], { type: "text/calendar;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${(trip.title || "trip").replace(/[^\w-]+/g, "_")}.ics`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setCalendarFallbackTrip(null);
    } catch (err) {
      setError(err.message || "Could not build ICS file");
    }
  };

  const onOpenTripInGoogleCalendar = (trip) => {
    const events = buildCalendarEvents(trip);
    if (!events.length) {
      setError("No trip date data available for calendar sync.");
      setCalendarFallbackTrip(trip);
      return;
    }

    const popup = window.open(buildGoogleCalendarUrl(events[0]), "_blank", "noopener,noreferrer");
    if (!popup) {
      setCalendarFallbackTrip(trip);
      setError("Google Calendar did not open. Download the ICS file instead.");
      return;
    }

    if (events.length > 1) {
      setCalendarFallbackTrip(trip);
      setError("Google Calendar opens one summary event. Use Download ICS to import every stay and itinerary item.");
    } else {
      setCalendarFallbackTrip(null);
    }
  };

  return {
    calendarSyncTripId,
    setCalendarSyncTripId,
    calendarFallbackTrip,
    setCalendarFallbackTrip,
    onDownloadTripIcs,
    onOpenTripInGoogleCalendar,
  };
}
