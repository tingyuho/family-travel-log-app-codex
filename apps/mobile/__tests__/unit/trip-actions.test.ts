import { createElement } from "react";
import { ApiError, addTripStop, createTrip, fetchTrips, updateTrip, type Trip } from "../../api";
import { emptyTripDraft } from "../../forms";
import { useTripActions } from "../../hooks/useTripActions";
jest.mock("../../api", () => ({ ...jest.requireActual("../../api"), addTripStop: jest.fn(), createTrip: jest.fn(), updateTrip: jest.fn(), fetchTrips: jest.fn() }));
const { act, create } = require("react-test-renderer");
jest.useRealTimers();
const trip: Trip = { id: 1, version: 3, title: "Saved trip", trip_kind: "past", notes: "", route: [], people: [], accommodations: [], itinerary: [], created_at: "", updated_at: "" };
let actions: ReturnType<typeof useTripActions>;
function Harness({ options }: { options: Parameters<typeof useTripActions>[0] }) { actions = useTripActions(options); return null; }
function makeOptions() {
  return { draft: { ...emptyTripDraft, version: 2, title: "My draft" }, editingId: null as number | null, setValidation: jest.fn(), resetEditor: jest.fn(), onSaved: jest.fn(), onStopSaved: jest.fn(), onError: jest.fn(), onNotice: jest.fn(), onBusy: jest.fn(), onConflict: jest.fn() };
}
test("save uses the saved response even when unrelated refresh endpoints are unavailable", async () => {
  const options = makeOptions();
  (createTrip as jest.Mock).mockResolvedValue(trip);
  (fetchTrips as jest.Mock).mockRejectedValue(new Error("Refresh unavailable"));
  let screen: ReturnType<typeof create>;
  await act(async () => { screen = create(createElement(Harness, { options })); });
  try {
    let result;
    await act(async () => { result = await actions.handleSaveTrip(); });
    expect(result).toEqual(trip);
    expect(options.onSaved).toHaveBeenCalledWith(trip);
    expect(options.resetEditor).toHaveBeenCalledTimes(1);
    expect(fetchTrips).not.toHaveBeenCalled();
  } finally { await act(async () => screen.unmount()); }
});
test("a conflict keeps the edit draft and offers review without resubmitting it", async () => {
  const options = { ...makeOptions(), editingId: 1 };
  (updateTrip as jest.Mock).mockRejectedValue(new ApiError("Trip changed", 409));
  let screen: ReturnType<typeof create>;
  await act(async () => { screen = create(createElement(Harness, { options })); });
  try {
    await act(async () => { expect(await actions.handleSaveTrip()).toBeNull(); });
    expect(updateTrip).toHaveBeenCalledWith(1, expect.objectContaining({ version: 2, title: "My draft" }));
    expect(options.resetEditor).not.toHaveBeenCalled();
    expect(options.onSaved).not.toHaveBeenCalled();
    expect(options.onConflict).toHaveBeenCalledWith(1);
    expect(updateTrip).toHaveBeenCalledTimes(1);
  } finally { await act(async () => screen.unmount()); }
});
test("stop save sends only the new stop, confirms success, and blocks duplicate taps", async () => {
  const options = makeOptions();
  let complete!: (trip: Trip) => void;
  (addTripStop as jest.Mock).mockImplementation(() => new Promise<Trip>((resolve) => { complete = resolve; }));
  let screen: ReturnType<typeof create>;
  await act(async () => { screen = create(createElement(Harness, { options })); });
  try {
    const input = { tripId: 1, place: { place_id: "museum", lat: "45.5", lon: "-122.6", display_name: "Museum, Portland" }, label: "Museum", notes: "Tickets" };
    let first: Promise<boolean>;
    await act(async () => {
      first = actions.handleQuickAddStop(input);
      expect(await actions.handleQuickAddStop(input)).toBe(false);
      complete(trip);
      expect(await first).toBe(true);
    });
    expect(addTripStop).toHaveBeenCalledTimes(1);
    expect(addTripStop).toHaveBeenCalledWith(1, expect.objectContaining({ point: { lat: 45.5, lng: -122.6, label: "Museum" } }));
    expect((addTripStop as jest.Mock).mock.calls[0][1]).not.toHaveProperty("title");
    expect(options.onStopSaved).toHaveBeenCalledWith(trip);
  } finally { await act(async () => screen.unmount()); }
});
