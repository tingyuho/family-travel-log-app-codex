import { createElement } from "react";
import type { Trip } from "../../api";
import QuickStopTripPicker from "../../components/QuickStopTripPicker";

const { act, create } = require("react-test-renderer");

jest.mock("react-native-safe-area-context", () => ({ SafeAreaView: require("react-native").View }));
jest.useRealTimers();

test("a user can search for and select an older trip without expanding the recent list", async () => {
  const trips: Trip[] = Array.from({ length: 500 }, (_, index) => ({
    id: index + 1,
    title: index === 499 ? "Taiwan holiday" : `Recent trip ${index + 1}`,
    trip_kind: "past",
    start_date: index === 499 ? "2020-08-12" : "2026-05-01",
    end_date: null,
    notes: "", route: [], people: [], accommodations: [], itinerary: [],
    version: 1, created_at: "2020-01-01T00:00:00Z", updated_at: "2020-01-01T00:00:00Z",
  }));
  const onSelect = jest.fn();
  const onClose = jest.fn();
  let screen: ReturnType<typeof create>;
  await act(async () => {
    screen = create(createElement(QuickStopTripPicker, {
      trips, selectedTripId: 1, onSelect, onClose,
      formatDateRange: (start) => start || "No date",
    }));
  });
  try {
    expect(screen.root.findAllByProps({ testID: "quick-stop-trip-500" })).toHaveLength(0);
    await act(async () => {
      screen.root.findByProps({ testID: "quick-stop-trip-search" }).props.onChangeText("Taiwan");
    });
    await act(async () => {
      screen.root.findByProps({ testID: "quick-stop-trip-500" }).props.onPress();
    });
    expect(onSelect).toHaveBeenCalledWith(trips[499]);
    expect(onClose).not.toHaveBeenCalled();
    onSelect.mockClear();
    await act(async () => {
      screen.root.findByProps({ accessibilityLabel: "Close trip picker" }).props.onPress();
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
  } finally {
    await act(async () => screen.unmount());
  }
}, 30000);
