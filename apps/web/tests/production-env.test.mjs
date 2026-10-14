import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { normalizePublicHttpsUrl } = require("../../../scripts/production-env");

test("accepts and normalizes a public HTTPS origin", () => {
  assert.equal(normalizePublicHttpsUrl(" https://api.example.com/ ", "API_URL"), "https://api.example.com");
});

for (const unsafeUrl of [
  "http://api.example.com",
  "https://localhost:8000",
  "https://127.0.0.1:8000",
  "https://192.168.4.48:8000",
  "https://10.0.0.2",
  "https://172.16.0.2",
]) {
  test(`rejects unsafe production URL ${unsafeUrl}`, () => {
    assert.throws(() => normalizePublicHttpsUrl(unsafeUrl, "API_URL"));
  });
}

test("rejects paths and credentials", () => {
  assert.throws(() => normalizePublicHttpsUrl("https://api.example.com/v1", "API_URL"));
  assert.throws(() => normalizePublicHttpsUrl("https://user:pass@api.example.com", "API_URL"));
});
