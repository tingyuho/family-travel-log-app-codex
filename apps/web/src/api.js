function resolveApiBase() {
  const configured = (import.meta.env.VITE_API_BASE_URL || "").trim();
  if (configured) {
    if (import.meta.env.PROD && !configured.startsWith("https://")) {
      throw new Error("VITE_API_BASE_URL must use HTTPS in production");
    }
    return configured.replace(/\/+$/, "");
  }
  // In local development we use Vite proxy to avoid CORS/port-mismatch issues.
  if (import.meta.env.DEV) return "";
  return "";
}

const API_BASE = resolveApiBase();

let authToken = localStorage.getItem("travel_log_token") || "";
let currentUserId = localStorage.getItem("travel_log_user_id") || "";

export function getAuthState() {
  return { token: authToken, userId: currentUserId };
}

export function setAuthState(token, userId) {
  authToken = token || "";
  currentUserId = userId || "";
  if (authToken) {
    localStorage.setItem("travel_log_token", authToken);
  } else {
    localStorage.removeItem("travel_log_token");
  }
  if (currentUserId) {
    localStorage.setItem("travel_log_user_id", currentUserId);
  } else {
    localStorage.removeItem("travel_log_user_id");
  }
}

export function clearAuthState() {
  setAuthState("", "");
}

async function request(path, options = {}) {
  if (!API_BASE && !import.meta.env.DEV) {
    throw new Error("Missing VITE_API_BASE_URL in this deployed frontend build");
  }

  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };
  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  const url = API_BASE ? `${API_BASE}${path}` : path;
  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(parseApiError(text) || `Request failed (${response.status})`);
  }

  if (response.status === 204) {
    return null;
  }
  return response.json();
}

function parseApiError(text) {
  if (!text) return "";
  try {
    const parsed = JSON.parse(text);
    if (typeof parsed.detail === "string") return parsed.detail;
    if (Array.isArray(parsed.detail)) {
      return parsed.detail.map((item) => item.msg).filter(Boolean).join("\n");
    }
  } catch (_err) {
    return text;
  }
  return text;
}

export async function login(payload) {
  const data = await request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  setAuthState(data.token, data.user_id);
  return data;
}

export function logout() {
  return request("/api/auth/logout", { method: "POST" });
}

export async function register(payload) {
  const data = await request("/api/auth/register", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  setAuthState(data.token, data.user_id);
  return data;
}

export function fetchMe() {
  return request("/api/auth/me");
}

export function updateMyProfile(payload) {
  return request("/api/auth/me", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function resetPassword(payload) {
  return request("/api/auth/reset-password", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function requestPasswordReset(payload) {
  return request("/api/auth/request-password-reset", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function fetchTrips(query = "") {
  const suffix = query ? `?q=${encodeURIComponent(query)}` : "";
  return request(`/api/trips${suffix}`);
}

export function createTrip(payload) {
  return request("/api/trips", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateTrip(id, payload) {
  return request(`/api/trips/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function deleteTrip(id) {
  return request(`/api/trips/${id}`, { method: "DELETE" });
}

export function fetchPeopleProfiles() {
  return request("/api/people");
}

export function createPeopleProfile(payload) {
  return request("/api/people", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updatePeopleProfile(id, payload) {
  return request(`/api/people/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function deletePeopleProfile(id) {
  return request(`/api/people/${id}`, { method: "DELETE" });
}

export function reorderPeopleProfiles(orderedIds) {
  return request("/api/people/reorder", {
    method: "PUT",
    body: JSON.stringify({ ordered_ids: orderedIds }),
  });
}

export function fetchPackingTemplates() {
  return request("/api/packing-templates");
}

export function createPackingTemplate(payload) {
  return request("/api/packing-templates", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updatePackingTemplate(id, payload) {
  return request(`/api/packing-templates/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function deletePackingTemplate(id) {
  return request(`/api/packing-templates/${id}`, { method: "DELETE" });
}

export function searchPlaces(query, limit = 8, options = {}) {
  const params = new URLSearchParams({
    q: query.trim(),
    limit: String(limit),
  });
  return request(`/api/locations/search?${params.toString()}`, {
    signal: options.signal,
  });
}
