import {
  clearAuthState,
  fetchTrips,
  reorderPeopleProfiles,
  searchPlaces,
  setAuthState,
  updateMyProfile,
  updatePackingTemplate,
  updatePeopleProfile,
  updateTrip,
} from "../../api";

function mockJsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

describe("mobile api integration", () => {
  beforeEach(() => {
    clearAuthState();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global as any).fetch = jest.fn();
  });

  test("fetchTrips sends auth header when token exists", async () => {
    setAuthState("token-123", "alex");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global.fetch as any).mockResolvedValue(mockJsonResponse([]));
    await fetchTrips("beach");
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, options] = (global.fetch as jest.Mock).mock.calls[0];
    expect(String(url)).toContain("/api/trips?q=beach");
    expect(options.headers.Authorization).toBe("Bearer token-123");
  });

  test("update methods target the expected endpoints", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global.fetch as any)
      .mockResolvedValueOnce(mockJsonResponse({ user_id: "alex", email: "alex@example.com" }))
      .mockResolvedValueOnce(mockJsonResponse({ id: 7 }))
      .mockResolvedValueOnce(mockJsonResponse({ id: 2 }))
      .mockResolvedValueOnce(mockJsonResponse([]))
      .mockResolvedValueOnce(mockJsonResponse({ id: 5 }))
      .mockResolvedValueOnce(mockJsonResponse([]));

    await updateMyProfile({ email: "alex@example.com" });
    await updateTrip(7, {
      title: "Trip",
      trip_kind: "past",
      start_date: "2026-01-01",
      end_date: "2026-01-02",
      notes: "",
      route: [],
      people: [],
      accommodations: [],
      itinerary: [],
    });
    await updatePeopleProfile(2, { name: "Sam", relationship: "Sibling", notes: "" });
    await reorderPeopleProfiles([2, 1, 3]);
    await updatePackingTemplate(5, { name: "Camp", items: ["Tent"] });
    await searchPlaces("seattle");

    const urls = (global.fetch as jest.Mock).mock.calls.map((entry) => String(entry[0]));
    expect(urls).toEqual(
      expect.arrayContaining([
        expect.stringContaining("/api/auth/me"),
        expect.stringContaining("/api/trips/7"),
        expect.stringContaining("/api/people/2"),
        expect.stringContaining("/api/people/reorder"),
        expect.stringContaining("/api/packing-templates/5"),
        expect.stringContaining("/api/locations/search?q=seattle&limit=8"),
      ])
    );
  });

  test("error parser surfaces detail from backend payload", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global.fetch as any).mockResolvedValue(
      mockJsonResponse({ detail: "A profile with that name already exists" }, 409)
    );
    await expect(updatePeopleProfile(2, { name: "Sam", relationship: "", notes: "" })).rejects.toThrow(
      "A profile with that name already exists"
    );
  });

  test("fetchTrips does not retry normal backend validation errors", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global.fetch as any).mockResolvedValue(mockJsonResponse({ detail: "Invalid trip filter" }, 400));

    await expect(fetchTrips("bad")).rejects.toThrow("Invalid trip filter");
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
