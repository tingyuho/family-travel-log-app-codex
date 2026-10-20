import { createElement, type ComponentProps } from "react";
import { Text } from "react-native";
import type { Trip } from "../../api";
import MapScreen from "../../screens/MapScreen";

const { act, create } = require("react-test-renderer");

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 34, left: 0 }),
}));
jest.mock("react-native-maps", () => ({}));
jest.useRealTimers();

const pastTrip: Trip = {
  id: 1, title: "Past family holiday", trip_kind: "past", notes: "",
  route: [{ lat: 45, lng: -122, label: "Museum" }],
  people: [], accommodations: [], itinerary: [],
  version: 1, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
};
const wishlistTrip: Trip = { ...pastTrip, id: 2, title: "Future holiday", trip_kind: "wishlist" };

function props(overrides: Partial<ComponentProps<typeof MapScreen>> = {}): ComponentProps<typeof MapScreen> {
  return {
    styles: {}, trips: [pastTrip], selectedTrip: pastTrip, selectedTripId: 1,
    selectedTripCount: 0, selectedStopLabel: "", tripFilterKind: "all",
    setTripFilterKind: jest.fn(), onSelectTrip: jest.fn(),
    formatDateRange: () => "April 2026", openTrips: jest.fn(), ...overrides,
  };
}

function textContent(screen: ReturnType<typeof create>) {
  return screen.root.findAllByType(Text).map((node: { props: { children: unknown } }) => node.props.children).flat().join(" ");
}

test("switching to an empty Wishlist removes the old trip card and keeps the message inside the canvas", async () => {
  const setTripFilterKind = jest.fn();
  let screen: ReturnType<typeof create>;
  await act(async () => { screen = create(createElement(MapScreen, props({ setTripFilterKind }))); });
  try {
    expect(textContent(screen)).toContain(pastTrip.title);
    await act(async () => {
      screen.root.findByProps({ accessibilityLabel: "Show wishlist trips on map" }).props.onPress();
    });
    expect(setTripFilterKind).toHaveBeenCalledWith("wishlist");
    // The parent supplies filtered results; stale focus must never leak into the sheet.
    await act(async () => { screen.update(createElement(MapScreen, props({ trips: [], tripFilterKind: "wishlist" }))); });
    expect(textContent(screen)).toContain("No wishlist trips to display");
    expect(textContent(screen)).not.toContain(pastTrip.title);
    expect(screen.root.findAllByProps({ accessibilityLabel: "Expand map details" })).toHaveLength(0);
    const canvas = screen.root.findByProps({ testID: "map-canvas" });
    expect(canvas.findAllByProps({ testID: "map-empty-state" }).length).toBeGreaterThan(0);
    expect(canvas.findAllByProps({ testID: "map-controls" })).toHaveLength(0);
  } finally { await act(async () => screen.unmount()); }
}, 30000);

test("Wishlist with mapped trips cannot show a focused past trip", async () => {
  let screen: ReturnType<typeof create>;
  await act(async () => { screen = create(createElement(MapScreen, props({ trips: [wishlistTrip], tripFilterKind: "wishlist" }))); });
  try {
    expect(textContent(screen)).not.toContain(pastTrip.title);
    expect(textContent(screen)).toContain("No trip focused");
    expect(screen.root.findAllByProps({ testID: "map-empty-state" })).toHaveLength(0);
  } finally { await act(async () => screen.unmount()); }
}, 30000);

test("saved trips without route stops show guidance without an overlapping details sheet", async () => {
  const trip = { ...pastTrip, route: [] };
  let screen: ReturnType<typeof create>;
  await act(async () => { screen = create(createElement(MapScreen, props({ trips: [trip], selectedTrip: trip }))); });
  try {
    expect(textContent(screen)).toContain("These trips don't have map stops yet");
    expect(textContent(screen)).toContain("Add a place in a trip's Route step");
    expect(screen.root.findAllByProps({ accessibilityLabel: "Expand map details" })).toHaveLength(0);
  } finally { await act(async () => screen.unmount()); }
}, 30000);
