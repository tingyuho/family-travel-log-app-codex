import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Pressable, Text, View } from "react-native";

import { searchPlaces, type AccommodationInput, type ItineraryEventInput, type PersonProfile, type PlaceSuggestion, type Trip } from "../api";
import type { TripDraftForm, TripFilterKind } from "../forms";
import { getOrderedRoutePoints } from "../mapLayers";
import type { AppStyles, FieldComponent, SegmentButtonComponent, StateSetter } from "../screenTypes";
import { groupTripsByTimeline } from "../travelInsights";
import {
  addDaysToDateString,
  getRouteTextError,
  getStayNightCount,
  getTripValidationSummary,
  hasTripDraftContent,
  isIsoDateString,
  parseRouteLines,
  type TripFormValidation,
  type TripSort,
} from "../utils";

type TripEditorStep = "basic" | "people" | "route" | "stays" | "itinerary";
type TripsView = "list" | "new" | "edit" | "filters" | "details" | "quickAdd";
type TripListMode = "cards" | "timeline";
type BasicTripDateField = "start_date" | "end_date";
type FilterDraft = {
  search: string;
  kind: TripFilterKind;
  sort: TripSort;
  people: string[];
};

type TripsScreenProps = {
  styles: AppStyles;
  Field: FieldComponent;
  SegmentButton: SegmentButtonComponent;
  tripEditingId: number | null;
  tripDraft: TripDraftForm;
  setTripDraft: StateSetter<TripDraftForm>;
  tripSearch: string;
  setTripSearch: (value: string) => void;
  tripFilterKind: TripFilterKind;
  setTripFilterKind: (value: TripFilterKind) => void;
  tripSort: TripSort;
  setTripSort: (value: TripSort) => void;
  people: PersonProfile[];
  tripPeopleFilter: string[];
  setTripPeopleFilter: StateSetter<string[]>;
  normalizeText: (value: string) => string;
  routeQuery: string;
  setRouteQuery: (value: string) => void;
  routeSearching: boolean;
  routeSuggestions: PlaceSuggestion[];
  appendRouteSuggestion: (suggestion: PlaceSuggestion) => void;
  removeRouteStop: (index: number) => void;
  emptyAccommodation: () => AccommodationInput;
  emptyItinerary: () => ItineraryEventInput;
  handleSaveTrip: () => boolean | Promise<boolean>;
  resetTripEditor: () => void;
  isInvalidDateRange: (start?: string | null, end?: string | null) => boolean;
  allTrips: Trip[];
  displayedTrips: Trip[];
  selectedTripIds: number[];
  toggleTripSelection: (id: number) => void;
  clearTripSelections: () => void;
  formatDateRange: (start?: string | null, end?: string | null) => string;
  startTripEdit: (trip: Trip) => void;
  viewSelectedTripsOnMap: () => void;
  openMapForTrip: (trip: Trip) => void;
  openGoogleCalendarForTrip: (trip: Trip) => Promise<void>;
  confirmDeleteTrip: (id: number) => void | Promise<void>;
  saveQuickStopToTrip: (input: {
    tripId: number;
    place: PlaceSuggestion;
    label: string;
    notes: string;
  }) => Promise<boolean>;
  tripFormValidation: TripFormValidation;
  detailsTripId?: number | null;
  onDetailsTripOpened?: () => void;
};

type QuickStopDraft = {
  tripId: number | null;
  query: string;
  label: string;
  notes: string;
  place: PlaceSuggestion | null;
};

const editorSteps: Array<{ key: TripEditorStep; label: string }> = [
  { key: "basic", label: "Basic" },
  { key: "people", label: "People" },
  { key: "route", label: "Route" },
  { key: "stays", label: "Stays" },
  { key: "itinerary", label: "Itinerary" },
];

const sortOptions: Array<[TripSort, string]> = [
  ["date_desc", "Newest"],
  ["date_asc", "Oldest"],
  ["name_asc", "Name A-Z"],
  ["name_desc", "Name Z-A"],
];

const itineraryTimeOptions = [
  { label: "Morning", value: "09:00" },
  { label: "Lunch", value: "12:00" },
  { label: "Afternoon", value: "14:00" },
  { label: "Dinner", value: "18:00" },
  { label: "Evening", value: "20:00" },
];
const calendarWeekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function TripsScreen(props: TripsScreenProps) {
  const {
    styles,
    Field,
    SegmentButton,
    tripEditingId,
    tripDraft,
    setTripDraft,
    tripSearch,
    setTripSearch,
    tripFilterKind,
    setTripFilterKind,
    tripSort,
    setTripSort,
    people,
    tripPeopleFilter,
    setTripPeopleFilter,
    normalizeText,
    routeQuery,
    setRouteQuery,
    routeSearching,
    routeSuggestions,
    appendRouteSuggestion,
    removeRouteStop,
    emptyAccommodation,
    emptyItinerary,
    handleSaveTrip,
    resetTripEditor,
    isInvalidDateRange,
    allTrips,
    displayedTrips,
    selectedTripIds,
    toggleTripSelection,
    clearTripSelections,
    formatDateRange,
    startTripEdit,
    viewSelectedTripsOnMap,
    openMapForTrip,
    openGoogleCalendarForTrip,
    confirmDeleteTrip,
    saveQuickStopToTrip,
    tripFormValidation,
    detailsTripId,
    onDetailsTripOpened,
  } = props;

  const [tripsView, setTripsView] = useState<TripsView>("list");
  const [tripListMode, setTripListMode] = useState<TripListMode>("cards");
  const [expandedMoreTripId, setExpandedMoreTripId] = useState<number | null>(null);
  const [tripEditorStep, setTripEditorStep] = useState<TripEditorStep>("basic");
  const [showManualRouteEditor, setShowManualRouteEditor] = useState(false);
  const [detailTripId, setDetailTripId] = useState<number | null>(null);
  const [activeBasicDateField, setActiveBasicDateField] = useState<BasicTripDateField | null>(null);
  const [basicCalendarCursor, setBasicCalendarCursor] = useState(() =>
    getCalendarCursor(tripDraft.start_date || tripDraft.end_date || getTodayIsoDate())
  );
  const [filterDraft, setFilterDraft] = useState<FilterDraft>({
    search: tripSearch,
    kind: tripFilterKind,
    sort: tripSort,
    people: tripPeopleFilter,
  });
  const [quickStopDraft, setQuickStopDraft] = useState<QuickStopDraft>({
    tripId: null,
    query: "",
    label: "",
    notes: "",
    place: null,
  });
  const [quickStopSuggestions, setQuickStopSuggestions] = useState<PlaceSuggestion[]>([]);
  const [quickStopSearching, setQuickStopSearching] = useState(false);
  const [quickStopError, setQuickStopError] = useState("");
  const quickStopDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const routeStops = useMemo(() => parseRouteLines(tripDraft.route_text), [tripDraft.route_text]);
  const detailTrip = useMemo(
    () => (detailTripId ? allTrips.find((trip) => trip.id === detailTripId) || null : null),
    [detailTripId, allTrips]
  );
  const timelineGroups = useMemo(() => groupTripsByTimeline(displayedTrips), [displayedTrips]);
  const hasDraft = useMemo(() => hasTripDraftContent(tripDraft), [tripDraft]);
  const routeTextError = useMemo(() => getRouteTextError(tripDraft.route_text), [tripDraft.route_text]);

  const sortLabels: Record<TripSort, string> = {
    date_desc: "Date newest",
    date_asc: "Date oldest",
    name_asc: "Name A-Z",
    name_desc: "Name Z-A",
  };
  const activeFilterCount =
    (tripSearch.trim() ? 1 : 0) +
    (tripFilterKind !== "all" ? 1 : 0) +
    (tripSort !== "date_desc" ? 1 : 0) +
    (tripPeopleFilter.length ? 1 : 0);
  const peopleSummary =
    tripPeopleFilter.length > 2
      ? `${tripPeopleFilter.slice(0, 2).join(", ")} +${tripPeopleFilter.length - 2}`
      : tripPeopleFilter.join(", ");
  const filterSummary = [
    tripFilterKind === "all" ? "All trips" : tripFilterKind === "past" ? "Past trips" : "Wishlist trips",
    sortLabels[tripSort],
    peopleSummary || null,
    tripSearch.trim() ? `Search: ${tripSearch.trim()}` : null,
  ]
    .filter(Boolean)
    .join(" | ");
  const tripCountLabel =
    allTrips.length && displayedTrips.length !== allTrips.length
      ? `${displayedTrips.length} of ${allTrips.length} shown`
      : "";
  const visibleSelectedCount = displayedTrips.filter((trip) => selectedTripIds.includes(trip.id)).length;
  const selectedOutsideFilterCount = Math.max(selectedTripIds.length - visibleSelectedCount, 0);
  const draftFilterCount =
    (filterDraft.search.trim() ? 1 : 0) +
    (filterDraft.kind !== "all" ? 1 : 0) +
    (filterDraft.sort !== "date_desc" ? 1 : 0) +
    (filterDraft.people.length ? 1 : 0);
  const draftPeopleSummary =
    filterDraft.people.length > 2
      ? `${filterDraft.people.slice(0, 2).join(", ")} +${filterDraft.people.length - 2}`
      : filterDraft.people.join(", ");
  const draftFilterSummary = [
    filterDraft.kind === "all" ? "All trips" : filterDraft.kind === "past" ? "Past trips" : "Wishlist trips",
    sortLabels[filterDraft.sort],
    draftPeopleSummary || null,
    filterDraft.search.trim() ? `Search: ${filterDraft.search.trim()}` : null,
  ]
    .filter(Boolean)
    .join(" | ");
  const editorStatus = tripEditingId ? "Editing saved trip" : hasDraft ? "Unsaved trip in progress" : "Start a new trip";
  const dateRangeInvalid = isInvalidDateRange(tripDraft.start_date, tripDraft.end_date);
  const validationSummary = getTripValidationSummary(tripFormValidation);
  const canSaveTrip = Boolean(tripDraft.title.trim()) && !dateRangeInvalid && !validationSummary && !routeTextError;
  const activeBasicDateValue = activeBasicDateField ? tripDraft[activeBasicDateField] : "";
  const saveTripHint = !tripDraft.title.trim()
    ? "Add a trip title before saving to the shared database."
    : dateRangeInvalid
      ? "Fix the date range before saving to the shared database."
      : validationSummary
        ? validationSummary
        : routeTextError
          ? "Fix the route stops before saving."
          : "";
  useEffect(() => {
    if (tripEditingId) {
      setTripsView("edit");
      setTripEditorStep("basic");
    }
  }, [tripEditingId]);

  useEffect(() => {
    if (!detailsTripId) return;
    setDetailTripId(detailsTripId);
    setTripsView("details");
    onDetailsTripOpened?.();
  }, [detailsTripId, onDetailsTripOpened]);

  useEffect(() => {
    if (tripDraft.trip_kind !== "past") {
      setActiveBasicDateField(null);
    }
  }, [tripDraft.trip_kind]);

  useEffect(() => {
    if (!activeBasicDateField || !isIsoDateString(activeBasicDateValue)) return;
    setBasicCalendarCursor(getCalendarCursor(activeBasicDateValue));
  }, [activeBasicDateField, activeBasicDateValue]);

  useEffect(() => {
    if (quickStopDebounceRef.current) clearTimeout(quickStopDebounceRef.current);
    if (tripsView !== "quickAdd") return;

    const query = quickStopDraft.query.trim();
    if (query.length < 2 || quickStopDraft.place) {
      setQuickStopSuggestions([]);
      setQuickStopSearching(false);
      return;
    }

    quickStopDebounceRef.current = setTimeout(() => {
      void searchQuickStopPlaces(query);
    }, 350);

    return () => {
      if (quickStopDebounceRef.current) clearTimeout(quickStopDebounceRef.current);
    };
  }, [quickStopDraft.place, quickStopDraft.query, tripsView]);

  function clearAppliedFilters() {
    setTripSearch("");
    setTripFilterKind("all");
    setTripSort("date_desc");
    setTripPeopleFilter([]);
  }

  function openFilters() {
    setFilterDraft({
      search: tripSearch,
      kind: tripFilterKind,
      sort: tripSort,
      people: [...tripPeopleFilter],
    });
    setTripsView("filters");
  }

  function resetFilterDraft() {
    setFilterDraft({
      search: "",
      kind: "all",
      sort: "date_desc",
      people: [],
    });
  }

  function applyFilters() {
    setTripSearch(filterDraft.search);
    setTripFilterKind(filterDraft.kind);
    setTripSort(filterDraft.sort);
    setTripPeopleFilter([...filterDraft.people]);
    setTripsView("list");
  }

  function startNewTrip() {
    if (hasDraft || tripEditingId) {
      Alert.alert("Start new trip?", "This will discard the current unsaved trip form.", [
        { text: "Keep Editing", style: "cancel" },
        {
          text: "Discard and Start",
          style: "destructive",
          onPress: () => {
            resetTripEditor();
            setTripEditorStep("basic");
            setShowManualRouteEditor(false);
            setTripsView("new");
          },
        },
      ]);
      return;
    }
    resetTripEditor();
    setTripEditorStep("basic");
    setShowManualRouteEditor(false);
    setTripsView("new");
  }

  function openQuickStop() {
    const defaultTrip = displayedTrips[0] || allTrips[0] || null;
    setQuickStopDraft({
      tripId: defaultTrip?.id || null,
      query: "",
      label: "",
      notes: "",
      place: null,
    });
    setQuickStopSuggestions([]);
    setQuickStopError("");
    setTripsView("quickAdd");
  }

  function startFocusedTripEdit(trip: Trip) {
    setExpandedMoreTripId(null);
    startTripEdit(trip);
    setTripEditorStep("basic");
    setShowManualRouteEditor(false);
    setTripsView("edit");
  }

  function openTripDetails(trip: Trip) {
    setExpandedMoreTripId(null);
    setDetailTripId(trip.id);
    setTripsView("details");
  }

  function closeTripDetails() {
    setDetailTripId(null);
    setTripsView("list");
  }

  function toggleBasicDateField(field: BasicTripDateField) {
    if (tripDraft.trip_kind !== "past") return;

    const nextField = activeBasicDateField === field ? null : field;
    setActiveBasicDateField(nextField);
    if (!nextField) return;

    const seededValue = tripDraft[field] || tripDraft.start_date || tripDraft.end_date || getTodayIsoDate();
    setBasicCalendarCursor(getCalendarCursor(seededValue));
  }

  function applyBasicDate(field: BasicTripDateField, value: string) {
    const shouldAdvanceToEnd = field === "start_date" && !tripDraft.end_date;

    setTripDraft((prev) => {
      if (field === "start_date") {
        const nextEndDate = prev.end_date && prev.end_date < value ? value : prev.end_date;
        return { ...prev, start_date: value, end_date: nextEndDate };
      }

      const nextStartDate = prev.start_date && prev.start_date > value ? value : prev.start_date;
      return { ...prev, end_date: value, start_date: nextStartDate };
    });

    if (field === "start_date" && shouldAdvanceToEnd) {
      setActiveBasicDateField("end_date");
      setBasicCalendarCursor(getCalendarCursor(value));
      return;
    }

    setActiveBasicDateField(null);
  }

  function clearBasicDate(field: BasicTripDateField) {
    setTripDraft((prev) => ({ ...prev, [field]: "" }));
    setActiveBasicDateField(null);
  }

  function discardEditor() {
    resetTripEditor();
    setTripEditorStep("basic");
    setShowManualRouteEditor(false);
    setTripsView("list");
  }

  function requestEditorBack() {
    if (!hasDraft && !tripEditingId) {
      setTripsView("list");
      return;
    }
    Alert.alert("Discard changes?", "Your trip form has unsaved changes.", [
      { text: "Keep Editing", style: "cancel" },
      { text: "Discard", style: "destructive", onPress: discardEditor },
    ]);
  }

  async function saveFocusedTrip() {
    const saved = await handleSaveTrip();
    if (saved) {
      setTripsView("list");
      setTripEditorStep("basic");
      setShowManualRouteEditor(false);
    }
  }

  async function searchQuickStopPlaces(query: string) {
    setQuickStopSearching(true);
    setQuickStopError("");
    try {
      const suggestions = await searchPlaces(query);
      setQuickStopSuggestions(Array.isArray(suggestions) ? suggestions : []);
    } catch (error) {
      setQuickStopSuggestions([]);
      setQuickStopError(error instanceof Error ? error.message : "Could not search places.");
    } finally {
      setQuickStopSearching(false);
    }
  }

  function selectQuickStopPlace(place: PlaceSuggestion) {
    const label = (place.display_name || "Stop").split(",")[0].trim();
    setQuickStopDraft((prev) => ({
      ...prev,
      place,
      label,
      query: place.display_name,
    }));
    setQuickStopSuggestions([]);
  }

  async function saveQuickStop() {
    if (!quickStopDraft.tripId) {
      setQuickStopError("Choose a trip for this quick stop.");
      return;
    }
    if (!quickStopDraft.place) {
      setQuickStopError("Search and choose a place before saving.");
      return;
    }

    const saved = await saveQuickStopToTrip({
      tripId: quickStopDraft.tripId,
      place: quickStopDraft.place,
      label: quickStopDraft.label.trim() || quickStopDraft.place.display_name.split(",")[0].trim() || "Quick stop",
      notes: quickStopDraft.notes,
    });

    if (saved) {
      setQuickStopDraft({ tripId: null, query: "", label: "", notes: "", place: null });
      setQuickStopSuggestions([]);
      setQuickStopError("");
      setTripsView("list");
    }
  }

  function toggleDraftFilterPerson(person: PersonProfile) {
    const active = filterDraft.people.some((entry) => normalizeText(entry) === normalizeText(person.name));
    setFilterDraft((prev) => ({
      ...prev,
      people: active
        ? prev.people.filter((entry) => normalizeText(entry) !== normalizeText(person.name))
        : [...prev.people, person.name],
    }));
  }

  function toggleDraftPerson(person: PersonProfile) {
    const selected = tripDraft.selected_people.some((entry) => normalizeText(entry) === normalizeText(person.name));
    setTripDraft((prev) => ({
      ...prev,
      selected_people: selected
        ? prev.selected_people.filter((entry) => normalizeText(entry) !== normalizeText(person.name))
        : [...prev.selected_people, person.name],
    }));
  }

  function updateAccommodation(index: number, patch: Partial<AccommodationInput>) {
    setTripDraft((prev) => ({
      ...prev,
      accommodations: prev.accommodations.map((entry, entryIndex) =>
        entryIndex === index ? { ...entry, ...patch } : entry
      ),
    }));
  }

  function updateItinerary(index: number, patch: Partial<ItineraryEventInput>) {
    setTripDraft((prev) => ({
      ...prev,
      itinerary: prev.itinerary.map((entry, entryIndex) =>
        entryIndex === index ? { ...entry, ...patch } : entry
      ),
    }));
  }

  function renderStepContent() {
    if (tripEditorStep === "basic") {
      return (
        <View style={styles.formBlock}>
          <Text style={styles.formTitle}>Basic trip info</Text>
          <Field label="Title" value={tripDraft.title} onChangeText={(title) => setTripDraft((prev) => ({ ...prev, title }))} />
          <View style={styles.segment}>
            <SegmentButton
              label="Past"
              active={tripDraft.trip_kind === "past"}
              onPress={() =>
                setTripDraft((prev) => ({
                  ...prev,
                  trip_kind: "past",
                }))
              }
            />
            <SegmentButton
              label="Wishlist"
              active={tripDraft.trip_kind === "wishlist"}
              onPress={() =>
                setTripDraft((prev) => ({
                  ...prev,
                  trip_kind: "wishlist",
                  start_date: "",
                  end_date: "",
                }))
              }
            />
          </View>
          <View style={styles.twoCol}>
            <DateSelectorButton
              styles={styles}
              label="Start"
              value={tripDraft.start_date}
              active={activeBasicDateField === "start_date"}
              disabled={tripDraft.trip_kind !== "past"}
              onPress={() => toggleBasicDateField("start_date")}
            />
            <DateSelectorButton
              styles={styles}
              label="End"
              value={tripDraft.end_date}
              active={activeBasicDateField === "end_date"}
              disabled={tripDraft.trip_kind !== "past"}
              onPress={() => toggleBasicDateField("end_date")}
            />
          </View>
          {tripDraft.trip_kind === "past" ? (
            <Text style={styles.helperText}>
              {activeBasicDateField
                ? `Pick the ${activeBasicDateField === "start_date" ? "start" : "end"} date from the calendar below.`
                : "Tap Start or End to choose dates from a calendar."}
            </Text>
          ) : null}
          {tripDraft.trip_kind === "past" && activeBasicDateField ? (
            <InlineCalendarPicker
              styles={styles}
              label={activeBasicDateField === "start_date" ? "Start date" : "End date"}
              selectedDate={tripDraft[activeBasicDateField]}
              cursor={basicCalendarCursor}
              onChangeMonth={(offset) => setBasicCalendarCursor((prev) => shiftCalendarCursor(prev, offset))}
              onSelectDate={(value) => applyBasicDate(activeBasicDateField, value)}
              onClearDate={() => clearBasicDate(activeBasicDateField)}
              onClose={() => setActiveBasicDateField(null)}
            />
          ) : null}
          {tripDraft.trip_kind === "wishlist" ? (
            <Text style={styles.helperText}>Wishlist trips keep dates empty until your plans are firm.</Text>
          ) : null}
          {isInvalidDateRange(tripDraft.start_date, tripDraft.end_date) ? (
            <Text style={styles.error}>Trip end date cannot be before start date.</Text>
          ) : null}
          <Field label="Notes" value={tripDraft.notes} onChangeText={(notes) => setTripDraft((prev) => ({ ...prev, notes }))} multiline />
        </View>
      );
    }

    if (tripEditorStep === "people") {
      return (
        <View style={styles.formBlock}>
          <Text style={styles.formTitle}>Who is going?</Text>
          <Text style={styles.helperText}>Choose from Family Hub profiles. You can still save without people.</Text>
          <View style={styles.segmentWrap}>
            {people.length ? (
              people.map((person) => {
                const selected = tripDraft.selected_people.some((entry) => normalizeText(entry) === normalizeText(person.name));
                return (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${selected ? "Remove" : "Add"} ${person.name} from trip travelers`}
                    accessibilityState={{ selected }}
                    key={`trip-person-${person.id}`}
                    style={[styles.filterChip, selected && styles.filterChipActive]}
                    onPress={() => toggleDraftPerson(person)}
                  >
                    <Text style={[styles.filterChipText, selected && styles.filterChipTextActive]}>{person.name}</Text>
                  </Pressable>
                );
              })
            ) : (
              <Text style={styles.helperText}>Add family profiles in Family Hub to select travelers faster.</Text>
            )}
          </View>
        </View>
      );
    }

    if (tripEditorStep === "route") {
      return (
        <View style={styles.formBlock}>
          <Text style={styles.formTitle}>Route stops</Text>
          <Text style={styles.helperText}>Search for a place, tap a result, and it will be added as a map stop.</Text>
          <Field label="Find a place" value={routeQuery} onChangeText={setRouteQuery} placeholder="Search city, landmark, hotel, airport..." />
          {routeSearching ? <ActivityIndicator /> : null}
          {routeSuggestions.slice(0, 5).map((suggestion) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Add route stop ${suggestion.display_name}`}
              key={`suggestion-${suggestion.place_id}`}
              style={styles.suggestionRow}
              onPress={() => appendRouteSuggestion(suggestion)}
            >
              <Text style={styles.cardTitleSmall}>{suggestion.display_name.split(",")[0]}</Text>
              <Text style={styles.cardMeta} numberOfLines={2}>
                {suggestion.display_name}
              </Text>
            </Pressable>
          ))}
          {routeStops.length ? (
            <View style={styles.inlineCard}>
              <Text style={styles.cardTitleSmall}>Saved stops</Text>
              {routeStops.map((stop, index) => (
                <View key={`stop-${index}-${stop.lat}-${stop.lng}`} style={styles.rowCard}>
                  <View style={styles.rowCardText}>
                    <Text style={styles.cardTitleSmall}>{stop.label || `Stop ${index + 1}`}</Text>
                    <Text style={styles.cardMeta}>Map stop {index + 1}</Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Remove route stop ${stop.label || index + 1}`}
                    style={styles.textButton}
                    onPress={() => removeRouteStop(index)}
                  >
                    <Text style={styles.textButtonLabel}>Remove</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.helperText}>No map stops yet. The trip still saves in Trips; add a place here when you want it shown on Map.</Text>
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={showManualRouteEditor ? "Hide advanced coordinate editor" : "Show advanced coordinate editor"}
            style={styles.secondaryButton}
            onPress={() => setShowManualRouteEditor((prev) => !prev)}
          >
            <Text style={styles.secondaryButtonText}>{showManualRouteEditor ? "Hide Advanced Editor" : "Advanced Coordinates"}</Text>
          </Pressable>
          {showManualRouteEditor ? (
            <>
              <Field
                label="Coordinate route stops"
                value={tripDraft.route_text}
                onChangeText={(route_text) => setTripDraft((prev) => ({ ...prev, route_text }))}
                multiline
                placeholder={"37.7749,-122.4194,San Francisco\n34.0522,-118.2437,Los Angeles"}
              />
              {routeTextError ? <Text style={styles.error}>{routeTextError}</Text> : null}
            </>
          ) : null}
        </View>
      );
    }

    if (tripEditorStep === "stays") {
      return (
        <View style={styles.formBlock}>
          <Text style={styles.formTitle}>Accommodations</Text>
          {tripDraft.accommodations.map((stay, index) => (
            <View key={`stay-${index}`} style={styles.inlineCard}>
              <Field label="Name" value={stay.name} onChangeText={(name) => updateAccommodation(index, { name })} />
              {tripFormValidation.accommodationNameByIndex[index] ? (
                <Text style={styles.error}>{tripFormValidation.accommodationNameByIndex[index]}</Text>
              ) : null}
              <Field label="Location" value={stay.location} onChangeText={(location) => updateAccommodation(index, { location })} />
              <StayDateControls
                styles={styles}
                Field={Field}
                checkIn={stay.check_in || ""}
                checkOut={stay.check_out || ""}
                tripStart={tripDraft.start_date}
                tripEnd={tripDraft.end_date}
                dateError={tripFormValidation.accommodationDateByIndex[index]}
                onChange={(patch) => updateAccommodation(index, patch)}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Remove stay ${index + 1}`}
                style={styles.textButton}
                onPress={() =>
                  setTripDraft((prev) => ({
                    ...prev,
                    accommodations:
                      prev.accommodations.length > 1
                        ? prev.accommodations.filter((_, entryIndex) => entryIndex !== index)
                        : [emptyAccommodation()],
                  }))
                }
              >
                <Text style={styles.textButtonLabel}>Remove Stay</Text>
              </Pressable>
            </View>
          ))}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add accommodation stay"
            style={styles.secondaryButton}
            onPress={() =>
              setTripDraft((prev) => ({
                ...prev,
                accommodations: [...prev.accommodations, emptyAccommodation()],
              }))
            }
          >
            <Text style={styles.secondaryButtonText}>Add Stay</Text>
          </Pressable>
        </View>
      );
    }

    return (
      <View style={styles.formBlock}>
        <Text style={styles.formTitle}>Itinerary</Text>
        {tripDraft.itinerary.map((item, index) => (
          <View key={`itinerary-${index}`} style={styles.inlineCard}>
            <ItineraryDateTimeControls
              styles={styles}
              Field={Field}
              date={item.date}
              time={item.time}
              tripStart={tripDraft.start_date}
              tripEnd={tripDraft.end_date}
              dateError={tripFormValidation.itineraryDateByIndex[index]}
              onChange={(patch) => updateItinerary(index, patch)}
            />
            <Field label="Activity" value={item.activity} onChangeText={(activity) => updateItinerary(index, { activity })} />
            <Field label="Location" value={item.location} onChangeText={(location) => updateItinerary(index, { location })} />
            {tripFormValidation.itineraryByIndex[index] ? (
              <Text style={styles.error}>{tripFormValidation.itineraryByIndex[index]}</Text>
            ) : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Remove itinerary event ${index + 1}`}
              style={styles.textButton}
              onPress={() =>
                setTripDraft((prev) => ({
                  ...prev,
                  itinerary:
                    prev.itinerary.length > 1
                      ? prev.itinerary.filter((_, entryIndex) => entryIndex !== index)
                      : [emptyItinerary()],
                }))
              }
            >
              <Text style={styles.textButtonLabel}>Remove Event</Text>
            </Pressable>
          </View>
        ))}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add itinerary event"
          style={styles.secondaryButton}
          onPress={() =>
            setTripDraft((prev) => ({
              ...prev,
              itinerary: [...prev.itinerary, emptyItinerary()],
            }))
          }
        >
          <Text style={styles.secondaryButtonText}>Add Event</Text>
        </Pressable>
      </View>
    );
  }

  if (tripsView === "filters") {
    return (
      <View style={styles.panel}>
        <View style={styles.sectionHeader}>
          <Pressable accessibilityRole="button" accessibilityLabel="Back to trips list" style={styles.textButton} onPress={() => setTripsView("list")}>
            <Text style={styles.textButtonLabel}>Back</Text>
          </Pressable>
          <View style={styles.rowCardText}>
            <Text style={styles.sectionTitle}>Filters</Text>
            <Text style={styles.meta}>{draftFilterSummary}</Text>
          </View>
        </View>

        <View style={styles.formBlock}>
          <View style={styles.filterGroup}>
            <Text style={styles.filterGroupTitle}>Search</Text>
            <Field label="Search trips" value={filterDraft.search} onChangeText={(search) => setFilterDraft((prev) => ({ ...prev, search }))} />
          </View>
          <View style={styles.filterGroup}>
            <Text style={styles.filterGroupTitle}>Trip Type</Text>
            <View style={styles.segment}>
              <SegmentButton label="All" active={filterDraft.kind === "all"} onPress={() => setFilterDraft((prev) => ({ ...prev, kind: "all" }))} />
              <SegmentButton label="Past" active={filterDraft.kind === "past"} onPress={() => setFilterDraft((prev) => ({ ...prev, kind: "past" }))} />
              <SegmentButton label="Wishlist" active={filterDraft.kind === "wishlist"} onPress={() => setFilterDraft((prev) => ({ ...prev, kind: "wishlist" }))} />
            </View>
          </View>
          <View style={styles.filterGroup}>
            <Text style={styles.filterGroupTitle}>Sort</Text>
            <View style={styles.segmentWrap}>
              {sortOptions.map(([value, label]) => (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Sort trips by ${label}`}
                  accessibilityState={{ selected: filterDraft.sort === value }}
                  key={`sort-draft-${value}`}
                  style={[styles.filterChip, filterDraft.sort === value && styles.filterChipActive]}
                  onPress={() => setFilterDraft((prev) => ({ ...prev, sort: value }))}
                >
                  <Text style={[styles.filterChipText, filterDraft.sort === value && styles.filterChipTextActive]}>{label}</Text>
                </Pressable>
              ))}
            </View>
          </View>
          <View style={styles.filterGroup}>
            <Text style={styles.filterGroupTitle}>People</Text>
            <View style={styles.segmentWrap}>
              {people.length ? (
                people.map((person) => {
                  const active = filterDraft.people.some((entry) => normalizeText(entry) === normalizeText(person.name));
                  return (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`${active ? "Remove" : "Add"} ${person.name} people filter`}
                      accessibilityState={{ selected: active }}
                      key={`filter-draft-person-${person.id}`}
                      style={[styles.filterChip, active && styles.filterChipActive]}
                      onPress={() => toggleDraftFilterPerson(person)}
                    >
                      <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{person.name}</Text>
                    </Pressable>
                  );
                })
              ) : (
                <Text style={styles.helperText}>Add family profiles to filter trips by people.</Text>
              )}
            </View>
          </View>
          <View style={styles.actionRow}>
            <Pressable accessibilityRole="button" accessibilityLabel="Apply trip filters" style={styles.primaryButton} onPress={applyFilters}>
              <Text style={styles.primaryButtonText}>Apply Filters</Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Reset filter choices" style={styles.secondaryButton} onPress={resetFilterDraft}>
              <Text style={styles.secondaryButtonText}>Reset</Text>
            </Pressable>
          </View>
          {draftFilterCount ? <Text style={styles.helperText}>{draftFilterCount} filter{draftFilterCount === 1 ? "" : "s"} ready to apply.</Text> : null}
        </View>
      </View>
    );
  }

  if (tripsView === "quickAdd") {
    const selectedQuickTrip = allTrips.find((trip) => trip.id === quickStopDraft.tripId) || null;
    const canSaveQuickStop = Boolean(quickStopDraft.tripId && quickStopDraft.place);

    return (
      <View style={styles.panel}>
        <View style={styles.sectionHeader}>
          <Pressable accessibilityRole="button" accessibilityLabel="Back to trips list" style={styles.textButton} onPress={() => setTripsView("list")}>
            <Text style={styles.textButtonLabel}>Back</Text>
          </Pressable>
          <View style={styles.rowCardText}>
            <Text style={styles.sectionTitle}>Quick Stop</Text>
            <Text style={styles.meta}>Save a place fast, then keep moving.</Text>
          </View>
        </View>

        <View style={styles.formBlock}>
          <View style={styles.filterGroup}>
            <Text style={styles.filterGroupTitle}>Choose trip</Text>
            <View style={styles.segmentWrap}>
              {allTrips.length ? (
                allTrips.map((trip) => {
                  const active = quickStopDraft.tripId === trip.id;
                  return (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Save quick stop to ${trip.title}`}
                      accessibilityState={{ selected: active }}
                      key={`quick-stop-trip-${trip.id}`}
                      style={[styles.filterChip, active && styles.filterChipActive]}
                      onPress={() => setQuickStopDraft((prev) => ({ ...prev, tripId: trip.id }))}
                    >
                      <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{trip.title}</Text>
                    </Pressable>
                  );
                })
              ) : (
                <Text style={styles.helperText}>Create a trip before adding quick stops.</Text>
              )}
            </View>
            {selectedQuickTrip ? (
              <Text style={styles.helperText}>Adding to {selectedQuickTrip.title}</Text>
            ) : null}
          </View>

          <Field
            label="Find place"
            value={quickStopDraft.query}
            onChangeText={(query) =>
              setQuickStopDraft((prev) => ({
                ...prev,
                query,
                place: null,
                label: query.trim() ? prev.label : "",
              }))
            }
            placeholder="Search landmark, restaurant, city..."
          />
          {quickStopSearching ? <ActivityIndicator /> : null}
          {quickStopError ? <Text style={styles.error}>{quickStopError}</Text> : null}
          {quickStopSuggestions.slice(0, 5).map((suggestion) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Use ${suggestion.display_name} as quick stop`}
              key={`quick-stop-place-${suggestion.place_id}`}
              style={styles.suggestionRow}
              onPress={() => selectQuickStopPlace(suggestion)}
            >
              <Text style={styles.cardTitleSmall}>{suggestion.display_name.split(",")[0]}</Text>
              <Text style={styles.cardMeta} numberOfLines={2}>{suggestion.display_name}</Text>
            </Pressable>
          ))}

          <Field
            label="Stop label"
            value={quickStopDraft.label}
            onChangeText={(label) => setQuickStopDraft((prev) => ({ ...prev, label }))}
            placeholder="Snack stop, museum, hotel..."
          />
          <Field
            label="Quick note"
            value={quickStopDraft.notes}
            onChangeText={(notes) => setQuickStopDraft((prev) => ({ ...prev, notes }))}
            multiline
            placeholder="One quick reminder..."
          />

          <View style={styles.actionRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Save quick stop"
              accessibilityState={{ disabled: !canSaveQuickStop }}
              disabled={!canSaveQuickStop}
              style={[styles.primaryButton, !canSaveQuickStop && styles.disabled]}
              onPress={() => void saveQuickStop()}
            >
              <Text style={styles.primaryButtonText}>Save Stop</Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Cancel quick stop" style={styles.secondaryButton} onPress={() => setTripsView("list")}>
              <Text style={styles.secondaryButtonText}>Cancel</Text>
            </Pressable>
          </View>
          <Text style={styles.helperText}>First release note: current GPS location can come later; this version saves a searched place.</Text>
        </View>
      </View>
    );
  }

  if (tripsView === "new" || tripsView === "edit") {
    const isEditingTrip = tripsView === "edit" || Boolean(tripEditingId);
    return (
      <View style={styles.panel}>
        <View style={styles.sectionHeader}>
          <Pressable accessibilityRole="button" accessibilityLabel="Back to trips list" style={styles.textButton} onPress={requestEditorBack}>
            <Text style={styles.textButtonLabel}>Back</Text>
          </Pressable>
          <View style={styles.rowCardText}>
            <Text style={styles.sectionTitle}>{isEditingTrip ? "Edit Trip" : "New Trip"}</Text>
            <Text style={styles.meta}>{editorStatus}</Text>
          </View>
        </View>

        <View style={styles.formBlock}>
          <View style={styles.editorStepRow}>
            {editorSteps.map((step) => (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Open ${step.label} trip editor step`}
                accessibilityState={{ selected: tripEditorStep === step.key }}
                key={`trip-editor-step-${step.key}`}
                style={[styles.editorStepButton, tripEditorStep === step.key && styles.editorStepButtonActive]}
                onPress={() => setTripEditorStep(step.key)}
              >
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.8}
                  style={[styles.editorStepButtonText, tripEditorStep === step.key && styles.editorStepButtonTextActive]}
                >
                  {step.label}
                </Text>
              </Pressable>
            ))}
          </View>
          {renderStepContent()}
          <View style={styles.actionRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={isEditingTrip ? "Save trip changes" : "Save new trip"}
              accessibilityState={{ disabled: !canSaveTrip }}
              style={[styles.primaryButton, !canSaveTrip && styles.disabled]}
              onPress={() => void saveFocusedTrip()}
              disabled={!canSaveTrip}
            >
              <Text style={styles.primaryButtonText}>{isEditingTrip ? "Save Changes" : "Save Trip"}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={isEditingTrip ? "Cancel trip edit" : "Discard new trip"}
              style={styles.secondaryButton}
              onPress={requestEditorBack}
            >
              <Text style={styles.secondaryButtonText}>{isEditingTrip ? "Cancel" : "Discard"}</Text>
            </Pressable>
          </View>
          {saveTripHint ? <Text style={styles.helperText}>{saveTripHint}</Text> : null}
        </View>
      </View>
    );
  }

  if (tripsView === "details") {
    if (!detailTrip) {
      return (
        <View style={styles.panel}>
          <View style={styles.sectionHeader}>
            <Pressable accessibilityRole="button" accessibilityLabel="Back to trips list" style={styles.textButton} onPress={closeTripDetails}>
              <Text style={styles.textButtonLabel}>Back</Text>
            </Pressable>
            <View style={styles.rowCardText}>
              <Text style={styles.sectionTitle}>Trip Details</Text>
              <Text style={styles.meta}>Trip is no longer available.</Text>
            </View>
          </View>
        </View>
      );
    }

    const detailRouteStops = getOrderedRoutePoints(detailTrip.route);

    return (
      <View style={styles.panel}>
        <View style={styles.sectionHeader}>
          <Pressable accessibilityRole="button" accessibilityLabel="Back to trips list" style={styles.textButton} onPress={closeTripDetails}>
            <Text style={styles.textButtonLabel}>Back</Text>
          </Pressable>
          <View style={styles.rowCardText}>
            <Text style={styles.sectionTitle}>Trip Details</Text>
            <Text style={styles.meta}>{detailTrip.trip_kind === "wishlist" ? "Wishlist trip" : "Past trip"}</Text>
          </View>
        </View>

        <View style={styles.formBlock}>
          <View style={styles.cardTop}>
            <Text style={styles.cardTitle}>{detailTrip.title}</Text>
            <Text style={styles.badge}>{detailTrip.trip_kind === "wishlist" ? "Wishlist" : "Past"}</Text>
          </View>
          <Text style={styles.cardMeta}>{formatDateRange(detailTrip.start_date, detailTrip.end_date)}</Text>
          <Text style={styles.cardText}>{detailTrip.notes || "No notes saved."}</Text>
          <View style={styles.actionRowWrap}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Edit ${detailTrip.title}`}
              style={styles.tripActionButton}
              onPress={() => startFocusedTripEdit(detailTrip)}
            >
              <Text style={styles.tripActionText}>Edit</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Show ${detailTrip.title} on map`}
              style={styles.tripActionButton}
              onPress={() => openMapForTrip(detailTrip)}
            >
              <Text style={styles.tripActionText}>Map</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Open Google Calendar for ${detailTrip.title}`}
              style={styles.tripActionButton}
              onPress={() => void openGoogleCalendarForTrip(detailTrip)}
            >
              <Text style={styles.tripActionText}>Cal</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.inlineCard}>
          <Text style={styles.cardTitleSmall}>People</Text>
          <Text style={styles.cardText}>{detailTrip.people.length ? detailTrip.people.join(", ") : "No people saved."}</Text>
        </View>

        <View style={styles.inlineCard}>
          <Text style={styles.cardTitleSmall}>Route</Text>
          {detailRouteStops.length ? (
            detailRouteStops.map((point, index) => (
              <View key={`detail-route-${index}-${point.lat}-${point.lng}`} style={styles.rowCard}>
                <View style={styles.rowCardText}>
                  <Text style={styles.cardTitleSmall}>{point.label || `Stop ${index + 1}`}</Text>
                  <Text style={styles.cardMeta}>
                    {point.lat.toFixed(4)}, {point.lng.toFixed(4)}
                  </Text>
                </View>
              </View>
            ))
          ) : (
            <Text style={styles.cardText}>No route stops saved.</Text>
          )}
        </View>

        <View style={styles.inlineCard}>
          <Text style={styles.cardTitleSmall}>Accommodations</Text>
          {detailTrip.accommodations.length ? (
            detailTrip.accommodations.map((stay, index) => (
              <View key={`detail-stay-${index}-${stay.name}-${stay.location}`} style={styles.rowCard}>
                <View style={styles.rowCardText}>
                  <Text style={styles.cardTitleSmall}>{stay.name || "Unnamed stay"}</Text>
                  <Text style={styles.cardMeta}>{stay.location || "No location saved"}</Text>
                  <Text style={styles.cardText}>{formatDateRange(stay.check_in, stay.check_out)}</Text>
                  {stay.notes ? <Text style={styles.cardText}>{stay.notes}</Text> : null}
                </View>
              </View>
            ))
          ) : (
            <Text style={styles.cardText}>No accommodations saved.</Text>
          )}
        </View>

        <View style={styles.inlineCard}>
          <Text style={styles.cardTitleSmall}>Itinerary</Text>
          {detailTrip.itinerary.length ? (
            detailTrip.itinerary.map((item, index) => (
              <View key={`detail-itinerary-${index}-${item.date}-${item.time}-${item.activity}`} style={styles.rowCard}>
                <View style={styles.rowCardText}>
                  <Text style={styles.cardTitleSmall}>{item.activity || "Untitled activity"}</Text>
                  <Text style={styles.cardMeta}>
                    {[item.date, item.time, item.location].filter(Boolean).join(" | ") || "No schedule saved"}
                  </Text>
                  {item.notes ? <Text style={styles.cardText}>{item.notes}</Text> : null}
                </View>
              </View>
            ))
          ) : (
            <Text style={styles.cardText}>No itinerary items saved.</Text>
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.panel}>
      <View style={styles.sectionHeader}>
        <View>
          <Text style={styles.sectionTitle}>Trips</Text>
          {tripCountLabel ? <Text style={styles.meta}>{tripCountLabel}</Text> : null}
        </View>
        <View style={styles.actionRowCompact}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open trip filters"
            style={styles.actionMiniButton}
            onPress={openFilters}
          >
            <Text style={styles.actionMiniText}>
              {activeFilterCount ? `Filters (${activeFilterCount})` : "Filters"}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add trip"
            style={styles.primaryMiniButton}
            onPress={startNewTrip}
          >
            <Text style={styles.primaryMiniText}>Add Trip</Text>
          </Pressable>
        </View>
      </View>
      <Text style={styles.filterSummaryLine}>{filterSummary}</Text>
      <View style={styles.actionRowWrap}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={tripListMode === "timeline" ? "Show trips as cards" : "Show trip timeline"}
          accessibilityState={{ selected: tripListMode === "timeline" }}
          style={[styles.tripActionButton, tripListMode === "timeline" && styles.filterChipActive]}
          onPress={() => setTripListMode((current) => (current === "timeline" ? "cards" : "timeline"))}
        >
          <Text style={[styles.tripActionText, tripListMode === "timeline" && styles.filterChipTextActive]}>
            {tripListMode === "timeline" ? "Card List" : "Timeline"}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Quick add a stop"
          style={styles.tripActionButton}
          onPress={openQuickStop}
        >
          <Text style={styles.tripActionText}>Quick Stop</Text>
        </Pressable>
      </View>

      {selectedTripIds.length ? (
        <View style={styles.selectedActionBar}>
          <View style={styles.selectedActionTextGroup}>
            <Text style={styles.selectedActionTitle}>{selectedTripIds.length} selected</Text>
            <Text style={styles.selectedActionMeta}>
              {selectedOutsideFilterCount
                ? `${selectedOutsideFilterCount} outside filters`
                : "Tap cards to select more"}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="View selected trips on map"
            style={styles.tripActionButton}
            onPress={viewSelectedTripsOnMap}
          >
            <Text style={styles.tripActionText}>View Map</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Clear selected trips"
            style={styles.tripActionButton}
            onPress={clearTripSelections}
          >
            <Text style={styles.tripActionText}>Clear</Text>
          </Pressable>
        </View>
      ) : null}

      {hasDraft || tripEditingId ? (
        <View style={styles.inlineCard}>
          <View style={styles.rowSpaceBetween}>
            <View style={styles.rowCardText}>
              <Text style={styles.cardTitleSmall}>{tripEditingId ? "Editing saved trip" : "Unsaved trip changes"}</Text>
              <Text style={styles.cardMeta}>{tripDraft.title || "Untitled trip"}</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Open trip editor" style={styles.primaryMiniButton} onPress={() => setTripsView(tripEditingId ? "edit" : "new")}>
              <Text style={styles.primaryMiniText}>Continue</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {!displayedTrips.length ? (
        <View style={styles.emptyState}>
          <Text style={styles.cardTitleSmall}>{activeFilterCount ? "No trips match these filters" : "No trips yet"}</Text>
          <Text style={styles.cardText}>
            {activeFilterCount ? "Try clearing filters or widening your search." : "Add your first family trip when you are ready."}
          </Text>
          {activeFilterCount ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Clear trip filters" style={styles.secondaryButton} onPress={clearAppliedFilters}>
              <Text style={styles.secondaryButtonText}>Clear Filters</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {tripListMode === "timeline" && displayedTrips.length ? (
        <View style={styles.timelinePanel}>
          {timelineGroups.map((group) => (
            <View key={`timeline-group-${group.key}`} style={styles.timelineGroup}>
              <Text style={styles.timelineMonthTitle}>{group.title}</Text>
              {group.trips.map((trip) => {
                const isSelected = selectedTripIds.includes(trip.id);
                return (
                  <View key={`timeline-trip-${trip.id}`} style={styles.timelineRow}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`View details for ${trip.title}`}
                      style={styles.timelineDotColumn}
                      onPress={() => openTripDetails(trip)}
                    >
                      <View style={[styles.timelineDot, isSelected && styles.timelineDotSelected]} />
                    </Pressable>
                    <View style={styles.timelineContent}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`View details for ${trip.title}`}
                        onPress={() => openTripDetails(trip)}
                      >
                        <View style={styles.cardTop}>
                          <Text style={styles.cardTitleSmall}>{trip.title}</Text>
                          <View style={styles.badgeRow}>
                            {isSelected ? <Text style={styles.selectedBadge}>Selected</Text> : null}
                            <Text style={styles.badge}>{trip.trip_kind === "wishlist" ? "Wishlist" : "Past"}</Text>
                          </View>
                        </View>
                        <Text style={styles.cardMeta}>{formatDateRange(trip.start_date, trip.end_date)}</Text>
                        {trip.people.length ? <Text style={styles.cardMeta}>{trip.people.join(", ")}</Text> : null}
                      </Pressable>
                      <View style={styles.actionRowWrap}>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`${isSelected ? "Unselect" : "Select"} ${trip.title}`}
                          accessibilityState={{ selected: isSelected }}
                          style={styles.tripActionButton}
                          onPress={() => toggleTripSelection(trip.id)}
                        >
                          <Text style={styles.tripActionText}>{isSelected ? "Unselect" : "Select"}</Text>
                        </Pressable>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Show ${trip.title} on map`}
                          style={styles.tripActionButton}
                          onPress={() => openMapForTrip(trip)}
                        >
                          <Text style={styles.tripActionText}>Map</Text>
                        </Pressable>
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          ))}
        </View>
      ) : null}

      {tripListMode === "cards" ? displayedTrips.map((trip) => {
        const isSelected = selectedTripIds.includes(trip.id);
        const moreOpen = expandedMoreTripId === trip.id;

        return (
          <View key={trip.id} style={[styles.card, isSelected && styles.cardSelected]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${isSelected ? "Unselect" : "Select"} ${trip.title}`}
              accessibilityState={{ selected: isSelected }}
              onPress={() => {
                toggleTripSelection(trip.id);
              }}
            >
              <View style={styles.cardTop}>
                <Text style={styles.cardTitle}>{trip.title}</Text>
                <View style={styles.badgeRow}>
                  {isSelected ? <Text style={styles.selectedBadge}>Selected</Text> : null}
                  <Text style={styles.badge}>{trip.trip_kind === "wishlist" ? "Wishlist" : "Past"}</Text>
                </View>
              </View>
              <Text style={styles.cardMeta}>{formatDateRange(trip.start_date, trip.end_date)}</Text>
              {trip.people.length ? <Text style={styles.cardMeta}>{trip.people.join(", ")}</Text> : null}
              {trip.notes ? <Text style={styles.cardText} numberOfLines={2}>{trip.notes}</Text> : null}
            </Pressable>
            <View style={styles.actionRowWrap}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`View details for ${trip.title}`}
                style={styles.tripActionButton}
                onPress={() => openTripDetails(trip)}
              >
                <Text style={styles.tripActionText}>Details</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Show ${trip.title} on map`}
                style={styles.tripActionButton}
                onPress={() => openMapForTrip(trip)}
              >
                <Text style={styles.tripActionText}>Map</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${moreOpen ? "Hide" : "Show"} more actions for ${trip.title}`}
                accessibilityState={{ expanded: moreOpen }}
                style={styles.tripActionButton}
                onPress={() => setExpandedMoreTripId((current) => (current === trip.id ? null : trip.id))}
              >
                <Text style={styles.tripActionText}>More</Text>
              </Pressable>
            </View>
            {moreOpen ? (
              <View style={styles.moreActionPanel}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Edit ${trip.title}`}
                  style={styles.tripActionButton}
                  onPress={() => startFocusedTripEdit(trip)}
                >
                  <Text style={styles.tripActionText}>Edit</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Open Google Calendar for ${trip.title}`}
                  style={styles.tripActionButton}
                  onPress={() => void openGoogleCalendarForTrip(trip)}
                >
                  <Text style={styles.tripActionText}>Calendar</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Delete ${trip.title}`}
                  style={styles.tripActionButtonDanger}
                  onPress={() => void confirmDeleteTrip(trip.id)}
                >
                  <Text style={styles.tripActionTextDanger}>Delete</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        );
      }) : null}
    </View>
  );
}

function ItineraryDateTimeControls({
  styles,
  Field,
  date,
  time,
  tripStart,
  tripEnd,
  dateError,
  onChange,
}: {
  styles: AppStyles;
  Field: FieldComponent;
  date: string;
  time: string;
  tripStart: string;
  tripEnd: string;
  dateError?: string;
  onChange: (patch: Partial<ItineraryEventInput>) => void;
}) {
  const tripStartDate = isIsoDateString(tripStart) ? tripStart : "";
  const tripEndDate = isIsoDateString(tripEnd) ? tripEnd : "";
  const activeDate = isIsoDateString(date) ? date : tripStartDate;
  const hasDate = Boolean(date);
  const hasTime = Boolean(time);

  return (
    <View style={styles.stayDateCard}>
      <Text style={styles.cardTitleSmall}>Event schedule</Text>
      <View style={styles.twoCol}>
        <View style={styles.dateInputColumn}>
          <Field
            label="Date"
            value={date}
            onChangeText={(nextDate) => onChange({ date: nextDate })}
            placeholder="YYYY-MM-DD"
            keyboardType="numbers-and-punctuation"
          />
        </View>
        <View style={styles.dateInputColumn}>
          <Field
            label="Time"
            value={time}
            onChangeText={(nextTime) => onChange({ time: nextTime })}
            placeholder="09:00"
            keyboardType="numbers-and-punctuation"
          />
        </View>
      </View>
      {dateError ? (
        <Text style={styles.error}>{dateError}</Text>
      ) : (
        <Text style={styles.helperText}>Use the chips below to fill the schedule quickly, then adjust if needed.</Text>
      )}
      <Text style={styles.filterGroupTitle}>Date shortcuts</Text>
      <View style={styles.segmentWrap}>
        <DateQuickButton
          styles={styles}
          label="Trip start"
          active={date === tripStartDate && Boolean(tripStartDate)}
          disabled={!tripStartDate}
          onPress={() => onChange({ date: tripStartDate })}
        />
        <DateQuickButton
          styles={styles}
          label="Trip end"
          active={date === tripEndDate && Boolean(tripEndDate)}
          disabled={!tripEndDate}
          onPress={() => onChange({ date: tripEndDate })}
        />
        <DateQuickButton
          styles={styles}
          label="Previous day"
          disabled={!activeDate}
          onPress={() => onChange({ date: addDaysToDateString(activeDate, -1) })}
        />
        <DateQuickButton
          styles={styles}
          label="Next day"
          disabled={!activeDate}
          onPress={() => onChange({ date: addDaysToDateString(activeDate, 1) })}
        />
        <DateQuickButton
          styles={styles}
          label="Clear date"
          disabled={!hasDate}
          onPress={() => onChange({ date: "" })}
        />
      </View>
      <Text style={styles.filterGroupTitle}>Time shortcuts</Text>
      <View style={styles.segmentWrap}>
        {itineraryTimeOptions.map((option) => (
          <DateQuickButton
            key={option.value}
            styles={styles}
            label={option.label}
            active={time === option.value}
            onPress={() => onChange({ time: option.value })}
          />
        ))}
        <DateQuickButton
          styles={styles}
          label="Clear time"
          disabled={!hasTime}
          onPress={() => onChange({ time: "" })}
        />
      </View>
    </View>
  );
}

function StayDateControls({
  styles,
  Field,
  checkIn,
  checkOut,
  tripStart,
  tripEnd,
  dateError,
  onChange,
}: {
  styles: AppStyles;
  Field: FieldComponent;
  checkIn: string;
  checkOut: string;
  tripStart: string;
  tripEnd: string;
  dateError?: string;
  onChange: (patch: Partial<AccommodationInput>) => void;
}) {
  const tripStartDate = isIsoDateString(tripStart) ? tripStart : "";
  const tripEndDate = isIsoDateString(tripEnd) ? tripEnd : "";
  const activeCheckIn = isIsoDateString(checkIn) ? checkIn : tripStartDate;
  const nightCount = getStayNightCount(checkIn, checkOut);
  const hasDates = Boolean(checkIn || checkOut);

  function useTripDates() {
    onChange({
      check_in: tripStartDate || checkIn,
      check_out: tripEndDate || checkOut,
    });
  }

  function setOneNightStay() {
    if (!activeCheckIn) return;
    onChange({
      check_in: activeCheckIn,
      check_out: addDaysToDateString(activeCheckIn, 1),
    });
  }

  return (
    <View style={styles.stayDateCard}>
      <Text style={styles.cardTitleSmall}>Stay dates</Text>
      <View style={styles.twoCol}>
        <View style={styles.dateInputColumn}>
          <Field
            label="Check in"
            value={checkIn}
            onChangeText={(check_in) => onChange({ check_in })}
            placeholder="YYYY-MM-DD"
            keyboardType="numbers-and-punctuation"
          />
        </View>
        <View style={styles.dateInputColumn}>
          <Field
            label="Check out"
            value={checkOut}
            onChangeText={(check_out) => onChange({ check_out })}
            placeholder="YYYY-MM-DD"
            keyboardType="numbers-and-punctuation"
          />
        </View>
      </View>
      {dateError ? (
        <Text style={styles.error}>{dateError}</Text>
      ) : nightCount !== null ? (
        <Text style={styles.helperText}>
          {nightCount} {nightCount === 1 ? "night" : "nights"} selected.
        </Text>
      ) : (
        <Text style={styles.helperText}>Tip: use the quick buttons below instead of typing dates from scratch.</Text>
      )}
      <View style={styles.segmentWrap}>
        <DateQuickButton
          styles={styles}
          label="Use trip dates"
          disabled={!tripStartDate && !tripEndDate}
          onPress={useTripDates}
        />
        <DateQuickButton
          styles={styles}
          label="In = trip start"
          disabled={!tripStartDate}
          onPress={() => onChange({ check_in: tripStartDate })}
        />
        <DateQuickButton
          styles={styles}
          label="Out = trip end"
          disabled={!tripEndDate}
          onPress={() => onChange({ check_out: tripEndDate })}
        />
        <DateQuickButton
          styles={styles}
          label="1 night"
          disabled={!activeCheckIn}
          onPress={setOneNightStay}
        />
        <DateQuickButton
          styles={styles}
          label="Clear"
          disabled={!hasDates}
          onPress={() => onChange({ check_in: "", check_out: "" })}
        />
      </View>
    </View>
  );
}

function DateSelectorButton({
  styles,
  label,
  value,
  active,
  disabled,
  onPress,
}: {
  styles: AppStyles;
  label: string;
  value: string;
  active?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label} date`}
      accessibilityState={{ selected: Boolean(active), disabled: Boolean(disabled) }}
      disabled={disabled}
      style={[styles.dateField, active && styles.dateFieldActive, disabled && styles.dateFieldDisabled]}
      onPress={onPress}
    >
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.dateFieldValue, !value && styles.dateFieldPlaceholder]}>
        {value || "Select date"}
      </Text>
    </Pressable>
  );
}

function InlineCalendarPicker({
  styles,
  label,
  selectedDate,
  cursor,
  onChangeMonth,
  onSelectDate,
  onClearDate,
  onClose,
}: {
  styles: AppStyles;
  label: string;
  selectedDate: string;
  cursor: CalendarCursor;
  onChangeMonth: (offset: number) => void;
  onSelectDate: (value: string) => void;
  onClearDate: () => void;
  onClose: () => void;
}) {
  const weeks = buildCalendarWeeks(cursor);
  const todayIso = getTodayIsoDate();

  return (
    <View style={styles.calendarCard}>
      <View style={styles.calendarHeader}>
        <View style={styles.rowCardText}>
          <Text style={styles.cardTitleSmall}>{label}</Text>
          <Text style={styles.cardMeta}>{selectedDate || "No date selected"}</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Close calendar" style={styles.textButton} onPress={onClose}>
          <Text style={styles.textButtonLabel}>Done</Text>
        </Pressable>
      </View>

      <View style={styles.calendarMonthRow}>
        <Pressable accessibilityRole="button" accessibilityLabel="Show previous month" style={styles.calendarNavButton} onPress={() => onChangeMonth(-1)}>
          <Text style={styles.calendarNavText}>Prev</Text>
        </Pressable>
        <Text style={styles.calendarMonthLabel}>{formatCalendarMonth(cursor)}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Show next month" style={styles.calendarNavButton} onPress={() => onChangeMonth(1)}>
          <Text style={styles.calendarNavText}>Next</Text>
        </Pressable>
      </View>

      <View style={styles.calendarWeekdaysRow}>
        {calendarWeekdayLabels.map((weekday) => (
          <Text key={weekday} style={styles.calendarWeekdayLabel}>
            {weekday}
          </Text>
        ))}
      </View>

      {weeks.map((week, index) => (
        <View key={`calendar-week-${index}`} style={styles.calendarDaysRow}>
          {week.map((day) => {
            const selected = day.iso === selectedDate;
            const today = day.iso === todayIso;
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Choose ${day.iso}`}
                key={day.iso}
                style={[
                  styles.calendarDayButton,
                  !day.inMonth && styles.calendarDayButtonMuted,
                  today && styles.calendarDayButtonToday,
                  selected && styles.calendarDayButtonSelected,
                ]}
                onPress={() => onSelectDate(day.iso)}
              >
                <Text
                  style={[
                    styles.calendarDayText,
                    !day.inMonth && styles.calendarDayTextMuted,
                    selected && styles.calendarDayTextSelected,
                  ]}
                >
                  {day.day}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ))}

      <View style={styles.actionRow}>
        <Pressable accessibilityRole="button" accessibilityLabel="Use today for this date" style={styles.actionMiniButton} onPress={() => onSelectDate(todayIso)}>
          <Text style={styles.actionMiniText}>Today</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Clear selected date"
          accessibilityState={{ disabled: !selectedDate }}
          disabled={!selectedDate}
          style={[styles.actionMiniButton, !selectedDate && styles.disabled]}
          onPress={onClearDate}
        >
          <Text style={styles.actionMiniText}>Clear</Text>
        </Pressable>
      </View>
    </View>
  );
}

function DateQuickButton({
  styles,
  label,
  active,
  disabled,
  onPress,
}: {
  styles: AppStyles;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      style={[styles.filterChip, active && styles.filterChipActive, disabled && styles.disabled]}
      onPress={onPress}
    >
      <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{label}</Text>
    </Pressable>
  );
}

type CalendarCursor = {
  year: number;
  month: number;
};

type CalendarDay = {
  iso: string;
  day: number;
  inMonth: boolean;
};

function buildCalendarWeeks(cursor: CalendarCursor) {
  const firstDayOfMonth = new Date(cursor.year, cursor.month, 1).getDay();
  const daysInMonth = new Date(cursor.year, cursor.month + 1, 0).getDate();
  const daysInPreviousMonth = new Date(cursor.year, cursor.month, 0).getDate();
  const weeks: CalendarDay[][] = [];

  for (let weekIndex = 0; weekIndex < 6; weekIndex += 1) {
    const week: CalendarDay[] = [];

    for (let weekdayIndex = 0; weekdayIndex < 7; weekdayIndex += 1) {
      const cellIndex = weekIndex * 7 + weekdayIndex;
      const dayOfMonth = cellIndex - firstDayOfMonth + 1;

      if (dayOfMonth < 1) {
        const previous = normalizeCalendarCursor(cursor.year, cursor.month - 1);
        week.push({
          iso: formatIsoDate(previous.year, previous.month + 1, daysInPreviousMonth + dayOfMonth),
          day: daysInPreviousMonth + dayOfMonth,
          inMonth: false,
        });
        continue;
      }

      if (dayOfMonth > daysInMonth) {
        const next = normalizeCalendarCursor(cursor.year, cursor.month + 1);
        week.push({
          iso: formatIsoDate(next.year, next.month + 1, dayOfMonth - daysInMonth),
          day: dayOfMonth - daysInMonth,
          inMonth: false,
        });
        continue;
      }

      week.push({
        iso: formatIsoDate(cursor.year, cursor.month + 1, dayOfMonth),
        day: dayOfMonth,
        inMonth: true,
      });
    }

    weeks.push(week);
  }

  return weeks;
}

function formatCalendarMonth(cursor: CalendarCursor) {
  return new Date(cursor.year, cursor.month, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

function shiftCalendarCursor(cursor: CalendarCursor, offset: number) {
  return normalizeCalendarCursor(cursor.year, cursor.month + offset);
}

function getCalendarCursor(value: string) {
  if (!isIsoDateString(value)) {
    const today = new Date();
    return { year: today.getFullYear(), month: today.getMonth() };
  }

  const [yearText, monthText] = value.split("-");
  return {
    year: Number(yearText),
    month: Number(monthText) - 1,
  };
}

function normalizeCalendarCursor(year: number, month: number) {
  const normalized = new Date(year, month, 1);
  return {
    year: normalized.getFullYear(),
    month: normalized.getMonth(),
  };
}

function getTodayIsoDate() {
  const today = new Date();
  return formatIsoDate(today.getFullYear(), today.getMonth() + 1, today.getDate());
}

function formatIsoDate(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
