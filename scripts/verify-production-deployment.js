const { normalizePublicHttpsUrl } = require("./production-env");

const apiBaseUrl = normalizePublicHttpsUrl(
  process.env.PRODUCTION_API_BASE_URL,
  "PRODUCTION_API_BASE_URL"
);
const webBaseUrl = normalizePublicHttpsUrl(
  process.env.PRODUCTION_WEB_BASE_URL,
  "PRODUCTION_WEB_BASE_URL"
);
const timeoutMs = Number(process.env.PRODUCTION_VERIFY_TIMEOUT_MS || 15000);

async function main() {
  const healthResponse = await request(`${apiBaseUrl}/health`);
  const health = await readJson(healthResponse, `${apiBaseUrl}/health`);
  assertEqual(health.status, "ok", "/health status");
  if (!health.release) throw new Error("/health did not report a release identifier.");
  if (process.env.EXPECTED_RELEASE_SHA && !process.env.EXPECTED_RELEASE_SHA.startsWith(health.release)) {
    throw new Error(`/health release ${health.release} does not match EXPECTED_RELEASE_SHA.`);
  }
  if (!healthResponse.headers.get("x-request-id")) throw new Error("API response is missing X-Request-ID.");
  assertEqual(healthResponse.headers.get("x-content-type-options"), "nosniff", "API security header");

  const databaseHealth = await getJson(`${apiBaseUrl}/health/db`);
  assertEqual(databaseHealth.status, "ok", "/health/db status");
  assertEqual(databaseHealth.database, "postgres", "/health/db database");

  const openApi = await getJson(`${apiBaseUrl}/openapi.json`);
  if (!openApi.paths?.["/api/auth/login"] || !openApi.paths?.["/api/trips"]) {
    throw new Error("Production OpenAPI contract is missing required application endpoints.");
  }

  const webResponse = await request(webBaseUrl);
  const html = await webResponse.text();
  if (!html.includes('id="root"')) {
    throw new Error("Production web response does not look like the Family Travel Log Vite entry page.");
  }
  assertEqual(webResponse.headers.get("x-content-type-options"), "nosniff", "web security header");

  const corsResponse = await request(`${apiBaseUrl}/api/auth/login`, {
    method: "OPTIONS",
    headers: {
      Origin: webBaseUrl,
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "content-type,authorization",
    },
  });
  assertEqual(corsResponse.headers.get("access-control-allow-origin"), webBaseUrl, "CORS allow origin");

  console.log(`Production verification passed for ${webBaseUrl} -> ${apiBaseUrl} (release ${health.release}).`);
}

async function getJson(url) {
  const response = await request(url);
  return readJson(response, url);
}

async function readJson(response, url) {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) throw new Error(`${url} did not return JSON.`);
  return response.json();
}

async function request(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      headers: { "X-Request-ID": `production-verify-${Date.now()}`, ...(options.headers || {}) },
      redirect: "follow",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`${options.method || "GET"} ${url} returned HTTP ${response.status}.`);
    return response;
  } finally {
    clearTimeout(timer);
  }
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, received ${String(actual)}.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
