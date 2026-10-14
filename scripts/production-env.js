const net = require("node:net");

function normalizePublicHttpsUrl(value, variableName) {
  const raw = String(value || "").trim();
  if (!raw) throw new Error(`${variableName} is required for production builds.`);

  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`${variableName} must be a valid absolute URL.`);
  }
  if (parsed.protocol !== "https:") throw new Error(`${variableName} must use HTTPS in production.`);
  if (parsed.username || parsed.password) throw new Error(`${variableName} must not contain credentials.`);
  if (isLocalOrPrivateHostname(parsed.hostname)) {
    throw new Error(`${variableName} must not point to localhost or a private network address.`);
  }
  if (parsed.pathname !== "/" || parsed.search || parsed.hash) {
    throw new Error(`${variableName} must be an origin only (for example, https://api.example.com).`);
  }
  return parsed.origin;
}

function isLocalOrPrivateHostname(hostname) {
  const host = String(hostname || "").toLowerCase().replace(/^\[|\]$/g, "");
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return true;
  const ipVersion = net.isIP(host);
  if (ipVersion === 4) {
    const [a, b] = host.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 ||
      (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  if (ipVersion === 6) {
    return host === "::1" || host === "::" || host.startsWith("fc") || host.startsWith("fd") ||
      host.startsWith("fe8") || host.startsWith("fe9") || host.startsWith("fea") || host.startsWith("feb");
  }
  return false;
}

module.exports = { isLocalOrPrivateHostname, normalizePublicHttpsUrl };
