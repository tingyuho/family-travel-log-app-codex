import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

test("Vercel publishes only the production Vite output", () => {
  const config = readJson("vercel.json");
  assert.equal(config.buildCommand, "npm run web:build");
  assert.equal(config.outputDirectory, "apps/web/dist");
  assert.equal(config.framework, "vite");
});

test("Render provisions PostgreSQL and a database-backed health check", () => {
  const render = fs.readFileSync(path.join(root, "render.yaml"), "utf8");
  assert.match(render, /healthCheckPath: \/health\/db/);
  assert.match(render, /key: APP_ENV\s+value: production/);
  assert.match(render, /key: DATABASE_URL\s+fromDatabase:/);
  assert.match(render, /key: FRONTEND_ORIGINS\s+sync: false/);
  assert.match(render, /databases:\s+- name: family-travel-log-db/);
});

test("EAS production builds are store-distributed and auto-incremented", () => {
  const eas = readJson("apps/mobile/eas.json");
  assert.equal(eas.cli.appVersionSource, "remote");
  assert.deepEqual(eas.build.production, {
    environment: "production",
    distribution: "store",
    autoIncrement: true,
  });
  assert.ok(eas.submit.production.ios);
});

test("release automation workflows are checked in", () => {
  for (const file of ["release-confidence.yml", "verify-production.yml", "ios-production.yml"]) {
    assert.ok(fs.existsSync(path.join(root, ".github", "workflows", file)), `${file} is missing`);
  }
});

test("operations automation and runbook are checked in", () => {
  const monitor = fs.readFileSync(path.join(root, ".github", "workflows", "verify-production.yml"), "utf8");
  assert.match(monitor, /cron: "17 \* \* \* \*"/);
  assert.ok(fs.existsSync(path.join(root, ".github", "dependabot.yml")));
  assert.ok(fs.existsSync(path.join(root, "OPERATIONS.md")));
});

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}
