const { spawnSync } = require("node:child_process");

const isWindows = process.platform === "win32";
const npm = isWindows ? "npm.cmd" : "npm";
const npx = isWindows ? "npx.cmd" : "npx";
const releaseApiBaseUrl = process.env.RELEASE_CHECK_API_BASE_URL || "https://api.example.invalid";

const steps = [
  { label: "Repository secret scan", command: process.execPath, args: ["scripts/check-repository-secrets.js"] },
  { label: "Web production build", command: npm, args: ["run", "web:build"], env: { VITE_API_BASE_URL: releaseApiBaseUrl } },
  { label: "Web unit tests", command: npm, args: ["run", "web:test"] },
  { label: "Mobile TypeScript", command: npx, args: ["tsc", "--noEmit", "--project", "apps/mobile/tsconfig.json"] },
  { label: "Mobile unit tests", command: npm, args: ["run", "mobile:test:unit"] },
  { label: "Mobile API integration tests", command: npm, args: ["run", "mobile:test:integration"] },
  { label: "Mobile backend contract", command: npm, args: ["run", "mobile:test:contract"] },
  { label: "Mobile smoke scaffold", command: npm, args: ["run", "mobile:test:e2e:smoke"] },
  { label: "iOS release configuration preflight", command: process.execPath, args: ["scripts/ios-release-preflight.js"] },
  {
    label: "Mobile production iOS bundle export",
    command: npm,
    args: ["run", "mobile:export:ios"],
    env: {
      APP_ENV: "production",
      EAS_BUILD_PROFILE: "production",
      EXPO_PUBLIC_API_BASE_URL: releaseApiBaseUrl,
    },
  },
  {
    label: "Production artifact URL scan",
    command: process.execPath,
    args: ["scripts/scan-production-artifacts.js"],
    env: { EXPECTED_PUBLIC_API_BASE_URL: releaseApiBaseUrl },
  },
  { label: "Backend compile/import check", command: npm, args: ["run", "backend:check"] },
  { label: "Backend pytest", command: npm, args: ["run", "backend:test"] },
  { label: "Backend API smoke", command: npm, args: ["run", "backend:smoke"] },
];

for (const { label, command, args, env = {} } of steps) {
  console.log(`\n==> ${label}`);
  const options = { stdio: "inherit", env: { ...process.env, ...env } };
  const result = isWindows
    ? spawnSync([command, ...args].map(quoteWindowsArg).join(" "), { ...options, shell: true })
    : spawnSync(command, args, { ...options, shell: false });
  if (result.error) {
    console.error(`Failed to start ${label}: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`${label} failed with exit code ${result.status}.`);
    process.exit(result.status || 1);
  }
}

console.log("\nRelease confidence check passed.");

function quoteWindowsArg(value) {
  if (/^[A-Za-z0-9_./:\\-]+$/.test(value)) return value;
  return `"${value.replace(/"/g, '\\"')}"`;
}
