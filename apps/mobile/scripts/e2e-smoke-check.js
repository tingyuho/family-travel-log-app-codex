const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");

const requiredFiles = [
  "App.tsx",
  "api.ts",
  "featureFlags.ts",
  "openapi.snapshot.json",
  "e2e/maestro/smoke.yaml",
];

const missing = requiredFiles.filter((file) => !fs.existsSync(path.join(projectRoot, file)));

if (missing.length) {
  console.error("Missing required smoke files:");
  missing.forEach((file) => console.error(`- ${file}`));
  process.exit(1);
}

console.log("Smoke scaffold check passed.");
console.log("Next step: run Maestro smoke flow on a dev build.");
console.log("Example:");
console.log("  maestro test apps/mobile/e2e/maestro/smoke.yaml");
