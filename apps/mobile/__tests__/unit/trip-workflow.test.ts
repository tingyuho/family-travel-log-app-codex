import { createElement, useState, type ComponentProps } from "react";
import { Text, TextInput } from "react-native";
import type { Trip } from "../../api";
import TripsScreen from "../../screens/TripsScreen";
import { emptyTripDraft, emptyAccommodation, emptyItinerary } from "../../forms";
import { isInvalidDateRange, normalizeText } from "../../utils";

const { act, create } = require("react-test-renderer");
jest.mock("react-native-safe-area-context", () => ({ SafeAreaView: require("react-native").View }));
jest.useRealTimers();

const trip: Trip = {
  id: 1, title: "Family holiday", trip_kind: "past", start_date: "2026-05-01", end_date: "2026-05-03",
  notes: "", route: [], people: [], accommodations: [], itinerary: [], version: 1, created_at: "", updated_at: "",
};
const toggle = jest.fn();
const save = jest.fn(async () => trip);

function Field({ label, value, onChangeText }: { label: string; value: string; onChangeText: (value: string) => void }) {
  return createElement(TextInput, { accessibilityLabel: label, value, onChangeText });
}
function SegmentButton({ label, onPress }: { label: string; onPress: () => void }) {
  return createElement(Text, { onPress }, label);
}
function Harness({ editing = false }: { editing?: boolean }) {
  const [draft, setDraft] = useState({ ...emptyTripDraft, title: "New holiday", start_date: trip.start_date!, end_date: trip.end_date! });
  const props: ComponentProps<typeof TripsScreen> = {
    styles: {}, Field, SegmentButton, tripEditingId: editing ? 1 : null,
    tripDraft: draft, setTripDraft: setDraft, tripSearch: "", setTripSearch: jest.fn(),
    tripFilterKind: "all", setTripFilterKind: jest.fn(), tripSort: "date_desc", setTripSort: jest.fn(),
    people: [], tripPeopleFilter: [], setTripPeopleFilter: jest.fn(), normalizeText,
    routeQuery: "", setRouteQuery: jest.fn(), routeSearching: false, routeSuggestions: [],
    appendRouteSuggestion: jest.fn(), removeRouteStop: jest.fn(), emptyAccommodation, emptyItinerary,
    handleSaveTrip: save, resetTripEditor: jest.fn(), isInvalidDateRange,
    allTrips: [trip], displayedTrips: [trip], selectedTripIds: [], toggleTripSelection: toggle,
    clearTripSelections: jest.fn(), formatDateRange: (start, end) => `${start} – ${end}`,
    startTripEdit: jest.fn(), viewSelectedTripsOnMap: jest.fn(), openMapForTrip: jest.fn(),
    openGoogleCalendarForTrip: jest.fn(), confirmDeleteTrip: jest.fn(), saveQuickStopToTrip: jest.fn(),
    tripFormValidation: { accommodationNameByIndex: {}, accommodationDateByIndex: {}, itineraryByIndex: {}, itineraryDateByIndex: {} },
  };
  return createElement(TripsScreen, props);
}
function content(screen: ReturnType<typeof create>) {
  return screen.root.findAllByType(Text).map((node: { props: { children: unknown } }) => node.props.children).flat().join(" ");
}

test("a normal card tap opens details; selection requires Select", async () => {
  let screen: ReturnType<typeof create>;
  await act(async () => { screen = create(createElement(Harness)); });
  try {
    await act(async () => screen.root.findByProps({ accessibilityLabel: "Open Family holiday" }).props.onPress());
    expect(content(screen)).toContain("Trip Details");
    expect(toggle).not.toHaveBeenCalled();
    await act(async () => screen.root.findByProps({ accessibilityLabel: "Back to trips list" }).props.onPress());
    await act(async () => screen.root.findByProps({ accessibilityLabel: "Select trips for map" }).props.onPress());
    await act(async () => screen.root.findByProps({ accessibilityLabel: "Select Family holiday" }).props.onPress());
    expect(toggle).toHaveBeenCalledWith(1);
  } finally { await act(async () => screen.unmount()); }
}, 30000);

test("changing to Wishlist preserves dates and saving opens the saved trip details", async () => {
  let screen: ReturnType<typeof create>;
  await act(async () => { screen = create(createElement(Harness, { editing: true })); });
  try {
    await act(async () => screen.root.findAllByType(SegmentButton).find((node: { props: { label: string } }) => node.props.label === "Wishlist").props.onPress());
    expect(content(screen)).toContain("2026-05-01");
    expect(content(screen)).toContain("2026-05-03");
    await act(async () => screen.root.findByProps({ accessibilityLabel: "Save trip changes" }).props.onPress());
    expect(save).toHaveBeenCalledTimes(1);
    expect(content(screen)).toContain("Trip Details");
    expect(content(screen)).toContain(trip.title);
  } finally { await act(async () => screen.unmount()); }
}, 30000);

test("Add Stop from the library asks for a trip instead of silently choosing an old one", async () => {
  let screen: ReturnType<typeof create>;
  await act(async () => { screen = create(createElement(Harness)); });
  try {
    await act(async () => screen.root.findByProps({ accessibilityLabel: "Quick add a stop" }).props.onPress());
    expect(content(screen)).toContain("Choose a trip");
    expect(screen.root.findAllByProps({ testID: "quick-stop-trip-search" }).length).toBeGreaterThan(0);
  } finally { await act(async () => screen.unmount()); }
}, 30000);

test("trip sections keep itinerary, places, and stays reachable", async () => {
  let screen: ReturnType<typeof create>;
  await act(async () => { screen = create(createElement(Harness)); });
  try {
    await act(async () => screen.root.findByProps({ accessibilityLabel: "Open Family holiday" }).props.onPress());
    expect(content(screen)).toContain("No itinerary items saved.");
    await act(async () => screen.root.findByProps({ accessibilityLabel: "Show trip places" }).props.onPress());
    expect(content(screen)).toContain("No route stops saved.");
    expect(content(screen)).not.toContain("No itinerary items saved.");
    await act(async () => screen.root.findByProps({ accessibilityLabel: "Show trip stays" }).props.onPress());
    expect(content(screen)).toContain("No accommodations saved.");
    await act(async () => screen.root.findByProps({ accessibilityLabel: "Show trip itinerary" }).props.onPress());
    expect(content(screen)).toContain("No itinerary items saved.");
  } finally { await act(async () => screen.unmount()); }
}, 30000);
