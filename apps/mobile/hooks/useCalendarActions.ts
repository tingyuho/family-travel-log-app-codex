import { Alert, Linking } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";

import type { Trip } from "../api";
import { getOrderedRoutePoints } from "../mapLayers";

export function useCalendarActions({
  onError,
}: {
  onError: (error: unknown) => void;
}) {
  async function openGoogleCalendarForTrip(trip: Trip) {
    try {
      const url = buildGoogleCalendarUrl(trip);
      if (!url) throw new Error("Trip needs start and end dates.");
      await Linking.openURL(url);
    } catch (e) {
      onError(e);
      Alert.alert(
        "Calendar did not open",
        "Google Calendar can be picky on iPhone. You can share an ICS calendar file instead.",
        [
          { text: "Not now", style: "cancel" },
          { text: "Share ICS", onPress: () => void shareTripIcs(trip) },
        ]
      );
    }
  }

  async function shareTripIcs(trip: Trip) {
    try {
      const content = buildIcsText(trip);
      if (!content) throw new Error("Trip needs start and end dates.");
      const fileName = `${(trip.title || "trip").replace(/[^a-zA-Z0-9_-]+/g, "-").toLowerCase()}.ics`;
      const path = `${FileSystem.cacheDirectory || ""}${fileName}`;
      await FileSystem.writeAsStringAsync(path, content, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(path, {
          mimeType: "text/calendar",
          UTI: "public.ics",
        });
      } else {
        Alert.alert("ICS saved", path);
      }
    } catch (e) {
      onError(e);
    }
  }

  return {
    openGoogleCalendarForTrip,
    shareTripIcs,
  };
}

function buildGoogleCalendarUrl(trip: Trip) {
  if (!trip.start_date || !trip.end_date) return "";
  const start = formatGoogleDate(trip.start_date, false);
  const end = formatGoogleDate(trip.end_date, true);
  if (!start || !end) return "";
  const details = [trip.notes || "", trip.people.length ? `People: ${trip.people.join(", ")}` : ""].filter(Boolean).join("\n");
  const location = getOrderedRoutePoints(trip.route).map((point) => point.label || `${point.lat},${point.lng}`).join(" -> ");
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: trip.title || "Family Trip",
    details,
    location,
    dates: `${start}/${end}`,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function formatGoogleDate(dateText: string, endExclusive: boolean) {
  const date = new Date(`${dateText}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  if (endExclusive) date.setDate(date.getDate() + 1);
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
}

function buildIcsText(trip: Trip) {
  if (!trip.start_date || !trip.end_date) return "";
  const start = formatGoogleDate(trip.start_date, false);
  const end = formatGoogleDate(trip.end_date, true);
  if (!start || !end) return "";
  const now = new Date();
  const stamp = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}${String(now.getUTCDate()).padStart(2, "0")}T${String(now.getUTCHours()).padStart(2, "0")}${String(now.getUTCMinutes()).padStart(2, "0")}${String(now.getUTCSeconds()).padStart(2, "0")}Z`;
  const details = escapeIcs([trip.notes || "", trip.people.length ? `People: ${trip.people.join(", ")}` : ""].filter(Boolean).join("\\n"));
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Family Travel Log//Mobile//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${trip.id}-${trip.created_at}@family-travel-log`,
    `DTSTAMP:${stamp}`,
    `SUMMARY:${escapeIcs(trip.title || "Family Trip")}`,
    `DTSTART;VALUE=DATE:${start}`,
    `DTEND;VALUE=DATE:${end}`,
    `DESCRIPTION:${details}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

function escapeIcs(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}
