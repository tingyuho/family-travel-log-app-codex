const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
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

export function deletePeopleProfile(id) {
  return request(`/api/people/${id}`, { method: "DELETE" });
}
