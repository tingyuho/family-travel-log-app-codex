import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import {
  API_BASE,
  createPackingTemplate,
  createPeopleProfile,
  createTrip,
  deletePackingTemplate,
  deletePeopleProfile,
  deleteTrip,
  fetchMe,
  login,
  logout,
  register,
  reorderPeopleProfiles,
  requestPasswordReset,
  resetPassword,
  updateMyProfile,
  updatePackingTemplate,
  updatePeopleProfile,
  updateTrip,
  type PlaceSuggestion,
  type Trip,
} from "./api";
import {
  emptyAccommodation,
  emptyItinerary,
  emptyPackingDraft,
  emptyPersonDraft,
  emptyResetForm,
  type Tab,
} from "./forms";
import { useAppDataLoader } from "./hooks/useAppDataLoader";
import { useAuthSession } from "./hooks/useAuthSession";
import { useCalendarActions } from "./hooks/useCalendarActions";
import { useFamilyProfiles } from "./hooks/useFamilyProfiles";
import { useMapSelection } from "./hooks/useMapSelection";
import { usePacking } from "./hooks/usePacking";
import { useTripFilters } from "./hooks/useTripFilters";
import { useTrips } from "./hooks/useTrips";
import { useTripWorkflow } from "./hooks/useTripWorkflow";
import { getOrderedRoutePoints } from "./mapLayers";
import { messageFromError } from "./messageFromError";
import MapScreen from "./screens/MapScreen";
import ProfileScreen from "./screens/ProfileScreen";
import TripsScreen from "./screens/TripsScreen";
import type { FieldProps } from "./screenTypes";
import {
  buildTripPayload,
  formatDateRange,
  hasTripValidationErrors,
  isInvalidDateRange,
  isValidEmail,
  normalizeText,
  parseItems,
  validateTripDraft,
} from "./utils";

export default function App() {
  const {
    authMode,
    setAuthMode,
    userId,
    setUserId,
    email,
    setEmail,
    password,
    setPassword,
    confirmPassword,
    setConfirmPassword,
    sessionUser,
    setSessionUser,
    profileEmail,
    setProfileEmail,
    profileResetForm,
    setProfileResetForm,
    profileResetCodeSent,
    setProfileResetCodeSent,
    resetForm,
    setResetForm,
    resetCodeSent,
    setResetCodeSent,
  } = useAuthSession();

  const [activeTab, setActiveTab] = useState<Tab>("trips");
  const [tripDetailsRequestId, setTripDetailsRequestId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const { trips, setTrips, clearTrips } = useTrips();

  const {
    tripSearch,
    setTripSearch,
    tripSort,
    setTripSort,
    tripFilterKind,
    setTripFilterKind,
    tripPeopleFilter,
    setTripPeopleFilter,
    displayedTrips,
    upcomingTrips,
  } = useTripFilters(trips);

  const {
    selectedTripId,
    setSelectedTripId,
    selectedTripIds,
    setSelectedTripIds,
    selectedTrips,
    selectedStopLabel,
    setSelectedStopLabel,
    selectedTrip,
    toggleTripSelection,
    clearTripSelections,
    selectOnlyTrip,
  } = useMapSelection(trips);
  const mapTrips = selectedTripIds.length ? selectedTrips : displayedTrips;

  const {
    tripDraft,
    setTripDraft,
    tripFormValidation,
    setTripFormValidation,
    tripEditingId,
    setTripEditingId,
    routeQuery,
    setRouteQuery,
    routeSuggestions,
    routeSearching,
    startTripEdit: beginTripEdit,
    resetTripEditor,
    appendRouteSuggestion,
    removeRouteStop,
  } = useTripWorkflow({
    userId: sessionUser,
    onError: (e, context = "default") => setError(messageFromError(e, context)),
  });

  const {
    people,
    setPeople,
    clearPeople,
    personDraft,
    setPersonDraft,
    personEditingId,
    setPersonEditingId,
    startPersonEdit,
    resetPersonEditor,
  } = useFamilyProfiles();

  const {
    packingTemplates,
    setPackingTemplates,
    clearPackingTemplates,
    packingDraft,
    setPackingDraft,
    packingEditingId,
    setPackingEditingId,
    activePackingTemplateId,
    setActivePackingTemplateId,
    activePackingTemplate,
    checkedPackingItems,
    setCheckedPackingItems,
    startPackingEdit,
    resetPackingEditor,
    togglePackingItem,
  } = usePacking(sessionUser);

  const { loadAll, refresh, refreshing } = useAppDataLoader({
    setTrips,
    setPeople,
    setPackingTemplates,
    setProfileEmail,
    onRefreshStart: () => setError(null),
    onError: (e) => setError(messageFromError(e)),
  });

  const { openGoogleCalendarForTrip } = useCalendarActions({
    onError: (e) => setError(messageFromError(e)),
  });

  useEffect(() => {
    if (!sessionUser) return;
    void bootstrapSession();
  }, []);

  useEffect(() => {
    if (!sessionUser) return;
    setProfileResetForm((prev) => ({ ...prev, user_id: sessionUser }));
  }, [sessionUser, setProfileResetForm]);
  async function bootstrapSession() {
    setBusy(true);
    setError(null);
    try {
      const me = await fetchMe();
      setSessionUser(me.user_id);
      setProfileEmail(me.email || "");
      await loadAll({ surfacePartialErrors: true });
    } catch (e) {
      setSessionUser("");
      setError(messageFromError(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleAuth() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const trimmedUserId = userId.trim();
      if (authMode === "register") {
        if (password !== confirmPassword) {
          throw new Error("Passwords do not match.");
        }
        await register({ user_id: trimmedUserId, email: email.trim(), password });
      } else {
        await login({ user_id: trimmedUserId, password });
      }
      setSessionUser(trimmedUserId);
      setPassword("");
      setConfirmPassword("");
      await loadAll({ surfacePartialErrors: true });
    } catch (e) {
      setError(messageFromError(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleRequestPasswordResetCode() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const nextUserId = (resetForm.user_id || userId).trim();
      await requestPasswordReset({ user_id: nextUserId });
      setResetCodeSent(true);
      setResetForm((prev) => ({ ...prev, user_id: nextUserId }));
      setNotice("Verification code sent. Check your email.");
    } catch (e) {
      setError(messageFromError(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleResetPassword() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (resetForm.new_password !== resetForm.confirm_password) {
        throw new Error("New passwords do not match.");
      }
      await resetPassword({
        user_id: resetForm.user_id.trim(),
        email_code: resetForm.email_code.trim(),
        new_password: resetForm.new_password,
        reset_key: resetForm.reset_key.trim(),
      });
      setResetCodeSent(false);
      setResetForm(emptyResetForm);
      setAuthMode("login");
      setNotice("Password reset complete.");
    } catch (e) {
      setError(messageFromError(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleLogout() {
    setBusy(true);
    try {
      await logout();
      setSessionUser("");
      setActiveTab("trips");
      clearTrips();
      clearPeople();
      clearPackingTemplates();
      setCheckedPackingItems({});
    } catch (e) {
      setError(messageFromError(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveProfile() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (!isValidEmail(profileEmail)) {
        throw new Error("Please enter a valid email.");
      }
      const updated = await updateMyProfile({ email: profileEmail.trim() });
      setProfileEmail(updated.email || "");
      setNotice("Profile updated.");
    } catch (e) {
      setError(messageFromError(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleProfileRequestReset() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await requestPasswordReset({ user_id: sessionUser });
      setProfileResetCodeSent(true);
      setNotice("Verification code sent to your account email.");
    } catch (e) {
      setError(messageFromError(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleProfileResetPassword() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (profileResetForm.new_password !== profileResetForm.confirm_password) {
        throw new Error("New passwords do not match.");
      }
      await resetPassword({
        user_id: sessionUser,
        email_code: profileResetForm.email_code.trim(),
        new_password: profileResetForm.new_password,
        reset_key: profileResetForm.reset_key.trim(),
      });
      setProfileResetCodeSent(false);
      setProfileResetForm({ ...emptyResetForm, user_id: sessionUser });
      setNotice("Password reset complete.");
    } catch (e) {
      setError(messageFromError(e));
    } finally {
      setBusy(false);
    }
  }

  function startTripEdit(trip: Trip) {
    beginTripEdit(trip);
    setSelectedTripId(trip.id);
    setActiveTab("trips");
  }

  function openMapForTrip(trip: Trip) {
    selectOnlyTrip(trip.id);
    setActiveTab("map");
  }

  async function handleSaveTrip() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const validation = validateTripDraft(tripDraft);
      setTripFormValidation(validation);
      if (hasTripValidationErrors(validation)) {
        throw new Error("Please fix the highlighted trip form errors before saving.");
      }
      if (isInvalidDateRange(tripDraft.start_date, tripDraft.end_date)) {
        throw new Error("Trip end date cannot be before start date.");
      }
      const payload = buildTripPayload(tripDraft);
      let savedTrip: Trip;
      if (tripEditingId) {
        savedTrip = await updateTrip(tripEditingId, payload);
        setNotice("Trip updated.");
      } else {
        savedTrip = await createTrip(payload);
        setNotice("Trip created.");
      }
      resetTripEditor();
      await loadAll({ surfacePartialErrors: true });
      selectOnlyTrip(savedTrip.id);
      return true;
    } catch (e) {
      setError(messageFromError(e));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function handleQuickAddStop({
    tripId,
    place,
    label,
    notes,
  }: {
    tripId: number;
    place: PlaceSuggestion;
    label: string;
    notes: string;
  }) {
    const trip = trips.find((item) => item.id === tripId);
    if (!trip) {
      setError("Choose an existing trip before saving a quick stop.");
      return false;
    }

    const lat = Number(place.lat);
    const lng = Number(place.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      setError("This place is missing usable map coordinates.");
      return false;
    }

    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const route = getOrderedRoutePoints(trip.route);
      const cleanLabel = label.trim() || place.display_name.split(",")[0].trim() || "Quick stop";
      const today = getTodayIsoDate();
      const now = getCurrentTimeText();
      const noteText = notes.trim();
      const nextTrip = await updateTrip(trip.id, {
        title: trip.title,
        trip_kind: trip.trip_kind,
        start_date: trip.start_date || null,
        end_date: trip.end_date || null,
        notes: trip.notes || "",
        route: [
          ...route,
          {
            lat,
            lng,
            label: cleanLabel,
            order: route.length,
          },
        ],
        people: trip.people,
        accommodations: trip.accommodations,
        itinerary: noteText
          ? [
              ...trip.itinerary,
              {
                date: today,
                time: now,
                activity: cleanLabel,
                location: place.display_name,
                notes: noteText,
              },
            ]
          : trip.itinerary,
      });
      await loadAll({ surfacePartialErrors: true });
      selectOnlyTrip(nextTrip.id);
      setNotice("Quick stop saved.");
      return true;
    } catch (e) {
      setError(messageFromError(e));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function confirmDeleteTrip(id: number) {
    Alert.alert("Delete trip?", "This removes the trip from the shared database.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          void deleteTrip(id)
            .then(async () => {
              if (selectedTripId === id) setSelectedTripId(null);
              setSelectedTripIds((prev) => prev.filter((tripId) => tripId !== id));
              await loadAll({ surfacePartialErrors: true });
            })
            .catch((e) => setError(messageFromError(e)));
        },
      },
    ]);
  }

  async function handleSavePerson() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const payload = {
        name: personDraft.name.trim(),
        relationship: personDraft.relationship.trim(),
        notes: personDraft.notes.trim(),
      };
      if (!payload.name) throw new Error("Name is required.");
      if (personEditingId) {
        await updatePeopleProfile(personEditingId, payload);
        setNotice("Person updated.");
      } else {
        await createPeopleProfile(payload);
        setNotice("Person added.");
      }
      resetPersonEditor();
      await loadAll({ surfacePartialErrors: true });
    } catch (e) {
      setError(messageFromError(e));
    } finally {
      setBusy(false);
    }
  }

  async function reorderPerson(personId: number, targetIndex: number) {
    const index = people.findIndex((person) => person.id === personId);
    if (index < 0) return;
    const target = Math.max(0, Math.min(targetIndex, people.length - 1));
    if (target === index) return;
    const reordered = [...people];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(target, 0, moved);
    setBusy(true);
    setError(null);
    try {
      await reorderPeopleProfiles(reordered.map((item) => item.id));
      await loadAll({ surfacePartialErrors: true });
    } catch (e) {
      setError(messageFromError(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleSavePacking() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const payload = {
        name: packingDraft.name.trim(),
        items: parseItems(packingDraft.itemsText),
      };
      if (!payload.name) throw new Error("Template name is required.");
      let templateId = activePackingTemplateId;
      if (packingEditingId) {
        const updated = await updatePackingTemplate(packingEditingId, payload);
        templateId = updated.id;
        setNotice("Packing template updated.");
      } else {
        const created = await createPackingTemplate(payload);
        templateId = created.id;
        setNotice("Packing template created.");
      }
      resetPackingEditor();
      await loadAll({ surfacePartialErrors: true });
      if (templateId) setActivePackingTemplateId(templateId);
    } catch (e) {
      setError(messageFromError(e));
    } finally {
      setBusy(false);
    }
  }

  if (!sessionUser) {
    const showReset = authMode === "reset";
    return (
      <SafeAreaProvider>
        <SafeAreaView style={styles.screen}>
          <StatusBar style="dark" />
          <ScrollView contentContainerStyle={styles.authContent} keyboardShouldPersistTaps="handled">
            <Text style={styles.brand}>Family Travel Log</Text>
            <Text style={styles.authTitle}>
              {showReset ? "Reset password" : authMode === "login" ? "Welcome back" : "Create account"}
            </Text>
            <Text style={styles.meta}>API: {API_BASE}</Text>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            {notice ? <Text style={styles.notice}>{notice}</Text> : null}

            {!showReset ? (
              <>
                <View style={styles.segment}>
                  <SegmentButton label="Login" active={authMode === "login"} onPress={() => setAuthMode("login")} />
                  <SegmentButton label="Register" active={authMode === "register"} onPress={() => setAuthMode("register")} />
                </View>
                <Field label="User ID" testID="auth-user-id" value={userId} onChangeText={setUserId} autoCapitalize="none" />
                {authMode === "register" ? (
                  <Field
                    label="Email"
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    keyboardType="email-address"
                  />
                ) : null}
                <Field label="Password" testID="auth-password" value={password} onChangeText={setPassword} secureTextEntry />
                {authMode === "register" ? (
                  <Field
                    label="Confirm Password"
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    secureTextEntry
                  />
                ) : null}
                <Pressable
                  testID="auth-submit"
                  accessibilityRole="button"
                  accessibilityLabel={authMode === "login" ? "Login" : "Register"}
                  accessibilityState={{ disabled: busy }}
                  style={[styles.primaryButton, busy && styles.disabled]}
                  onPress={handleAuth}
                  disabled={busy}
                >
                  {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>{authMode === "login" ? "Login" : "Register"}</Text>}
                </Pressable>
                {authMode === "login" ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Forgot password"
                    onPress={() => {
                      setAuthMode("reset");
                      setResetCodeSent(false);
                      setResetForm({ ...emptyResetForm, user_id: userId.trim() });
                    }}
                  >
                    <Text style={styles.linkText}>Forgot password? Reset it</Text>
                  </Pressable>
                ) : null}
              </>
            ) : (
              <>
                <Field
                  label="User ID"
                  value={resetForm.user_id}
                  onChangeText={(nextUserId) => setResetForm((prev) => ({ ...prev, user_id: nextUserId }))}
                  autoCapitalize="none"
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Send password verification code"
                  accessibilityState={{ disabled: busy }}
                  style={[styles.secondaryButton, busy && styles.disabled]}
                  onPress={handleRequestPasswordResetCode}
                  disabled={busy}
                >
                  <Text style={styles.secondaryButtonText}>Send Verification Code</Text>
                </Pressable>
                {resetCodeSent ? <Text style={styles.helperText}>Check your email for the code.</Text> : null}
                <Field
                  label="Email Verification Code"
                  value={resetForm.email_code}
                  onChangeText={(email_code) => setResetForm((prev) => ({ ...prev, email_code }))}
                  autoCapitalize="none"
                />
                <Field
                  label="New Password"
                  value={resetForm.new_password}
                  onChangeText={(new_password) => setResetForm((prev) => ({ ...prev, new_password }))}
                  secureTextEntry
                />
                <Field
                  label="Confirm New Password"
                  value={resetForm.confirm_password}
                  onChangeText={(confirm_password) => setResetForm((prev) => ({ ...prev, confirm_password }))}
                  secureTextEntry
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Reset password"
                  accessibilityState={{ disabled: busy }}
                  style={[styles.primaryButton, busy && styles.disabled]}
                  onPress={handleResetPassword}
                  disabled={busy}
                >
                  <Text style={styles.primaryButtonText}>Reset Password</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Back to login"
                  onPress={() => {
                    setAuthMode("login");
                    setResetCodeSent(false);
                  }}
                >
                  <Text style={styles.linkText}>Back to login</Text>
                </Pressable>
              </>
            )}
          </ScrollView>
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.screen} edges={activeTab === "map" ? ["top", "left", "right"] : undefined}>
        <StatusBar style="dark" />
        <View style={styles.header}>
          <View>
            <Text style={styles.brandSmall}>Family Travel Log</Text>
            <Text style={styles.meta}>Signed in as {sessionUser}</Text>
          </View>
          <View style={styles.headerActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open Family Hub"
              accessibilityState={{ selected: activeTab === "hub" }}
              style={[styles.textButton, activeTab === "hub" && styles.headerButtonActive]}
              onPress={() => setActiveTab("hub")}
            >
              <Text style={styles.textButtonLabel}>Family Hub</Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Logout" style={styles.textButton} onPress={handleLogout}>
              <Text style={styles.textButtonLabel}>Logout</Text>
            </Pressable>
          </View>
        </View>

        {error ? <Text style={styles.inlineError}>{error}</Text> : null}
        {notice ? <Text style={styles.inlineNotice}>{notice}</Text> : null}

        <View style={styles.tabs}>
          <TabButton
            label="Trips"
            active={activeTab === "trips"}
            onPress={() => setActiveTab("trips")}
          />
          <TabButton
            label="Map"
            active={activeTab === "map"}
            onPress={() => setActiveTab("map")}
          />
        </View>

        {activeTab === "map" ? (
          <View style={styles.content}>
            {busy ? <ActivityIndicator style={styles.loader} /> : null}
            <MapScreen
              styles={styles}
              trips={mapTrips}
              selectedTripCount={selectedTripIds.length}
              selectedTrip={selectedTrip}
              selectedTripId={selectedTripId}
              selectedStopLabel={selectedStopLabel}
              tripFilterKind={tripFilterKind}
              setTripFilterKind={setTripFilterKind}
              onSelectTrip={(tripId, stopLabel) => {
                setSelectedTripId(tripId);
                setSelectedStopLabel(stopLabel || "");
              }}
              formatDateRange={formatDateRange}
              openTrips={() => {
                if (selectedTripId) setTripDetailsRequestId(selectedTripId);
                setActiveTab("trips");
              }}
            />
          </View>
        ) : (
          <ScrollView
            style={styles.content}
            contentContainerStyle={styles.contentInner}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
            keyboardShouldPersistTaps="handled"
          >
            {busy ? <ActivityIndicator style={styles.loader} /> : null}

            {activeTab === "trips" ? (
              <View style={styles.summaryBar}>
                <Text style={styles.summaryText}>
                  Trips {trips.length} | Wishlist {upcomingTrips} | People {people.length} | Packing {packingTemplates.length}
                </Text>
              </View>
            ) : null}

            {activeTab === "trips" ? (
              <TripsScreen
                styles={styles}
                Field={Field}
                SegmentButton={SegmentButton}
                tripEditingId={tripEditingId}
                tripDraft={tripDraft}
                setTripDraft={setTripDraft}
                tripSearch={tripSearch}
                setTripSearch={setTripSearch}
                tripFilterKind={tripFilterKind}
                setTripFilterKind={setTripFilterKind}
                tripSort={tripSort}
                setTripSort={setTripSort}
                people={people}
                tripPeopleFilter={tripPeopleFilter}
                setTripPeopleFilter={setTripPeopleFilter}
                normalizeText={normalizeText}
                routeQuery={routeQuery}
                setRouteQuery={setRouteQuery}
                routeSearching={routeSearching}
                routeSuggestions={routeSuggestions}
                appendRouteSuggestion={appendRouteSuggestion}
                removeRouteStop={removeRouteStop}
                emptyAccommodation={emptyAccommodation}
                emptyItinerary={emptyItinerary}
                handleSaveTrip={handleSaveTrip}
                resetTripEditor={resetTripEditor}
                isInvalidDateRange={isInvalidDateRange}
                allTrips={trips}
                displayedTrips={displayedTrips}
                selectedTripIds={selectedTripIds}
                toggleTripSelection={toggleTripSelection}
                clearTripSelections={clearTripSelections}
                formatDateRange={formatDateRange}
                startTripEdit={startTripEdit}
                viewSelectedTripsOnMap={() => setActiveTab("map")}
                openMapForTrip={openMapForTrip}
                openGoogleCalendarForTrip={openGoogleCalendarForTrip}
                confirmDeleteTrip={confirmDeleteTrip}
                saveQuickStopToTrip={handleQuickAddStop}
                tripFormValidation={tripFormValidation}
                detailsTripId={tripDetailsRequestId}
                onDetailsTripOpened={() => setTripDetailsRequestId(null)}
              />
            ) : null}

            {activeTab === "hub" ? (
              <ProfileScreen
                styles={styles}
                Field={Field}
                sessionUser={sessionUser}
                profileEmail={profileEmail}
                setProfileEmail={setProfileEmail}
                handleSaveProfile={handleSaveProfile}
                handleProfileRequestReset={handleProfileRequestReset}
                profileResetCodeSent={profileResetCodeSent}
                profileResetForm={profileResetForm}
                setProfileResetForm={setProfileResetForm}
                handleProfileResetPassword={handleProfileResetPassword}
                trips={trips}
                formatDateRange={formatDateRange}
                openTripDetails={(tripId) => {
                  setTripDetailsRequestId(tripId);
                  setActiveTab("trips");
                }}
                viewTripsOnMap={(tripIds) => {
                  setSelectedTripIds(tripIds);
                  setSelectedTripId(tripIds[0] || null);
                  setSelectedStopLabel("");
                  setActiveTab("map");
                }}
                peopleProps={{
                  styles,
                  Field,
                  personEditingId,
                  personDraft,
                  setPersonDraft,
                  emptyPersonDraft,
                  handleSavePerson,
                  setPersonEditingId,
                  people,
                  startPersonEdit,
                  reorderPerson,
                  deletePeopleProfile,
                  loadAll,
                  setError,
                  messageFromError,
                }}
                packingProps={{
                  styles,
                  Field,
                  packingEditingId,
                  packingDraft,
                  setPackingDraft,
                  emptyPackingDraft,
                  handleSavePacking,
                  setPackingEditingId,
                  packingTemplates,
                  activePackingTemplateId,
                  setActivePackingTemplateId,
                  activePackingTemplate,
                  setCheckedPackingItems,
                  checkedPackingItems,
                  normalizeText,
                  togglePackingItem,
                  startPackingEdit,
                  deletePackingTemplate,
                  loadAll,
                  setError,
                  messageFromError,
                }}
              />
            ) : null}

          {activeTab === "trips" && selectedTrip && !selectedTripIds.length ? (
            <View style={styles.mapDetailCard}>
              <Text style={styles.formTitle}>Selected Trip</Text>
              <Text style={styles.cardTitle}>{selectedTrip.title}</Text>
              <Text style={styles.cardMeta}>{formatDateRange(selectedTrip.start_date, selectedTrip.end_date)}</Text>
              {selectedStopLabel ? <Text style={styles.cardText}>Focused stop: {selectedStopLabel}</Text> : null}
            </View>
          ) : null}
          </ScrollView>
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function Field({
  label,
  value,
  onChangeText,
  multiline,
  editable = true,
  ...props
}: FieldProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        multiline={multiline}
        editable={editable}
        textAlignVertical={multiline ? "top" : "center"}
        style={[styles.input, multiline && styles.textarea, !editable && styles.disabledField]}
        accessibilityLabel={label}
        {...props}
      />
    </View>
  );
}

function TabButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const icon = label === "Trips" ? "☰" : "⌖";
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel={`${label} tab`}
      accessibilityState={{ selected: active }}
      style={[styles.tabButton, active && styles.tabButtonActive]}
      onPress={onPress}
    >
      <Text style={[styles.tabButtonIcon, active && styles.tabButtonTextActive]}>{icon}</Text>
    </Pressable>
  );
}

function SegmentButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      style={[styles.segmentButton, active && styles.segmentButtonActive]}
      onPress={onPress}
    >
      <Text style={[styles.segmentButtonText, active && styles.segmentButtonTextActive]}>{label}</Text>
    </Pressable>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function getTodayIsoDate() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
}

function getCurrentTimeText() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#FDFCF7" },
  authContent: { padding: 18, gap: 12 },
  brand: { marginTop: 24, fontSize: 34, fontWeight: "700", color: "#24323D" },
  brandSmall: { fontSize: 20, fontWeight: "700", color: "#24323D" },
  authTitle: { fontSize: 22, fontWeight: "700", color: "#24323D" },
  meta: { color: "#64748B", fontSize: 12 },
  header: { paddingHorizontal: 14, paddingTop: 8, paddingBottom: 6, flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 4 },
  headerButtonActive: { backgroundColor: "#EAF7F1", borderRadius: 8 },
  summaryBar: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: "#EAF7F1", borderColor: "#BDEBDB", borderWidth: 1 },
  summaryText: { color: "#24323D", fontWeight: "600", fontSize: 12 },
  statsRow: { flexDirection: "row", gap: 8, paddingHorizontal: 16 },
  stat: { flex: 1, backgroundColor: "#EAF7F1", borderColor: "#BDEBDB", borderWidth: 1, borderRadius: 8, padding: 12 },
  statValue: { fontSize: 20, fontWeight: "800", color: "#3A86FF" },
  statLabel: { color: "#64748B", marginTop: 2 },
  tabs: { flexDirection: "row", justifyContent: "center", paddingHorizontal: 14, paddingTop: 4, paddingBottom: 4, gap: 8 },
  tabButton: { width: 68, minHeight: 38, borderRadius: 999, borderColor: "#CFE4FF", borderWidth: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#FFFFFF" },
  tabButtonActive: { backgroundColor: "#3A86FF", borderColor: "#3A86FF" },
  tabButtonText: { color: "#24323D", fontWeight: "600" },
  tabButtonIcon: { color: "#24323D", fontSize: 20, fontWeight: "700", lineHeight: 22 },
  tabButtonTextActive: { color: "#FFFFFF" },
  content: { flex: 1 },
  contentInner: { padding: 12, paddingBottom: 32, gap: 10 },
  panel: { gap: 10 },
  mapScreen: { flex: 1, backgroundColor: "#EAF7F1", overflow: "hidden" },
  mapBaseLayer: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 },
  mapTopOverlay: { position: "absolute", top: 10, right: 10, left: 10, zIndex: 5, gap: 6 },
  mapModeRow: { flexDirection: "row", gap: 6, alignItems: "center", alignSelf: "flex-start" },
  mapModeChip: { minHeight: 34, borderWidth: 1, borderColor: "#CFE4FF", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5, backgroundColor: "rgba(255,255,255,0.96)", alignItems: "center", justifyContent: "center" },
  mapModeChipActive: { backgroundColor: "#24323D", borderColor: "#24323D" },
  mapModeChipText: { color: "#24323D", fontWeight: "800", fontSize: 12 },
  mapModeChipTextActive: { color: "#FFFFFF" },
  mapStatusRow: { flexDirection: "row", alignItems: "center" },
  mapStatusPill: { overflow: "hidden", minHeight: 34, borderRadius: 999, borderColor: "#CFE4FF", borderWidth: 1, backgroundColor: "rgba(255,255,255,0.96)", color: "#24323D", fontSize: 12, fontWeight: "700", paddingHorizontal: 12, paddingVertical: 7 },
  mapFilterRow: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  mapFilterChip: { minHeight: 34, borderWidth: 1, borderColor: "#CFE4FF", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: "rgba(255,255,255,0.96)", alignItems: "center", justifyContent: "center" },
  mapFilterChipActive: { backgroundColor: "#3A86FF", borderColor: "#3A86FF" },
  mapFilterChipText: { color: "#24323D", fontWeight: "600", fontSize: 12 },
  mapFilterChipTextActive: { color: "#FFFFFF" },
  mapBottomOverlay: { position: "absolute", right: 10, bottom: 12, left: 10, zIndex: 6 },
  mapBottomSheet: { borderTopLeftRadius: 8, borderTopRightRadius: 8, borderBottomLeftRadius: 8, borderBottomRightRadius: 8, borderColor: "#D8EAFE", borderWidth: 1, backgroundColor: "rgba(255,255,255,0.98)", paddingHorizontal: 12, paddingTop: 8, paddingBottom: 12, gap: 8, overflow: "hidden" },
  mapSheetHandle: { width: 42, height: 4, borderRadius: 2, backgroundColor: "#CBD5E1", alignSelf: "center" },
  mapSheetHeader: { minHeight: 70, justifyContent: "center", gap: 8 },
  mapSheetTitle: { color: "#24323D", fontSize: 17, fontWeight: "700" },
  mapSheetMeta: { color: "#64748B", fontSize: 12, fontWeight: "500", marginTop: 2 },
  mapSheetToggleText: { color: "#3A86FF", fontWeight: "700", paddingLeft: 10 },
  mapSheetBody: { gap: 6 },
  mapSheetPager: { flexDirection: "row", alignItems: "center", gap: 6 },
  mapSheetPagerText: { flex: 1, color: "#64748B", fontSize: 12, fontWeight: "700", textAlign: "center" },
  mapSheetAction: { minHeight: 42, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: "#EAF7F1", borderColor: "#3A86FF", borderWidth: 1, paddingHorizontal: 12 },
  mapSheetActionText: { color: "#3A86FF", fontWeight: "700" },
  mapScreenHeader: { gap: 8 },
  mapAlwaysOn: { paddingHorizontal: 16, paddingTop: 12 },
  mapPanel: { gap: 8 },
  mapPanelFull: { flex: 1 },
  mapPanelImmersive: { gap: 0 },
  mapPanelHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  mapTitle: { fontSize: 18, fontWeight: "700", color: "#24323D" },
  mapCount: { color: "#64748B", fontWeight: "500" },
  mapHint: { color: "#7A7165", fontSize: 12, fontWeight: "700" },
  mapLayerRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center" },
  mapLayerChip: { minHeight: 44, borderWidth: 1, borderColor: "#CFE4FF", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  mapLayerChipActive: { borderColor: "#3A86FF", backgroundColor: "#3A86FF" },
  mapLayerChipText: { color: "#24323D", fontWeight: "600" },
  mapLayerChipTextActive: { color: "#fff" },
  mapPerfHint: { color: "#64748B", fontWeight: "600", fontSize: 12 },
  mapShell: { height: 300, overflow: "hidden", borderRadius: 12, borderColor: "#CFE4FF", borderWidth: 1, backgroundColor: "#EAF7F1" },
  mapShellCompact: { height: 210 },
  mapShellFull: { flex: 1, minHeight: 360 },
  mapShellImmersive: { height: "100%", minHeight: 0, borderRadius: 0, borderWidth: 0 },
  mapView: { flex: 1 },
  clusterBubble: {
    minWidth: 34,
    minHeight: 34,
    borderRadius: 17,
    backgroundColor: "#3A86FF",
    alignItems: "center",
    justifyContent: "center",
    borderColor: "#fff",
    borderWidth: 2,
    paddingHorizontal: 8,
  },
  clusterBubbleText: { color: "#fff", fontWeight: "800", fontSize: 12 },
  mapDotMarker: { width: 14, height: 14, borderRadius: 7, backgroundColor: "#3A86FF", borderColor: "#FFFFFF", borderWidth: 2 },
  mapDotMarkerWishlist: { backgroundColor: "#FFBE0B" },
  mapDotMarkerSelected: { width: 18, height: 18, borderRadius: 9, backgroundColor: "#FF6B6B", borderWidth: 3 },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 },
  sectionTitle: { fontSize: 22, fontWeight: "700", color: "#24323D" },
  formBlock: { backgroundColor: "#FFFFFF", borderColor: "#D8EAFE", borderWidth: 1, borderRadius: 8, padding: 10, gap: 8 },
  formTitle: { fontSize: 16, fontWeight: "700", color: "#24323D" },
  filterSummaryLine: { color: "#64748B", fontSize: 12, fontWeight: "500", marginTop: -4 },
  filterGroup: { gap: 6 },
  filterGroupTitle: { color: "#24323D", fontSize: 13, fontWeight: "600" },
  field: { gap: 4 },
  label: { color: "#425466", fontWeight: "600" },
  input: { minHeight: 44, backgroundColor: "#FFFFFF", borderColor: "#CFE4FF", borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, color: "#24323D" },
  dateField: { flex: 1, minHeight: 44, backgroundColor: "#FFFFFF", borderColor: "#CFE4FF", borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, justifyContent: "center", gap: 4 },
  dateFieldActive: { borderColor: "#3A86FF", backgroundColor: "#F7FBFF" },
  dateFieldDisabled: { borderColor: "#D8EAFE", backgroundColor: "#F1F5F9" },
  dateFieldValue: { color: "#24323D", fontWeight: "600" },
  dateFieldPlaceholder: { color: "#9AA6B2", fontWeight: "500" },
  disabledField: { backgroundColor: "#F1F5F9", color: "#64748B" },
  textarea: { minHeight: 72, paddingTop: 8 },
  twoCol: { flexDirection: "row", gap: 8 },
  segment: { flexDirection: "row", gap: 6 },
  segmentWrap: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  editorStepRow: { flexDirection: "row", gap: 6, alignItems: "stretch" },
  editorStepButton: { flex: 1, minWidth: 0, minHeight: 44, borderWidth: 1, borderColor: "#CFE4FF", borderRadius: 999, paddingHorizontal: 6, paddingVertical: 6, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  editorStepButtonActive: { backgroundColor: "#3A86FF", borderColor: "#3A86FF" },
  editorStepButtonText: { color: "#24323D", fontWeight: "700", fontSize: 12 },
  editorStepButtonTextActive: { color: "#FFFFFF" },
  segmentButton: { flex: 1, minHeight: 44, borderColor: "#CFE4FF", borderWidth: 1, borderRadius: 8, paddingVertical: 8, alignItems: "center", justifyContent: "center", backgroundColor: "#FFFFFF" },
  segmentButtonActive: { backgroundColor: "#FFBE0B", borderColor: "#FFBE0B" },
  segmentButtonText: { color: "#24323D", fontWeight: "700" },
  segmentButtonTextActive: { color: "#ffffff" },
  filterChip: { minHeight: 44, borderWidth: 1, borderColor: "#CFE4FF", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  filterChipActive: { backgroundColor: "#3A86FF", borderColor: "#3A86FF" },
  filterChipText: { color: "#24323D", fontWeight: "700" },
  filterChipTextActive: { color: "#fff" },
  suggestionRow: { borderColor: "#CFE4FF", borderWidth: 1, borderRadius: 8, padding: 10, backgroundColor: "#FFFFFF" },
  actionRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  actionRowCompact: { flexDirection: "row", gap: 6, alignItems: "center", flexShrink: 0 },
  actionRowWrap: { flexDirection: "row", gap: 6, marginTop: 6, flexWrap: "wrap" },
  primaryButton: { minHeight: 44, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: "#3A86FF", paddingHorizontal: 12, flexGrow: 1 },
  primaryButtonText: { color: "#ffffff", fontWeight: "700" },
  primaryMiniButton: { minHeight: 44, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: "#3A86FF", paddingHorizontal: 10, paddingVertical: 8 },
  primaryMiniText: { color: "#FFFFFF", fontWeight: "700", fontSize: 12 },
  secondaryButton: { minHeight: 44, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: "#EAF7F1", borderColor: "#3A86FF", borderWidth: 1, paddingHorizontal: 12, flexGrow: 1 },
  secondaryButtonText: { color: "#3A86FF", fontWeight: "700" },
  textButton: { minHeight: 44, paddingHorizontal: 8, paddingVertical: 7, alignItems: "center", justifyContent: "center" },
  textButtonLabel: { color: "#3A86FF", fontWeight: "600" },
  actionMiniButton: { minHeight: 44, borderRadius: 8, borderColor: "#CFE4FF", borderWidth: 1, paddingHorizontal: 9, paddingVertical: 6, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  actionMiniButtonDanger: { minHeight: 44, borderRadius: 8, borderColor: "#FFB4B4", borderWidth: 1, paddingHorizontal: 9, paddingVertical: 6, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  actionMiniText: { color: "#24323D", fontWeight: "700", fontSize: 12 },
  actionMiniTextDanger: { color: "#E05252", fontWeight: "700", fontSize: 12 },
  tripActionButton: { minHeight: 34, borderRadius: 8, borderColor: "#CFE4FF", borderWidth: 1, paddingHorizontal: 9, paddingVertical: 3, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  tripActionButtonDanger: { minHeight: 34, borderRadius: 8, borderColor: "#FFB4B4", borderWidth: 1, paddingHorizontal: 9, paddingVertical: 3, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  tripActionText: { color: "#24323D", fontWeight: "600", fontSize: 12 },
  tripActionTextDanger: { color: "#E05252", fontWeight: "600", fontSize: 12 },
  disabled: { opacity: 0.65 },
  card: { backgroundColor: "#FFFFFF", borderColor: "#D8EAFE", borderWidth: 1, borderRadius: 8, padding: 10, gap: 4 },
  emptyState: { backgroundColor: "#FFFFFF", borderColor: "#D8EAFE", borderWidth: 1, borderRadius: 8, padding: 12, gap: 8, alignItems: "stretch" },
  cardSelected: { borderColor: "#3A86FF", borderWidth: 2, backgroundColor: "#F7FBFF" },
  inlineCard: { borderRadius: 8, borderColor: "#D8EAFE", borderWidth: 1, backgroundColor: "#FFFFFF", padding: 8, gap: 6 },
  selectedActionBar: { borderRadius: 8, borderColor: "#CFE4FF", borderWidth: 1, backgroundColor: "#F7FBFF", paddingHorizontal: 8, paddingVertical: 7, gap: 6, flexDirection: "row", alignItems: "center" },
  selectedActionTextGroup: { flex: 1, minWidth: 0 },
  selectedActionTitle: { color: "#24323D", fontSize: 14, fontWeight: "800" },
  selectedActionMeta: { color: "#64748B", fontSize: 11, fontWeight: "600", marginTop: 1 },
  moreActionPanel: { flexDirection: "row", gap: 6, flexWrap: "wrap", borderTopColor: "#E7F0FF", borderTopWidth: 1, paddingTop: 7, marginTop: 2 },
  timelinePanel: { gap: 10 },
  timelineGroup: { gap: 6 },
  timelineMonthTitle: { color: "#24323D", fontWeight: "800", fontSize: 16 },
  timelineRow: { flexDirection: "row", gap: 8 },
  timelineDotColumn: { width: 22, alignItems: "center", paddingTop: 8 },
  timelineDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: "#CFE4FF", borderColor: "#3A86FF", borderWidth: 2 },
  timelineDotSelected: { backgroundColor: "#3A86FF" },
  timelineContent: { flex: 1, backgroundColor: "#FFFFFF", borderColor: "#D8EAFE", borderWidth: 1, borderRadius: 8, padding: 9, gap: 4 },
  calendarCard: { borderRadius: 8, borderColor: "#BDEBDB", borderWidth: 1, backgroundColor: "#F7FFFB", padding: 8, gap: 8 },
  calendarHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  calendarMonthRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  calendarNavButton: { minHeight: 34, minWidth: 64, borderRadius: 8, borderColor: "#CFE4FF", borderWidth: 1, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center", paddingHorizontal: 10, paddingVertical: 6 },
  calendarNavText: { color: "#24323D", fontWeight: "600" },
  calendarMonthLabel: { flex: 1, textAlign: "center", color: "#24323D", fontWeight: "600" },
  calendarWeekdaysRow: { flexDirection: "row", gap: 4 },
  calendarWeekdayLabel: { flex: 1, textAlign: "center", color: "#64748B", fontSize: 12, fontWeight: "600" },
  calendarDaysRow: { flexDirection: "row", gap: 4 },
  calendarDayButton: { flex: 1, minHeight: 40, borderRadius: 8, borderColor: "#D8EAFE", borderWidth: 1, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  calendarDayButtonMuted: { borderColor: "#EEF2F7", backgroundColor: "#F8FAFC" },
  calendarDayButtonToday: { borderColor: "#3A86FF" },
  calendarDayButtonSelected: { borderColor: "#3A86FF", backgroundColor: "#3A86FF" },
  calendarDayText: { color: "#24323D", fontWeight: "600" },
  calendarDayTextMuted: { color: "#94A3B8" },
  calendarDayTextSelected: { color: "#FFFFFF" },
  stayDateCard: { borderRadius: 8, borderColor: "#BDEBDB", borderWidth: 1, backgroundColor: "#F7FFFB", padding: 8, gap: 6 },
  dateInputColumn: { flex: 1 },
  rowCard: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderColor: "#D8EAFE", borderWidth: 1, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 7, backgroundColor: "#FFFFFF" },
  rowCardText: { flex: 1, paddingRight: 8 },
  rowSpaceBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  personRowCard: { flexDirection: "row", alignItems: "center", borderColor: "#D8EAFE", borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 7, backgroundColor: "#FFFFFF", gap: 8 },
  personRowCardDragging: { borderColor: "#3A86FF", backgroundColor: "#EAF7F1", zIndex: 10, elevation: 3 },
  personRowDragArea: { flex: 1, minWidth: 0, alignSelf: "stretch", justifyContent: "center", borderRadius: 7, paddingVertical: 3, paddingRight: 4 },
  personRowText: { minWidth: 0, paddingRight: 4 },
  personRowActions: { flexDirection: "row", gap: 6, flexShrink: 0, justifyContent: "flex-end" },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 12 },
  cardTitle: { flex: 1, fontSize: 17, fontWeight: "700", color: "#24323D" },
  cardTitleSmall: { fontSize: 15, fontWeight: "600", color: "#24323D" },
  badgeRow: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 6, flexShrink: 0, flexWrap: "wrap" },
  selectedBadge: { overflow: "hidden", borderRadius: 6, backgroundColor: "#EAF7F1", color: "#2563EB", borderColor: "#3A86FF", borderWidth: 1, fontWeight: "800", paddingHorizontal: 7, paddingVertical: 3, fontSize: 12 },
  badge: { overflow: "hidden", borderRadius: 6, backgroundColor: "#FFBE0B", color: "#24323D", fontWeight: "700", paddingHorizontal: 7, paddingVertical: 3, fontSize: 12 },
  cardMeta: { color: "#64748B", fontWeight: "500" },
  cardText: { color: "#24323D", lineHeight: 20 },
  checkItem: { minHeight: 44, borderColor: "#D8EAFE", borderWidth: 1, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 6, backgroundColor: "#FFFFFF", justifyContent: "center" },
  checkItemActive: { backgroundColor: "#EAF7F1", borderColor: "#3A86FF" },
  checkItemText: { color: "#24323D", fontWeight: "700" },
  checkItemTextActive: { color: "#3A86FF" },
  error: { color: "#B42318", backgroundColor: "#FFECEC", borderRadius: 8, padding: 10 },
  inlineError: { marginHorizontal: 16, marginTop: 10, color: "#B42318", backgroundColor: "#FFECEC", borderRadius: 8, padding: 10 },
  inlineNotice: { marginHorizontal: 16, marginTop: 10, color: "#22577A", backgroundColor: "#EAF7F1", borderRadius: 8, padding: 10, lineHeight: 20 },
  notice: { color: "#22577A", backgroundColor: "#EAF7F1", borderRadius: 8, padding: 10, lineHeight: 20 },
  helperText: { color: "#64748B", lineHeight: 20 },
  linkText: { color: "#3A86FF", fontWeight: "600" },
  loader: { marginBottom: 10 },
  mapDetailCard: { backgroundColor: "#FFFFFF", borderColor: "#D8EAFE", borderWidth: 1, borderRadius: 8, padding: 14, gap: 6 },
});
