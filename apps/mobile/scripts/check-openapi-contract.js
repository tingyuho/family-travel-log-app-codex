const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");

const rootDir = join(__dirname, "..", "..", "..");
const snapshotPath = join(rootDir, "apps", "mobile", "openapi.snapshot.json");
const pythonPath = join(rootDir, "backend", ".venv", "Scripts", "python.exe");

function run() {
  let snapshot;
  try {
    snapshot = JSON.parse(readFileSync(snapshotPath, "utf8"));
  } catch (error) {
    console.error("Failed to read API contract snapshot:", error.message);
    process.exit(1);
  }

  const script = "import json; from backend.app.main import app; print(json.dumps(app.openapi(), separators=(',',':')))";
  const result = spawnSync(pythonPath, ["-c", script], {
    cwd: rootDir,
    encoding: "utf8",
  });

  if (result.error) {
    console.error("Unable to run backend OpenAPI export:", result.error.message);
    process.exit(1);
  }

  if (result.status !== 0) {
    console.error("Backend OpenAPI export failed:");
    console.error(result.stderr || result.stdout);
    process.exit(result.status || 1);
  }

  let current;
  try {
    current = JSON.parse(result.stdout.trim());
  } catch (error) {
    console.error("Backend OpenAPI output was not valid JSON:", error.message);
    process.exit(1);
  }

  const snapshotText = JSON.stringify(snapshot);
  const currentText = JSON.stringify(current);
  if (snapshotText !== currentText) {
    console.error("OpenAPI contract drift detected. Run `npm run contract:snapshot --workspace @app/mobile`.");
    process.exit(1);
  }

  console.log("OpenAPI contract check passed.");
}

run();
