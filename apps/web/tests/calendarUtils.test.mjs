import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCalendarEvents,
  buildGoogleCalendarUrl,
  buildTripIcsText,
} from "../src/lib/calendarUtils.js";

const trip = {
  id: 42,
  title: "Taiwan trip",
  start_date: "2026-02-13",
  end_date: "2026-02-22",
  notes: "Family visit",
  people: ["Edmund", "TingYu"],
  route: [{ lat: 22.6273, lng: 120.3014, label: "Kaohsiung" }],
  accommodations: [
    { name: "Home", location: "Kaohsiung", check_in: "2026-02-13", check_out: "2026-02-22", notes: "" },
  ],
  itinerary: [
    { date: "2026-02-14", time: "10:30", activity: "Temple visit", location: "Tainan", notes: "Bring camera" },
  ],
  created_at: "2026-01-01T00:00:00Z",
};

test("buildCalendarEvents includes summary, stay, and itinerary events", () => {
  const events = buildCalendarEvents(trip);
  assert.equal(events.length, 3);
  assert.equal(events[0].title, "Taiwan trip");
  assert.equal(events[0].start, "20260213");
  assert.equal(events[0].end, "20260223");
});

test("Google calendar URL is a summary event link", () => {
  const url = buildGoogleCalendarUrl(buildCalendarEvents(trip)[0]);
  assert.ok(url.startsWith("https://calendar.google.com/calendar/render?"));
  assert.ok(url.includes("action=TEMPLATE"));
  assert.ok(url.includes("Taiwan+trip"));
});

test("ICS export contains all calendar events", () => {
  const ics = buildTripIcsText(trip);
  assert.match(ics, /BEGIN:VCALENDAR/);
  assert.match(ics, /SUMMARY:Taiwan trip/);
  assert.match(ics, /SUMMARY:Stay: Home/);
  assert.match(ics, /SUMMARY:Temple visit/);
});
