const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const files = execFileSync("git", ["ls-files", "-co", "--exclude-standard", "-z"], {
  cwd: root,
  encoding: "utf8",
}).split("\0").filter(Boolean);
const forbiddenNames = new Set([".env", ".env.local", "credentials.json", "google-service-info.plist"]);
const forbiddenExtensions = new Set([".p12", ".p8", ".mobileprovision", ".keystore", ".jks"]);
const patterns = [
  ["private key", new RegExp(["-----BEGIN ", "(?:RSA |EC |OPENSSH )?PRIVATE KEY-----"].join(""))],
  ["Google API key", new RegExp(["AI", "za[0-9A-Za-z_-]{30,}"].join(""))],
  ["GitHub token", new RegExp(["gh", "[pousr]_[A-Za-z0-9]{30,}"].join(""))],
  ["AWS access key", new RegExp(["AK", "IA[0-9A-Z]{16}"].join(""))],
  ["Slack token", new RegExp(["xo", "x[baprs]-[0-9A-Za-z-]{20,}"].join(""))],
  ["Stripe live secret", new RegExp(["sk", "_live_[0-9A-Za-z]{20,}"].join(""))],
];
const violations = [];

for (const relativePath of files) {
  const normalized = relativePath.replaceAll("\\", "/");
  const basename = path.basename(normalized).toLowerCase();
  const extension = path.extname(basename).toLowerCase();
  if (forbiddenNames.has(basename) && !basename.endsWith(".example")) {
    violations.push(`${normalized}: sensitive configuration filename is tracked`);
    continue;
  }
  if (forbiddenExtensions.has(extension)) {
    violations.push(`${normalized}: signing/private-key artifact is tracked`);
    continue;
  }

  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) continue;
  const stats = fs.statSync(absolutePath);
  if (stats.size > 2_000_000) continue;
  const buffer = fs.readFileSync(absolutePath);
  if (buffer.includes(0)) continue;
  const content = buffer.toString("utf8");
  for (const [label, pattern] of patterns) {
    if (pattern.test(content)) violations.push(`${normalized}: possible ${label}`);
  }
}

if (violations.length) {
  console.error(`Repository secret scan failed:\n- ${violations.join("\n- ")}`);
  process.exit(1);
}
console.log(`Repository secret scan passed (${files.length} tracked/unignored files checked).`);
