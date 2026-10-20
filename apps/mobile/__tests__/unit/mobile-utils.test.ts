import { buildMapClusters, buildHeatCells } from "../../mapLayers";
import { getPersonTravelHistory, groupTripsByTimeline } from "../../travelInsights";
import type { Trip } from "../../api";
import {
  addDaysToDateString,
  buildTripPayload,
  getRouteTextError,
  getTripValidationSummary,
  getStayNightCount,
  hasTripDraftContent,
  hasTripValidationErrors,
  isInvalidDateRange,
  isIsoDateString,
  parseItems,
  parseRouteText,
  sortTrips,
  validateTripDraft,
} from "../../utils";

describe("mobile utils", () => {
  test("parseItems trims and de-duplicates items case-insensitively", () => {
    const items = parseItems(" Passport \npassport\nCharger\n");
    expect(items).toEqual(["Passport", "Charger"]);
  });

  test("parseRouteText parses valid lines", () => {
    const route = parseRouteText("37.7749,-122.4194,San Francisco\n34.0522,-118.2437,Los Angeles");
    expect(route).toHaveLength(2);
    expect(route[0]).toMatchObject({
      lat: 37.7749,
      lng: -122.4194,
      label: "San Francisco",
      order: 0,
    });
  });

  test("parseRouteText throws for malformed lines", () => {
    expect(() => parseRouteText("not-a-lat,-122.4,Oops")).toThrow("Invalid route line");
  });

  test("getRouteTextError keeps empty and valid route text quiet", () => {
    expect(getRouteTextError("")).toBe("");
    expect(getRouteTextError("37.7749,-122.4194,San Francisco")).toBe("");
    expect(getRouteTextError("not-a-lat,-122.4,Oops")).toContain("Invalid route line");
  });

  test("isInvalidDateRange catches reversed dates", () => {
    expect(isInvalidDateRange("2026-05-20", "2026-05-19")).toBe(true);
    expect(isInvalidDateRange("2026-05-19", "2026-05-20")).toBe(false);
  });

  test("date helpers validate stay dates and count nights", () => {
    expect(isIsoDateString("2026-02-28")).toBe(true);
    expect(isIsoDateString("2026-02-30")).toBe(false);
    expect(addDaysToDateString("2026-02-28", 1)).toBe("2026-03-01");
    expect(getStayNightCount("2026-05-01", "2026-05-04")).toBe(3);
    expect(getStayNightCount("2026-05-04", "2026-05-01")).toBeNull();
  });

  test("buildTripPayload preserves wishlist dates and strips empty rows", () => {
    const payload = buildTripPayload({
      title: "  Tahoe  ",
      trip_kind: "wishlist",
      start_date: "2026-06-01",
      end_date: "2026-06-10",
      notes: " summer ",
      route_text: "39.1,-120.0,Tahoe",
      selected_people: [" Alex ", "alex", "Sam"],
      accommodations: [{ name: " ", location: " ", check_in: "", check_out: "", notes: "" }],
      itinerary: [{ date: "", time: "", activity: "", location: "", notes: "" }],
    });

    expect(payload.title).toBe("Tahoe");
    expect(payload.start_date).toBe("2026-06-01");
    expect(payload.end_date).toBe("2026-06-10");
    expect(payload.people).toEqual(["Alex", "Sam"]);
    expect(payload.accommodations).toEqual([]);
    expect(payload.itinerary).toEqual([]);
  });

  test("validateTripDraft marks accommodation name and itinerary requirements", () => {
    const result = validateTripDraft({
      title: "Trip",
      trip_kind: "past",
      start_date: "2026-07-01",
      end_date: "2026-07-03",
      notes: "",
      route_text: "",
      selected_people: [],
      accommodations: [{ name: " ", location: "Lake", check_in: "", check_out: "", notes: "" }],
      itinerary: [{ date: "", time: "10:00", activity: "", location: "", notes: "" }],
    });

    expect(result.accommodationNameByIndex[0]).toContain("required");
    expect(result.itineraryByIndex[0]).toContain("date and activity");
    expect(hasTripValidationErrors(result)).toBe(true);
    expect(getTripValidationSummary(result)).toContain("stay name");
  });

  test("hasTripDraftContent detects meaningful unsaved trip edits", () => {
    expect(
      hasTripDraftContent({
        title: "",
        trip_kind: "past",
        start_date: "",
        end_date: "",
        notes: "",
        route_text: "",
        selected_people: [],
        accommodations: [{ name: "", location: "", check_in: "", check_out: "", notes: "" }],
        itinerary: [{ date: "", time: "", activity: "", location: "", notes: "" }],
      })
    ).toBe(false);

    expect(
      hasTripDraftContent({
        title: "",
        trip_kind: "past",
        start_date: "",
        end_date: "",
        notes: "quick reminder",
        route_text: "",
        selected_people: [],
        accommodations: [],
        itinerary: [],
      })
    ).toBe(true);
  });

  test("validateTripDraft marks malformed itinerary dates", () => {
    const result = validateTripDraft({
      title: "Trip",
      trip_kind: "past",
      start_date: "2026-07-01",
      end_date: "2026-07-03",
      notes: "",
      route_text: "",
      selected_people: [],
      accommodations: [],
      itinerary: [{ date: "07/02/2026", time: "Morning", activity: "Beach", location: "", notes: "" }],
    });

    expect(result.itineraryDateByIndex[0]).toContain("YYYY-MM-DD");
  });

  test("validateTripDraft marks reversed or malformed accommodation dates", () => {
    const result = validateTripDraft({
      title: "Trip",
      trip_kind: "past",
      start_date: "2026-07-01",
      end_date: "2026-07-03",
      notes: "",
      route_text: "",
      selected_people: [],
      accommodations: [
        { name: "Hotel", location: "", check_in: "2026-07-04", check_out: "2026-07-02", notes: "" },
        { name: "Cabin", location: "", check_in: "07/04/2026", check_out: "", notes: "" },
      ],
      itinerary: [],
    });

    expect(result.accommodationDateByIndex[0]).toContain("before check-in");
    expect(result.accommodationDateByIndex[1]).toContain("YYYY-MM-DD");
  });

  test("buildTripPayload throws for partial invalid rows", () => {
    expect(() =>
      buildTripPayload({
        title: "Trip",
        trip_kind: "past",
        start_date: "2026-07-01",
        end_date: "2026-07-03",
        notes: "",
        route_text: "",
        selected_people: [],
        accommodations: [{ name: "", location: "A", check_in: "", check_out: "", notes: "" }],
        itinerary: [],
      })
    ).toThrow("Accommodation 1 requires a name.");

    expect(() =>
      buildTripPayload({
        title: "Trip",
        trip_kind: "past",
        start_date: "2026-07-01",
        end_date: "2026-07-03",
        notes: "",
        route_text: "",
        selected_people: [],
        accommodations: [{ name: "Hotel", location: "", check_in: "2026-07-04", check_out: "2026-07-02", notes: "" }],
        itinerary: [],
      })
    ).toThrow("Accommodation 1 has invalid stay dates.");

    expect(() =>
      buildTripPayload({
        title: "Trip",
        trip_kind: "past",
        start_date: "2026-07-01",
        end_date: "2026-07-03",
        notes: "",
        route_text: "",
        selected_people: [],
        accommodations: [],
        itinerary: [{ date: "07/02/2026", time: "Morning", activity: "Beach", location: "", notes: "" }],
      })
    ).toThrow("Itinerary row 1 has an invalid date.");
  });

  test("sortTrips keeps undated trips at the end for date_desc", () => {
    const sorted = sortTrips(
      [
        {
          id: 1,
          title: "Undated",
          trip_kind: "wishlist",
          notes: "",
          route: [],
          people: [],
          accommodations: [],
          itinerary: [],
          version: 1, created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T00:00:00Z",
        },
        {
          id: 2,
          title: "Dated",
          trip_kind: "past",
          start_date: "2026-06-10",
          notes: "",
          route: [],
          people: [],
          accommodations: [],
          itinerary: [],
          version: 1, created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T00:00:00Z",
        },
      ],
      "date_desc"
    );

    expect(sorted[0].id).toBe(2);
    expect(sorted[1].id).toBe(1);
  });

  test("map layer builders return stable aggregates for larger data", () => {
    const points = Array.from({ length: 1200 }).map((_, i) => ({
      tripId: i % 6,
      tripKind: i % 2 ? ("past" as const) : ("wishlist" as const),
      tripTitle: `Trip ${i % 6}`,
      lat: 37 + (i % 20) * 0.01,
      lng: -122 + (i % 20) * 0.01,
      label: `Stop ${i}`,
      index: i,
    }));
    const region = {
      latitude: 37.5,
      longitude: -121.5,
      latitudeDelta: 8,
      longitudeDelta: 8,
    };

    const clusters = buildMapClusters(points, region);
    const heat = buildHeatCells(points, region);

    expect(clusters.length).toBeGreaterThan(0);
    expect(heat.length).toBeGreaterThan(0);
    expect(clusters.some((cluster) => cluster.count > 1)).toBe(true);
  });

  test("groupTripsByTimeline groups dated and undated trips", () => {
    const groups = groupTripsByTimeline([
      makeTrip({ id: 1, title: "May trip", start_date: "2026-05-08" }),
      makeTrip({ id: 2, title: "April trip", start_date: "2026-04-01" }),
      makeTrip({ id: 3, title: "Dream trip", trip_kind: "wishlist" }),
    ]);

    expect(groups.map((group) => group.title)).toEqual([
      "May 2026",
      "April 2026",
      "Wishlist / No date yet",
    ]);
    expect(groups[0].trips[0].title).toBe("May trip");
  });

  test("getPersonTravelHistory summarizes trips, stops, years, and companions", () => {
    const history = getPersonTravelHistory(
      {
        id: 1,
        name: "TingYu",
        relationship: "",
        notes: "",
        sort_order: 0,
        created_at: "",
      },
      [
        makeTrip({
          id: 1,
          title: "Cali",
          start_date: "2026-05-08",
          people: ["TingYu", "Frances"],
          route: [{ lat: 34.05, lng: -118.24, label: "Los Angeles", order: 0 }],
        }),
        makeTrip({
          id: 2,
          title: "Solo",
          start_date: "2026-05-01",
          people: ["Kayson"],
        }),
      ]
    );

    expect(history.trips).toHaveLength(1);
    expect(history.stops).toHaveLength(1);
    expect(history.years).toEqual(["2026"]);
    expect(history.companions).toEqual([{ name: "Frances", count: 1 }]);
    expect(history.recentTrip?.title).toBe("Cali");
  });
});

function makeTrip(overrides: Partial<Trip> = {}): Trip {
  return { ...baseTrip(), ...overrides };
}

function baseTrip(): Trip {
  return {
    id: 1,
    title: "Trip",
    trip_kind: "past" as const,
    start_date: null,
    end_date: null,
    notes: "",
    route: [],
    people: [],
    accommodations: [],
    itinerary: [],
    version: 1, created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}
