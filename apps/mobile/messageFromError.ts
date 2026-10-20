import { API_BASE } from "./api";

export type ErrorContext = "default" | "place_search";

export function messageFromError(error: unknown, context: ErrorContext = "default") {
  const message = error instanceof Error ? error.message : "Something went wrong";
  const lower = message.toLowerCase();
  if (
    lower.includes("network request failed") ||
    lower.includes("timeout") ||
    lower.includes("aborted") ||
    lower.includes("failed to fetch")
  ) {
    if (context === "place_search") {
      return `Could not reach place search through ${API_BASE}. Check backend network access and try again.`;
    }
    return `Could not reach backend at ${API_BASE}. Check server status and LAN reachability.`;
  }
  if (lower.includes("email") && lower.includes("not configured")) {
    return "Password reset email is not set up yet. Ask the app owner to configure SMTP on the backend.";
  }
  if (lower.includes("rate-limit") || lower.includes("too many") || lower.includes("429")) {
    return "That action is temporarily limited for safety. Wait a minute, then try again.";
  }
  if (lower.includes("unable to open url") || lower.includes("calendar.google.com")) {
    return "Could not open Google Calendar on this device. Try the ICS share option instead.";
  }
  return message;
}
