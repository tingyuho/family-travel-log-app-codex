const fs = require("node:fs");
const path = require("node:path");
const { normalizePublicHttpsUrl } = require("./production-env");

const root = path.resolve(__dirname, "..");
const expectedApiBaseUrl = normalizePublicHttpsUrl(
  process.env.EXPECTED_PUBLIC_API_BASE_URL,
  "EXPECTED_PUBLIC_API_BASE_URL"
);
const targets = [
  path.join(root, "apps", "web", "dist"),
  path.join(root, "apps", "mobile", ".expo-export-check", "ios"),
];
const unsafeUrlPatterns = [
  /https?:\\?\/\\?\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0)(?=[:/\\"'])/gi,
  /https?:\\?\/\\?\/10\.\d{1,3}\.\d{1,3}\.\d{1,3}(?=[:/\\"'])/g,
  /https?:\\?\/\\?\/192\.168\.\d{1,3}\.\d{1,3}(?=[:/\\"'])/g,
  /https?:\\?\/\\?\/172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}(?=[:/\\"'])/g,
];

let expectedUrlFound = false;
const violations = [];

for (const target of targets) {
  if (!fs.existsSync(target)) throw new Error(`Production artifact directory is missing: ${target}`);
  for (const file of walk(target)) {
    const buffer = fs.readFileSync(file);
    if (buffer.includes(0)) continue;
    const content = buffer.toString("utf8");
    if (content.includes(expectedApiBaseUrl)) expectedUrlFound = true;
    for (const pattern of unsafeUrlPatterns) {
      for (const match of content.matchAll(pattern)) {
        violations.push(`${path.relative(root, file)}: ${match[0]}`);
      }
    }
  }
}

if (!expectedUrlFound) violations.push(`Expected API origin was not embedded: ${expectedApiBaseUrl}`);
if (violations.length) {
  throw new Error(`Unsafe production artifact configuration:\n- ${violations.join("\n- ")}`);
}
console.log(`Production artifacts use ${expectedApiBaseUrl} and contain no local/private API URLs.`);

function* walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) yield* walk(fullPath);
    else if (entry.isFile()) yield fullPath;
  }
}
