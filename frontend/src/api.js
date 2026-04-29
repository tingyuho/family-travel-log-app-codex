function resolveApiBase() {
  const configured = (import.meta.env.VITE_API_BASE_URL || "").trim();
  if (configured) return configured.replace(/\/+$/, "");
  if (import.meta.env.DEV) return "http://127.0.0.1:8000";
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
  if (!API_BASE) {
    throw new Error("Missing VITE_API_BASE_URL in this deployed frontend build");
  }

  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };
  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed (${response.status})`);
  }

  if (response.status === 204) {
    return null;
  }
  return response.json();
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
