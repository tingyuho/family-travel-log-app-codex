import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Pressable, Text, View } from "react-native";

import { searchPlaces, type AccommodationInput, type ItineraryEventInput, type PersonProfile, type PlaceSuggestion, type Trip } from "../api";
import { ItineraryDateTimeControls, StayDateControls, DateSelectorButton, InlineCalendarPicker, shiftCalendarCursor, getCalendarCursor, getTodayIsoDate } from "../components/TripDateControls";
import QuickStopTripPicker from "../components/QuickStopTripPicker";
import type { TripDraftForm, TripFilterKind } from "../forms";
import { getOrderedRoutePoints } from "../mapLayers";
import type { AppStyles, FieldComponent, SegmentButtonComponent, StateSetter } from "../screenTypes";
import { groupTripsByTimeline } from "../travelInsights";
import { tripPickerDateLabel } from "../tripPicker";
import {
  getRouteTextError,
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
  handleSaveTrip: () => Trip | null | Promise<Trip | null>;
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
  onViewChange?: (view: string) => void;
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
  { key: "route", label: "Places" },
  { key: "stays", label: "Stays" },
  { key: "itinerary", label: "Itinerary" },
];

const sortOptions: Array<[TripSort, string]> = [
  ["date_desc", "Newest"],
  ["date_asc", "Oldest"],
  ["name_asc", "Name A-Z"],
  ["name_desc", "Name Z-A"],
];


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
    onViewChange,
    detailsTripId,
    onDetailsTripOpened,
  } = props;

  const [tripsView, setTripsView] = useState<TripsView>("list");
  const [tripListMode, setTripListMode] = useState<TripListMode>("cards");
  const tripSaveLock = useRef(false);
  const quickStopSaveLock = useRef(false);
  const [tripSaving, setTripSaving] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [quickStopSaving, setQuickStopSaving] = useState(false);
  const [expandedMoreTripId, setExpandedMoreTripId] = useState<number | null>(null);
  const [tripEditorStep, setTripEditorStep] = useState<TripEditorStep>("basic");
  const [showManualRouteEditor, setShowManualRouteEditor] = useState(false);
  const [detailTripId, setDetailTripId] = useState<number | null>(null);
  const [detailSection, setDetailSection] = useState<"Itinerary" | "Places" | "Stays">("Itinerary");
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
  const [showQuickStopTripPicker, setShowQuickStopTripPicker] = useState(false);
  const [quickStopReturnView, setQuickStopReturnView] = useState<"list" | "details">("list");
  const quickStopDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { onViewChange?.(tripsView); }, [tripsView, onViewChange]);

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
  const editorStatus = tripEditingId ? "Editing saved trip" : hasDraft ? "Unsaved trip in progress" : "Start with a name. Everything else is optional.";
  const dateRangeInvalid = isInvalidDateRange(tripDraft.start_date, tripDraft.end_date);
  const validationSummary = getTripValidationSummary(tripFormValidation);
  const canSaveTrip = !tripSaving && Boolean(tripDraft.title.trim()) && !dateRangeInvalid && !validationSummary && !routeTextError;
  const activeBasicDateValue = activeBasicDateField ? tripDraft[activeBasicDateField] : "";
  const saveTripHint = !tripDraft.title.trim()
    ? "Add a trip name to create your trip."
    : dateRangeInvalid
      ? "End date must be on or after start date."
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
    setDetailSection("Itinerary");
    setTripsView("details");
    onDetailsTripOpened?.();
  }, [detailsTripId, onDetailsTripOpened]);

  useEffect(() => {
    if (!activeBasicDateField || !isIsoDateString(activeBasicDateValue)) return;
    setBasicCalendarCursor(getCalendarCursor(activeBasicDateValue));
  }, [activeBasicDateField, activeBasicDateValue]);

  useEffect(() => {
    let cancelled = false;
    if (quickStopDebounceRef.current) clearTimeout(quickStopDebounceRef.current);
    const query = quickStopDraft.query.trim();
    setQuickStopSuggestions([]);
    setQuickStopError("");
    if (tripsView !== "quickAdd" || query.length < 2 || quickStopDraft.place) {
      setQuickStopSearching(false);
      return;
    }
    setQuickStopSearching(true);
    quickStopDebounceRef.current = setTimeout(async () => {
      try {
        const results = await searchPlaces(query);
        if (!cancelled) setQuickStopSuggestions(Array.isArray(results) ? results : []);
      } catch {
        if (!cancelled) setQuickStopError("Couldn't search places. Try again.");
      } finally { if (!cancelled) setQuickStopSearching(false); }
    }, 350);
    return () => {
      cancelled = true;
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

  function openQuickStop(trip?: Trip) {
    const defaultTrip = trip || null;
    setQuickStopReturnView(trip ? "details" : "list");
    setShowQuickStopTripPicker(false);
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
    if (!defaultTrip && allTrips.length) setShowQuickStopTripPicker(true);
  }

  function startFocusedTripEdit(trip: Trip) {
    const open = () => {
      setExpandedMoreTripId(null);
      startTripEdit(trip);
      setTripEditorStep("basic");
      setShowManualRouteEditor(false);
      setTripsView("edit");
    };
    if (hasDraft || tripEditingId) {
      Alert.alert("Replace unfinished edit?", "Your current draft will be replaced with the saved trip.", [
        { text: "Keep draft", style: "cancel" },
        { text: "Replace draft", style: "destructive", onPress: open },
      ]);
    } else open();
  }

  function openTripDetails(trip: Trip) {
    setExpandedMoreTripId(null);
    setDetailTripId(trip.id);
    setDetailSection("Itinerary");
    setTripsView("details");
  }

  function closeTripDetails() {
    setDetailTripId(null);
    setTripsView("list");
  }

  function toggleBasicDateField(field: BasicTripDateField) {

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
    if (tripSaveLock.current) return;
    tripSaveLock.current = true;
    setTripSaving(true);
    try {
      const saved = await handleSaveTrip();
      if (saved) {
        setDetailTripId(saved.id);
        setTripsView("details");
        setTripEditorStep("basic");
        setShowManualRouteEditor(false);
      }
    } finally { tripSaveLock.current = false; setTripSaving(false); }
  }

  function requestQuickStopBack() {
    if (quickStopSaveLock.current) return;
    if (!quickStopDraft.query.trim() && !quickStopDraft.notes.trim()) { setTripsView(quickStopReturnView); return; }
    Alert.alert("Discard stop?", "This stop hasn't been saved yet.", [
      { text: "Keep Editing", style: "cancel" },
      { text: "Discard", style: "destructive", onPress: () => setTripsView(quickStopReturnView) },
    ]);
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
    const targetTrip = allTrips.find((trip) => trip.id === quickStopDraft.tripId);
    if (!targetTrip) {
      setQuickStopError("Choose a trip for this quick stop.");
      return;
    }
    if (!quickStopDraft.place) {
      setQuickStopError("Search and choose a place before saving.");
      return;
    }

    if (quickStopSaveLock.current) return;
    quickStopSaveLock.current = true;
    setQuickStopSaving(true);
    let saved = false;
    try {
      saved = await saveQuickStopToTrip({
        tripId: targetTrip.id,
        place: quickStopDraft.place,
        label: quickStopDraft.label.trim() || quickStopDraft.place.display_name.split(",")[0].trim() || "Stop",
        notes: quickStopDraft.notes,
      });
    } finally {
      quickStopSaveLock.current = false;
      setQuickStopSaving(false);
    }

    if (saved) {
      setQuickStopDraft({ tripId: null, query: "", label: "", notes: "", place: null });
      setQuickStopSuggestions([]);
      setQuickStopError("");
      if (quickStopReturnView === "details") setDetailTripId(targetTrip.id);
      setTripsView(quickStopReturnView);
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
              onPress={() => toggleBasicDateField("start_date")}
            />
            <DateSelectorButton
              styles={styles}
              label="End"
              value={tripDraft.end_date}
              active={activeBasicDateField === "end_date"}
              onPress={() => toggleBasicDateField("end_date")}
            />
          </View>
          <View>
            <Text style={styles.helperText}>
              {activeBasicDateField
                ? `Pick the ${activeBasicDateField === "start_date" ? "start" : "end"} date from the calendar below.`
                : "Tap Start or End to choose optional dates."}
            </Text>
          </View>
          {activeBasicDateField ? (
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
            <Text style={styles.helperText}>Dates are optional. You can keep planned dates or clear them in the date picker.</Text>
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
            {hasDraft || tripEditingId ? <Pressable accessibilityRole="button" style={styles.tripActionButton} onPress={() => setTripsView(tripEditingId ? "edit" : "new")}><Text style={styles.tripActionText}>Continue draft</Text></Pressable> : null}
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
    const canSaveQuickStop = Boolean(selectedQuickTrip && quickStopDraft.place && !quickStopSaving);

    return (
      <View style={styles.panel}>
        <View style={styles.sectionHeader}>
          <Pressable accessibilityRole="button" accessibilityLabel={quickStopReturnView === "details" ? "Back to trip details" : "Back to trips list"} style={styles.textButton} onPress={requestQuickStopBack}>
            <Text style={styles.textButtonLabel}>Back</Text>
          </Pressable>
          <View style={styles.rowCardText}>
            <Text style={styles.sectionTitle}>Add Stop</Text>
            <Text style={styles.meta}>Save a place fast, then keep moving.</Text>
          </View>
        </View>

        <View style={styles.formBlock}>
          <View style={styles.filterGroup}>
            <Text style={styles.filterGroupTitle}>Adding to</Text>
            <View style={styles.rowCard}>
              <View style={styles.rowCardText}>
                <Text style={styles.cardTitleSmall}>{selectedQuickTrip?.title || "Choose a trip"}</Text>
                <Text style={styles.cardMeta}>{selectedQuickTrip ? tripPickerDateLabel(selectedQuickTrip, formatDateRange) : "Create a trip before adding quick stops."}</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Change trip for quick stop"
                disabled={!allTrips.length}
                accessibilityState={{ disabled: !allTrips.length }}
                style={[styles.tripActionButton, !allTrips.length && styles.disabled]}
                onPress={() => setShowQuickStopTripPicker(true)}
              >
                <Text style={styles.tripActionText}>Change</Text>
              </Pressable>
            </View>
          </View>
          {showQuickStopTripPicker ? (
            <QuickStopTripPicker
              trips={allTrips}
              selectedTripId={quickStopDraft.tripId}
              formatDateRange={formatDateRange}
              onClose={() => setShowQuickStopTripPicker(false)}
              onSelect={(trip) => {
                setQuickStopDraft((prev) => ({ ...prev, tripId: trip.id }));
                setQuickStopError("");
                setShowQuickStopTripPicker(false);
              }}
            />
          ) : null}

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
            label="Stop name"
            value={quickStopDraft.label}
            onChangeText={(label) => setQuickStopDraft((prev) => ({ ...prev, label }))}
            placeholder="Snack stop, museum, hotel..."
          />
          <Field
            label="Note (optional)"
            value={quickStopDraft.notes}
            onChangeText={(notes) => setQuickStopDraft((prev) => ({ ...prev, notes }))}
            multiline
            placeholder="One quick reminder..."
          />

          <Text style={styles.helperText} accessibilityLiveRegion="polite">
            {selectedQuickTrip ? `Saving this stop to ${selectedQuickTrip.title} · ${tripPickerDateLabel(selectedQuickTrip, formatDateRange)}` : "Choose a trip before saving."}
          </Text>
          <View style={styles.actionRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Save quick stop"
              accessibilityState={{ disabled: !canSaveQuickStop }}
              disabled={!canSaveQuickStop}
              style={[styles.primaryButton, !canSaveQuickStop && styles.disabled]}
              onPress={() => void saveQuickStop()}
            >
              <Text style={styles.primaryButtonText}>{quickStopSaving ? "Saving…" : "Save Stop"}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Cancel quick stop" style={styles.secondaryButton} onPress={requestQuickStopBack}>
              <Text style={styles.secondaryButtonText}>Cancel</Text>
            </Pressable>
          </View>
          <Text style={styles.helperText}>Search for a place and choose a result before saving your stop.</Text>
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
              <Text style={styles.primaryButtonText}>{tripSaving ? "Saving…" : isEditingTrip ? "Save Changes" : "Create Trip"}</Text>
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
          <Text style={styles.cardMeta}>{detailRouteStops.length} places · {detailTrip.people.length} travelers</Text>
          <Text style={styles.cardText}>{detailTrip.notes || "No notes saved."}</Text>
          <View style={styles.actionRowWrap}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Add quick stop to ${detailTrip.title}`}
              style={styles.tripActionButton}
              onPress={() => openQuickStop(detailTrip)}
            >
              <Text style={styles.tripActionText}>Add Stop</Text>
            </Pressable>
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
              <Text style={styles.tripActionText}>Calendar</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.plannerDetailTabs}>
          {(["Itinerary", "Places", "Stays"] as const).map((section) => <Pressable key={section} accessibilityRole="button" accessibilityLabel={`Show trip ${section.toLowerCase()}`} accessibilityState={{ selected: detailSection === section }} style={[styles.plannerDetailTab, detailSection === section && styles.plannerDetailTabActive]} onPress={() => setDetailSection(section)}><Text style={[styles.plannerDetailTabText, detailSection === section && styles.plannerDetailTabTextActive]}>{section}</Text></Pressable>)}
        </View>

        <View style={styles.inlineCard}>
          <Text style={styles.cardTitleSmall}>People</Text>
          <Text style={styles.cardText}>{detailTrip.people.length ? detailTrip.people.join(", ") : "No people saved."}</Text>
        </View>

        {detailSection === "Places" ? <View style={styles.inlineCard}>
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
        </View> : null}

        {detailSection === "Stays" ? <View style={styles.inlineCard}>
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
        </View> : null}

        {detailSection === "Itinerary" ? <View style={styles.inlineCard}>
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
        </View> : null}
      </View>
    );
  }

  return (
    <View style={styles.panel}>
      <Text style={styles.plannerEyebrow}>YOUR FAMILY WORKSPACE</Text>
      <View style={styles.plannerStats}>
        <View style={styles.plannerStat}><Text style={styles.plannerStatValue}>{allTrips.length}</Text><Text style={styles.meta}>All trips</Text></View>
        <View style={styles.plannerStat}><Text style={styles.plannerStatValue}>{allTrips.filter((trip) => trip.trip_kind === "past").length}</Text><Text style={styles.meta}>Past trips</Text></View>
        <View style={styles.plannerStat}><Text style={styles.plannerStatValue}>{allTrips.filter((trip) => trip.trip_kind === "wishlist").length}</Text><Text style={styles.meta}>Wishlist</Text></View>
      </View>
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
      <Field label="Search trips" value={tripSearch} onChangeText={setTripSearch} placeholder="Search trips, people, or places" />
      {activeFilterCount ? <Text style={styles.filterSummaryLine}>{filterSummary}</Text> : null}
      <View style={styles.actionRowWrap}>
        {([['cards', 'List'], ['timeline', 'Timeline']] as const).map(([mode, label]) => (
          <Pressable key={mode} accessibilityRole="button" accessibilityLabel={`Show trip ${label.toLowerCase()}`}
            accessibilityState={{ selected: tripListMode === mode }}
            style={[styles.tripActionButton, tripListMode === mode && styles.filterChipActive]}
            onPress={() => setTripListMode(mode)}>
            <Text style={[styles.tripActionText, tripListMode === mode && styles.filterChipTextActive]}>{label}</Text>
          </Pressable>
        ))}
        <Pressable accessibilityRole="button" accessibilityLabel={selectionMode ? 'Finish selecting trips' : 'Select trips for map'}
          style={styles.tripActionButton} onPress={() => { setSelectionMode(!selectionMode); clearTripSelections(); }}>
          <Text style={styles.tripActionText}>{selectionMode ? 'Done' : 'Select'}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Quick add a stop"
          style={styles.tripActionButton}
          onPress={() => openQuickStop()}
        >
          <Text style={styles.tripActionText}>Add Stop</Text>
        </Pressable>
      </View>

      {selectionMode && selectedTripIds.length ? (
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
                            {selectionMode ? <Text style={styles.selectedBadge}>{isSelected ? "☑ Selected" : "☐ Select"}</Text> : null}
                            <Text style={styles.badge}>{trip.trip_kind === "wishlist" ? "Wishlist" : "Past"}</Text>
                          </View>
                        </View>
                        <Text style={styles.cardMeta}>{formatDateRange(trip.start_date, trip.end_date)}</Text>
                        {trip.people.length ? <Text style={styles.cardMeta}>{trip.people.join(", ")}</Text> : null}
                      </Pressable>
                      <View style={styles.actionRowWrap}>
                        {selectionMode ? <Pressable
                          accessibilityRole="checkbox"
                          accessibilityLabel={`${isSelected ? "Unselect" : "Select"} ${trip.title}`}
                          accessibilityState={{ checked: isSelected }}
                          style={styles.tripActionButton}
                          onPress={() => toggleTripSelection(trip.id)}
                        >
                          <Text style={styles.tripActionText}>{isSelected ? "☑ Selected" : "☐ Select"}</Text>
                        </Pressable> : null}
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
              accessibilityRole={selectionMode ? "checkbox" : "button"}
              accessibilityLabel={selectionMode ? `${isSelected ? "Unselect" : "Select"} ${trip.title}` : `Open ${trip.title}`}
              accessibilityState={selectionMode ? { checked: isSelected } : undefined}
              onPress={() => selectionMode ? toggleTripSelection(trip.id) : openTripDetails(trip)}
            >
              <View style={styles.cardTop}>
                <Text style={styles.cardTitle}>{trip.title}</Text>
                <View style={styles.badgeRow}>
                  {selectionMode ? <Text style={styles.selectedBadge}>{isSelected ? "☑ Selected" : "☐ Select"}</Text> : null}
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
