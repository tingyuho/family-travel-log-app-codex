import Constants from "expo-constants";
import { Platform } from "react-native";

import Storage from "./storage";

export type AuthState = {
  token: string;
  userId: string;
};

export type RoutePoint = {
  lat: number;
  lng: number;
  label?: string | null;
  order?: number | null;
};

export type Trip = {
  id: number;
  title: string;
  trip_kind: "past" | "wishlist";
  start_date?: string | null;
  end_date?: string | null;
  notes: string;
  route: RoutePoint[];
  people: string[];
  accommodations: Array<{
    name: string;
    location: string;
    check_in?: string | null;
    check_out?: string | null;
    notes: string;
  }>;
  itinerary: Array<{
    date: string;
    time: string;
    activity: string;
    location: string;
    notes: string;
  }>;
  created_at: string;
  updated_at: string;
};

export type AccommodationInput = {
  name: string;
  location: string;
  check_in?: string | null;
  check_out?: string | null;
  notes: string;
};

export type ItineraryEventInput = {
  date: string;
  time: string;
  activity: string;
  location: string;
  notes: string;
};

export type TripWritePayload = {
  title: string;
  trip_kind: "past" | "wishlist";
  start_date?: string | null;
  end_date?: string | null;
  notes: string;
  route: RoutePoint[];
  people: string[];
  accommodations: AccommodationInput[];
  itinerary: ItineraryEventInput[];
};

export type PersonProfile = {
  id: number;
  name: string;
  relationship: string;
  notes: string;
  sort_order: number;
  created_at: string;
};

export type PackingTemplate = {
  id: number;
  name: string;
  items: string[];
  created_at: string;
  updated_at: string;
};

export type TripDraft = {
  title: string;
  trip_kind: "past" | "wishlist";
  start_date?: string | null;
  end_date?: string | null;
  notes: string;
  route: RoutePoint[];
  people: string[];
  accommodations: AccommodationInput[];
  itinerary: ItineraryEventInput[];
};

export type PlaceSuggestion = {
  place_id: string;
  display_name: string;
  lat: string;
  lon: string;
};

const TOKEN_KEY = "travel_log_token";
const USER_ID_KEY = "travel_log_user_id";
const DEFAULT_REQUEST_TIMEOUT_MS = 15000;
const GET_RETRY_COUNT = 1;

let authToken = readStorage(TOKEN_KEY);
let currentUserId = readStorage(USER_ID_KEY);

function getDefaultApiBase() {
  const expoHost = detectExpoHost();
  if (expoHost) {
    return `http://${expoHost}:8000`;
  }
  if (Platform.OS === "android") return "http://10.0.2.2:8000";
  return "http://127.0.0.1:8000";
}

type RuntimeExtra = {
  appEnvironment?: string;
  apiBaseUrl?: string;
};

function resolveApiBase() {
  const extra = (Constants.expoConfig?.extra || {}) as RuntimeExtra;
  const appEnvironment = (extra.appEnvironment || "development").trim().toLowerCase();
  const configured = (process.env.EXPO_PUBLIC_API_BASE_URL?.trim() || extra.apiBaseUrl?.trim() || "")
    .replace(/\/+$/, "");

  if (appEnvironment === "production") {
    if (!configured) throw new Error("Missing EXPO_PUBLIC_API_BASE_URL in this production build");
    if (!configured.startsWith("https://")) {
      throw new Error("EXPO_PUBLIC_API_BASE_URL must use HTTPS in production");
    }
    return configured;
  }
  if (configured) return configured;
  if (__DEV__) return getDefaultApiBase();
  throw new Error("Missing EXPO_PUBLIC_API_BASE_URL in this non-development build");
}

export const API_BASE = resolveApiBase();

function detectExpoHost() {
  const candidates = [
    (Constants.expoConfig as { hostUri?: string } | null)?.hostUri,
    ((Constants as unknown as { manifest?: { debuggerHost?: string; hostUri?: string } }).manifest?.debuggerHost),
    ((Constants as unknown as { manifest?: { debuggerHost?: string; hostUri?: string } }).manifest?.hostUri),
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    const host = candidate.split(",")[0].split(":")[0].trim();
    if (!host) continue;
    if (host === "127.0.0.1" || host === "localhost") continue;
    return host;
  }
  return "";
}

function readStorage(key: string) {
  try {
    return Storage.getItemSync(key) || "";
  } catch {
    return "";
  }
}

function writeStorage(key: string, value: string) {
  try {
    if (value) {
      Storage.setItemSync(key, value);
    } else {
      Storage.removeItemSync(key);
    }
  } catch {
    // The in-memory auth state still keeps this session usable if storage is unavailable.
  }
}

export function getAuthState(): AuthState {
  return { token: authToken, userId: currentUserId };
}

export function setAuthState(token: string, userId: string) {
  authToken = token || "";
  currentUserId = userId || "";
  writeStorage(TOKEN_KEY, authToken);
  writeStorage(USER_ID_KEY, currentUserId);
}

export function clearAuthState() {
  setAuthState("", "");
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((options.headers as Record<string, string> | undefined) || {}),
  };

  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  const method = (options.method || "GET").toUpperCase();
  const maxAttempts = method === "GET" ? GET_RETRY_COUNT + 1 : 1;
  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DEFAULT_REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers,
        signal: controller.signal,
      });

      if (!response.ok) {
        if (method === "GET" && response.status >= 500 && attempt < maxAttempts - 1) {
          await waitBeforeRetry(attempt);
          continue;
        }
        const text = await response.text();
        throw new Error(parseApiError(text) || `Request failed (${response.status})`);
      }

      if (response.status === 204) {
        return null as T;
      }

      return response.json() as Promise<T>;
    } catch (error) {
      lastError = controller.signal.aborted ? new Error("Network request timed out.") : error;
      if (method !== "GET" || attempt >= maxAttempts - 1 || !isRetriableNetworkError(lastError)) break;
      await waitBeforeRetry(attempt);
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Network request failed.");
}

function waitBeforeRetry(attempt: number) {
  return new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
}

function isRetriableNetworkError(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return (
    message.includes("network") ||
    message.includes("timeout") ||
    message.includes("aborted") ||
    message.includes("failed to fetch")
  );
}

function parseApiError(text: string) {
  if (!text) return "";
  try {
    const parsed = JSON.parse(text) as { detail?: string | Array<{ msg?: string }> };
    if (typeof parsed.detail === "string") return parsed.detail;
    if (Array.isArray(parsed.detail)) {
      return parsed.detail.map((item) => item.msg).filter(Boolean).join("\n");
    }
  } catch {
    return text;
  }
  return text;
}

export async function login(payload: { user_id: string; password: string }) {
  const data = await request<AuthState & { user_id: string }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  setAuthState(data.token, data.user_id);
  return data;
}

export async function register(payload: { user_id: string; email: string; password: string }) {
  const data = await request<AuthState & { user_id: string }>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  setAuthState(data.token, data.user_id);
  return data;
}

export function requestPasswordReset(payload: { user_id: string }) {
  return request<null>("/api/auth/request-password-reset", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function resetPassword(payload: {
  user_id: string;
  email_code: string;
  new_password: string;
  reset_key: string;
}) {
  return request<null>("/api/auth/reset-password", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function logout() {
  try {
    if (authToken) {
      await request<null>("/api/auth/logout", { method: "POST" });
    }
  } finally {
    clearAuthState();
  }
}

export function fetchMe() {
  return request<{ user_id: string; email: string }>("/api/auth/me");
}

export function updateMyProfile(payload: { email: string }) {
  return request<{ user_id: string; email: string }>("/api/auth/me", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function fetchTrips(query = "") {
  const suffix = query.trim() ? `?q=${encodeURIComponent(query.trim())}` : "";
  return request<Trip[]>(`/api/trips${suffix}`);
}

export function createTrip(payload: TripDraft | TripWritePayload) {
  return request<Trip>("/api/trips", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateTrip(id: number, payload: TripWritePayload) {
  return request<Trip>(`/api/trips/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function deleteTrip(id: number) {
  return request<null>(`/api/trips/${id}`, { method: "DELETE" });
}

export function fetchPeopleProfiles() {
  return request<PersonProfile[]>("/api/people");
}

export function createPeopleProfile(payload: { name: string; relationship: string; notes: string }) {
  return request<PersonProfile>("/api/people", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updatePeopleProfile(
  id: number,
  payload: { name: string; relationship: string; notes: string }
) {
  return request<PersonProfile>(`/api/people/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function reorderPeopleProfiles(orderedIds: number[]) {
  return request<PersonProfile[]>("/api/people/reorder", {
    method: "PUT",
    body: JSON.stringify({ ordered_ids: orderedIds }),
  });
}

export function deletePeopleProfile(id: number) {
  return request<null>(`/api/people/${id}`, { method: "DELETE" });
}

export function fetchPackingTemplates() {
  return request<PackingTemplate[]>("/api/packing-templates");
}

export function createPackingTemplate(payload: { name: string; items: string[] }) {
  return request<PackingTemplate>("/api/packing-templates", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updatePackingTemplate(id: number, payload: { name: string; items: string[] }) {
  return request<PackingTemplate>(`/api/packing-templates/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function deletePackingTemplate(id: number) {
  return request<null>(`/api/packing-templates/${id}`, { method: "DELETE" });
}

export function searchPlaces(query: string) {
  const suffix = `?q=${encodeURIComponent(query.trim())}&limit=8`;
  return request<PlaceSuggestion[]>(`/api/locations/search${suffix}`);
}
