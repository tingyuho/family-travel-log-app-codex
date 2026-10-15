import assert from "node:assert/strict";
import test from "node:test";

import {
  cleanAccommodationRows,
  cleanItineraryRows,
  parseItemsText,
  parseRoute,
  reorderByIds,
  sortTrips,
} from "../src/lib/tripUtils.js";

test("parseRoute parses route lines and labels", () => {
  assert.deepEqual(parseRoute("47.6062,-122.3321,Seattle\n45.5152,-122.6784,Portland"), [
    { lat: 47.6062, lng: -122.3321, label: "Seattle", order: 0 },
    { lat: 45.5152, lng: -122.6784, label: "Portland", order: 1 },
  ]);
});

test("parseRoute rejects malformed coordinates", () => {
  assert.throws(() => parseRoute("hello,-122,Somewhere"), /Invalid route line/);
});

test("packing items trim and de-duplicate case-insensitively", () => {
  assert.deepEqual(parseItemsText("Hat\n hat \nSunscreen\n"), ["Hat", "Sunscreen"]);
});

test("trip sort keeps undated trips last for newest sort", () => {
  const sorted = sortTrips([
    { id: 1, title: "No date", start_date: "" },
    { id: 2, title: "Older", start_date: "2025-01-01" },
    { id: 3, title: "Newer", start_date: "2026-01-01" },
  ], "date_desc");
  assert.deepEqual(sorted.map((trip) => trip.title), ["Newer", "Older", "No date"]);
});

test("row cleaners drop empty rows and preserve valid data", () => {
  assert.deepEqual(cleanAccommodationRows([
    { name: " Hotel ", location: " City ", check_in: "", check_out: "", notes: "" },
    { name: "", location: "", check_in: "", check_out: "", notes: "" },
  ]), [{ name: "Hotel", location: "City", check_in: null, check_out: null, notes: "" }]);

  assert.deepEqual(cleanItineraryRows([
    { date: "2026-01-01", time: "09:00", activity: " Museum ", location: "", notes: "" },
    { date: "2026-01-02", time: "", activity: "", location: "Park", notes: "" },
  ]), [{ date: "2026-01-01", time: "09:00", activity: "Museum", location: "", notes: "" }]);
});

test("reorderByIds returns sorted order values", () => {
  const reordered = reorderByIds([{ id: 1 }, { id: 2 }, { id: 3 }], 3, 1);
  assert.deepEqual(reordered.map((item) => [item.id, item.sort_order]), [[3, 1], [1, 2], [2, 3]]);
});
