import type { Trip } from "../../api";
import { filterTripPickerOptions, tripPickerDateLabel } from "../../tripPicker";

function trip(id: number, title = `Trip ${id}`, start = "2026-05-01"): Trip {
  return {
    id, version: 1, title, start_date: start, end_date: start, trip_kind: "past",
    notes: "", route: [], people: [], accommodations: [], itinerary: [],
    created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
  };
}
const formatDates = (start?: string | null, end?: string | null) => `${start} to ${end}`;

describe("quick stop trip picker", () => {
  const trips = [...Array.from({ length: 499 }, (_, index) => trip(index + 1)), trip(500, "Taiwan family holiday", "2020-08-12")];

  test("keeps the initial picker short with hundreds of saved trips", () => {
    expect(filterTripPickerOptions(trips, "", false, formatDates).map((item) => item.id)).toEqual([1, 2, 3, 4, 5]);
    expect(filterTripPickerOptions(trips, "   ", false, formatDates)).toHaveLength(5);
  });

  test("finds an older trip outside the recent list without Show all", () => {
    expect(filterTripPickerOptions(trips, "  TAIWAN  holiday ", false, formatDates).map((item) => item.id)).toEqual([500]);
    expect(filterTripPickerOptions(trips, "2020-08", false, formatDates).map((item) => item.id)).toEqual([500]);
  });

  test("searches the displayed date wording and distinguishes repeated trip names", () => {
    const repeated = [trip(1, "Family vacation", "2025-06-01"), trip(2, "Family vacation", "2026-05-01")];
    expect(filterTripPickerOptions(repeated, "vacation 2025", false, formatDates).map((item) => item.id)).toEqual([1]);
    expect(filterTripPickerOptions(repeated, "May", false, () => "May 2026")).toHaveLength(2);
  });

  test("shows all on request, handles no matches, and preserves the supplied trip order", () => {
    const originalIds = trips.map((item) => item.id);
    expect(filterTripPickerOptions(trips, "", true, formatDates)).toHaveLength(500);
    expect(filterTripPickerOptions(trips, "missing destination", true, formatDates)).toEqual([]);
    expect(filterTripPickerOptions([], "", false, formatDates)).toEqual([]);
    expect(trips.map((item) => item.id)).toEqual(originalIds);
  });

  test("describes undated trips without inventing dates", () => {
    const undated = { ...trip(1), start_date: null, end_date: null };
    expect(tripPickerDateLabel(undated, formatDates)).toBe("Dates not set");
    expect(tripPickerDateLabel({ ...undated, trip_kind: "wishlist" }, formatDates)).toBe("Wishlist · dates not set");
  });
});
