import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
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
  createPackingTemplate,
  createPeopleProfile,
  deletePackingTemplate,
  deletePeopleProfile,
  deleteTrip,
  fetchMe,
  fetchTrip,
  login,
  logout,
  register,
  reorderPeopleProfiles,
  requestPasswordReset,
  resetPassword,
  updateMyProfile,
  updatePackingTemplate,
  updatePeopleProfile,
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
import { useTripActions } from "./hooks/useTripActions";
import { useTripWorkflow } from "./hooks/useTripWorkflow";
import { messageFromError } from "./messageFromError";
import MapScreen from "./screens/MapScreen";
import ProfileScreen from "./screens/ProfileScreen";
import TripsScreen from "./screens/TripsScreen";
import type { FieldProps } from "./screenTypes";
import { plannerColors as colors } from "./plannerTheme";
import {
  formatDateRange,
  isInvalidDateRange,
  isValidEmail,
  normalizeText,
  parseItems,
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

  const tripsScrollRef = useRef<ScrollView>(null);
  const tripScrollPositions = useRef<Record<string, number>>({});
  const tripsViewRef = useRef("list");
  const onTripsViewChange = useCallback((view: string) => {
    if (tripsViewRef.current === view) return;
    tripsViewRef.current = view;
    requestAnimationFrame(() => tripsScrollRef.current?.scrollTo({ y: tripScrollPositions.current[view] || 0, animated: false }));
  }, []);
  const [savedStopTripId, setSavedStopTripId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("trips");
  useEffect(() => {
    if (activeTab === "trips") requestAnimationFrame(() => tripsScrollRef.current?.scrollTo({ y: tripScrollPositions.current[tripsViewRef.current] || 0, animated: false }));
  }, [activeTab]);
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
  const mapFocusedTrip = selectedTrip && mapTrips.some((trip) => trip.id === selectedTrip.id) ? selectedTrip : null;

  useEffect(() => {
    if (activeTab === "map" && selectedTripId !== null && !mapFocusedTrip) {
      setSelectedTripId(null);
      setSelectedStopLabel("");
    }
  }, [activeTab, selectedTripId, mapFocusedTrip, setSelectedTripId, setSelectedStopLabel]);

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

  const { handleSaveTrip, handleQuickAddStop } = useTripActions({
    draft: tripDraft, editingId: tripEditingId, setValidation: setTripFormValidation, resetEditor: resetTripEditor,
    onSaved: (trip) => {
      setTrips((current) => [trip, ...current.filter((item) => item.id !== trip.id)]);
      selectOnlyTrip(trip.id);
    },
    onStopSaved: (trip) => setSavedStopTripId(trip.id),
    onError: (error) => setError(error ? messageFromError(error) : null),
    onNotice: setNotice, onBusy: setBusy,
    onConflict: (id) => Alert.alert("Trip changed", "Your draft is kept. Review the latest trip before replacing your draft or applying your changes again.", [
      { text: "Keep draft", style: "cancel" },
      { text: "Review latest", onPress: () => {
        void fetchTrip(id).then((latest) => {
          setTrips((current) => current.map((trip) => trip.id === latest.id ? latest : trip));
          setTripDetailsRequestId(latest.id);
        }).catch((error) => setError(messageFromError(error)));
      } },
    ]),
  });

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
            <Image source={require("./assets/planner-cover.jpg")} style={styles.authArtwork} accessible={false} />
            <Text style={styles.authTitle}>
              {showReset ? "Reset password" : authMode === "login" ? "Welcome back" : "Create account"}
            </Text>
            <Text style={styles.helperText}>Your places, people, and plans. All together.</Text>
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
      <SafeAreaView style={styles.screen} edges={["top", "left", "right", "bottom"]}>
        <StatusBar style="dark" />
        <View style={styles.header}>
          <View>
            <Text style={styles.brandSmall}>Family Travel Log</Text>
            <Text style={styles.meta}>Your family workspace</Text>
          </View>
        </View>

        {error ? <Text style={styles.inlineError}>{error}</Text> : null}
        {notice ? <View><Text style={styles.inlineNotice} accessibilityLiveRegion="polite">{notice}</Text>
          {savedStopTripId && notice.startsWith("Stop added to") ? <Pressable accessibilityRole="button" onPress={() => { setTripDetailsRequestId(savedStopTripId); setActiveTab("trips"); }}><Text style={styles.linkText}>View trip</Text></Pressable> : null}
        </View> : null}

        <View style={[styles.content, activeTab !== "map" && styles.hidden]}>
            {busy ? <ActivityIndicator style={styles.loader} /> : null}
            <MapScreen
              styles={styles}
              trips={mapTrips}
              selectedTripCount={selectedTripIds.length}
              selectedTrip={mapFocusedTrip}
              selectedTripId={mapFocusedTrip?.id ?? null}
              selectedStopLabel={selectedStopLabel}
              onBackToTrips={() => setActiveTab("trips")}
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
          <ScrollView
            ref={tripsScrollRef}
            onScroll={(event) => { if (activeTab === "trips") tripScrollPositions.current[tripsViewRef.current] = event.nativeEvent.contentOffset.y; }}
            scrollEventThrottle={100}
            style={[styles.content, activeTab !== "trips" && styles.hidden]}
            contentContainerStyle={styles.contentInner}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
            keyboardShouldPersistTaps="handled"
          >
            {busy ? <ActivityIndicator style={styles.loader} /> : null}

              <TripsScreen
                onViewChange={onTripsViewChange}
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
          </ScrollView>
          <ScrollView style={[styles.content, activeTab !== "hub" && styles.hidden]} contentContainerStyle={styles.contentInner} keyboardShouldPersistTaps="handled">
              <ProfileScreen
                styles={styles}
                onLogout={handleLogout}
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
          </ScrollView>
          <View style={styles.tabs}>
            <TabButton label="Trips" active={activeTab === "trips"} onPress={() => setActiveTab("trips")} />
            <TabButton label="Map" active={activeTab === "map"} onPress={() => setActiveTab("map")} />
            <TabButton label="Family" active={activeTab === "hub"} onPress={() => setActiveTab("hub")} />
          </View>
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
  const icon = label === "Trips" ? "☰" : label === "Map" ? "⌖" : "♧";
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel={`${label} tab`}
      accessibilityState={{ selected: active }}
      style={[styles.tabButton, active && styles.tabButtonActive]}
      onPress={onPress}
    >
      <Text accessibilityElementsHidden style={[styles.tabButtonIcon, active && styles.tabButtonTextActive]}>{icon}</Text>
      <Text style={[styles.tabButtonText, active && styles.tabButtonTextActive]}>{label}</Text>
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

const styles = StyleSheet.create({
  authArtwork: { width: "100%", aspectRatio: 2.2, borderRadius: 12, marginVertical: 8 },
  hidden: { display: "none" },
  plannerEyebrow: { color: colors.muted, fontSize: 10, letterSpacing: 1.3, fontWeight: "700", marginTop: 8 },
  plannerStats: { flexDirection: "row", gap: 10, marginBottom: 8 },
  plannerStat: { flex: 1, minWidth: 0, borderRadius: 10, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, padding: 14, gap: 4 },
  plannerStatValue: { fontSize: 26, fontWeight: "600", color: colors.ink },
  plannerDetailTabs: { flexDirection: "row", gap: 18, borderBottomWidth: 1, borderBottomColor: colors.line },
  plannerDetailTab: { minHeight: 48, paddingHorizontal: 6, justifyContent: "center", borderBottomWidth: 2, borderBottomColor: "transparent" },
  plannerDetailTabActive: { borderBottomColor: colors.accent },
  plannerDetailTabText: { color: colors.muted, fontSize: 14, fontWeight: "600" },
  plannerDetailTabTextActive: { color: colors.accent },
  screen: { flex: 1, backgroundColor: colors.background },
  authContent: { padding: 24, paddingBottom: 40, gap: 16 },
  brand: { marginTop: 28, fontSize: 32, fontWeight: "700", color: colors.ink, letterSpacing: -1 },
  brandSmall: { fontSize: 21, fontWeight: "700", color: colors.ink, letterSpacing: -0.6 },
  authTitle: { fontSize: 25, fontWeight: "600", color: colors.ink },
  meta: { color: colors.muted, fontSize: 12 },
  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 14, borderBottomColor: colors.line, borderBottomWidth: 1, backgroundColor: colors.surface, flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 4 },
  headerButtonActive: { backgroundColor: colors.soft, borderRadius: 8 },
  summaryBar: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: colors.soft, borderColor: colors.line, borderWidth: 1 },
  summaryText: { color: colors.ink, fontWeight: "600", fontSize: 12 },
  statsRow: { flexDirection: "row", gap: 8, paddingHorizontal: 16 },
  stat: { flex: 1, backgroundColor: colors.soft, borderColor: colors.line, borderWidth: 1, borderRadius: 8, padding: 12 },
  statValue: { fontSize: 20, fontWeight: "800", color: colors.accent },
  statLabel: { color: colors.muted, marginTop: 2 },
  tabs: { flexDirection: "row", justifyContent: "center", paddingHorizontal: 16, paddingTop: 8, paddingBottom: 6, gap: 10, borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.surface },
  tabButton: { flex: 1, minHeight: 56, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: "transparent", gap: 3 },
  tabButtonActive: { backgroundColor: colors.accentSoft },
  tabButtonText: { color: colors.ink, fontWeight: "600" },
  tabButtonIcon: { color: colors.ink, fontSize: 20, fontWeight: "700", lineHeight: 22 },
  tabButtonTextActive: { color: colors.accent },
  content: { flex: 1 },
  contentInner: { padding: 18, paddingBottom: 36, gap: 16 },
  panel: { gap: 16 },
  mapScreen: { flex: 1, backgroundColor: colors.soft, overflow: "hidden" },
  mapCanvas: { flex: 1, minHeight: 0, overflow: "hidden" },
  mapBaseLayer: { flex: 1 },
  mapControls: { padding: 10, gap: 6, backgroundColor: colors.soft },
  mapModeRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, alignItems: "center", alignSelf: "flex-start" },
  mapEmptyScroll: { flex: 1 },
  mapEmptyContent: { flexGrow: 1, justifyContent: "center", padding: 16 },
  mapModeChip: { minHeight: 34, borderWidth: 1, borderColor: colors.line, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5, backgroundColor: "rgba(255,255,255,0.96)", alignItems: "center", justifyContent: "center" },
  mapModeChipActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  mapModeChipText: { color: colors.ink, fontWeight: "800", fontSize: 12 },
  mapModeChipTextActive: { color: colors.surface },
  mapStatusRow: { flexDirection: "row", alignItems: "center" },
  mapStatusPill: { overflow: "hidden", minHeight: 34, borderRadius: 999, borderColor: colors.line, borderWidth: 1, backgroundColor: "rgba(255,255,255,0.96)", color: colors.ink, fontSize: 12, fontWeight: "700", paddingHorizontal: 12, paddingVertical: 7 },
  mapFilterRow: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  mapFilterChip: { minHeight: 34, borderWidth: 1, borderColor: colors.line, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: "rgba(255,255,255,0.96)", alignItems: "center", justifyContent: "center" },
  mapFilterChipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  mapFilterChipText: { color: colors.ink, fontWeight: "600", fontSize: 12 },
  mapFilterChipTextActive: { color: colors.surface },
  mapBottomOverlay: { position: "absolute", right: 10, bottom: 12, left: 10, zIndex: 6 },
  mapBottomSheet: { borderTopLeftRadius: 8, borderTopRightRadius: 8, borderBottomLeftRadius: 8, borderBottomRightRadius: 8, borderColor: colors.line, borderWidth: 1, backgroundColor: "rgba(255,255,255,0.98)", paddingHorizontal: 12, paddingTop: 8, paddingBottom: 12, gap: 8, overflow: "hidden" },
  mapSheetHandle: { width: 42, height: 4, borderRadius: 2, backgroundColor: colors.line, alignSelf: "center" },
  mapSheetHeader: { minHeight: 70, justifyContent: "center", gap: 8 },
  mapSheetTitle: { color: colors.ink, fontSize: 17, fontWeight: "700" },
  mapSheetMeta: { color: colors.muted, fontSize: 12, fontWeight: "500", marginTop: 2 },
  mapSheetToggleText: { color: colors.accent, fontWeight: "700", paddingLeft: 10 },
  mapSheetBody: { gap: 6 },
  mapSheetPager: { flexDirection: "row", alignItems: "center", gap: 6 },
  mapSheetPagerText: { flex: 1, color: colors.muted, fontSize: 12, fontWeight: "700", textAlign: "center" },
  mapSheetAction: { minHeight: 42, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: colors.soft, borderColor: colors.accent, borderWidth: 1, paddingHorizontal: 12 },
  mapSheetActionText: { color: colors.accent, fontWeight: "700" },
  mapScreenHeader: { gap: 8 },
  mapAlwaysOn: { paddingHorizontal: 16, paddingTop: 12 },
  mapPanel: { gap: 8 },
  mapPanelFull: { flex: 1 },
  mapPanelImmersive: { gap: 0 },
  mapPanelHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  mapTitle: { fontSize: 18, fontWeight: "700", color: colors.ink },
  mapCount: { color: colors.muted, fontWeight: "500" },
  mapHint: { color: colors.muted, fontSize: 12, fontWeight: "700" },
  mapLayerRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center" },
  mapLayerChip: { minHeight: 44, borderWidth: 1, borderColor: colors.line, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  mapLayerChipActive: { borderColor: colors.accent, backgroundColor: colors.accent },
  mapLayerChipText: { color: colors.ink, fontWeight: "600" },
  mapLayerChipTextActive: { color: "#fff" },
  mapPerfHint: { color: colors.muted, fontWeight: "600", fontSize: 12 },
  mapShell: { height: 300, overflow: "hidden", borderRadius: 12, borderColor: colors.line, borderWidth: 1, backgroundColor: colors.soft },
  mapShellCompact: { height: 210 },
  mapShellFull: { flex: 1, minHeight: 360 },
  mapShellImmersive: { height: "100%", minHeight: 0, borderRadius: 0, borderWidth: 0 },
  mapView: { flex: 1 },
  clusterBubble: {
    minWidth: 34,
    minHeight: 34,
    borderRadius: 17,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    borderColor: "#fff",
    borderWidth: 2,
    paddingHorizontal: 8,
  },
  clusterBubbleText: { color: "#fff", fontWeight: "800", fontSize: 12 },
  mapDotMarker: { width: 14, height: 14, borderRadius: 7, backgroundColor: colors.accent, borderColor: colors.surface, borderWidth: 2 },
  mapDotMarkerWishlist: { backgroundColor: colors.accentSoft },
  mapDotMarkerSelected: { width: 18, height: 18, borderRadius: 9, backgroundColor: "#FF6B6B", borderWidth: 3 },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 },
  sectionTitle: { fontSize: 25, fontWeight: "700", letterSpacing: -0.5, color: colors.ink },
  formBlock: { backgroundColor: colors.surface, borderColor: colors.line, borderWidth: 1, borderRadius: 10, padding: 16, gap: 12 },
  formTitle: { fontSize: 17, fontWeight: "600", color: colors.ink },
  filterSummaryLine: { color: colors.muted, fontSize: 12, fontWeight: "500", marginTop: -4 },
  filterGroup: { gap: 6 },
  filterGroupTitle: { color: colors.ink, fontSize: 13, fontWeight: "600" },
  field: { gap: 4 },
  label: { color: colors.ink, fontWeight: "600" },
  input: { minHeight: 48, backgroundColor: colors.surface, borderColor: colors.line, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, color: colors.ink },
  dateField: { flex: 1, minHeight: 44, backgroundColor: colors.surface, borderColor: colors.line, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, justifyContent: "center", gap: 4 },
  dateFieldActive: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  dateFieldDisabled: { borderColor: colors.line, backgroundColor: colors.soft },
  dateFieldValue: { color: colors.ink, fontWeight: "600" },
  dateFieldPlaceholder: { color: colors.muted, fontWeight: "500" },
  disabledField: { backgroundColor: colors.soft, color: colors.muted },
  textarea: { minHeight: 72, paddingTop: 8 },
  twoCol: { flexDirection: "row", gap: 8 },
  segment: { flexDirection: "row", gap: 6 },
  segmentWrap: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  editorStepRow: { flexDirection: "row", gap: 6, alignItems: "stretch" },
  editorStepButton: { flex: 1, minWidth: 0, minHeight: 44, borderWidth: 1, borderColor: colors.line, borderRadius: 999, paddingHorizontal: 6, paddingVertical: 6, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  editorStepButtonActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  editorStepButtonText: { color: colors.ink, fontWeight: "700", fontSize: 12 },
  editorStepButtonTextActive: { color: colors.surface },
  segmentButton: { flex: 1, minHeight: 44, borderColor: colors.line, borderWidth: 1, borderRadius: 8, paddingVertical: 8, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  segmentButtonActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  segmentButtonText: { color: colors.ink, fontWeight: "700" },
  segmentButtonTextActive: { color: "#ffffff" },
  filterChip: { minHeight: 44, borderWidth: 1, borderColor: colors.line, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  filterChipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  filterChipText: { color: colors.ink, fontWeight: "700" },
  filterChipTextActive: { color: "#fff" },
  suggestionRow: { borderColor: colors.line, borderWidth: 1, borderRadius: 8, padding: 10, backgroundColor: colors.surface },
  actionRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  actionRowCompact: { flexDirection: "row", gap: 6, alignItems: "center", flexShrink: 0 },
  actionRowWrap: { flexDirection: "row", gap: 6, marginTop: 6, flexWrap: "wrap" },
  primaryButton: { minHeight: 48, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: colors.accent, paddingHorizontal: 16, paddingVertical: 10, flexGrow: 1 },
  primaryButtonText: { color: "#ffffff", fontWeight: "700" },
  primaryMiniButton: { minHeight: 44, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: colors.accent, paddingHorizontal: 10, paddingVertical: 8 },
  primaryMiniText: { color: colors.surface, fontWeight: "700", fontSize: 12 },
  secondaryButton: { minHeight: 44, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: colors.soft, borderColor: colors.accent, borderWidth: 1, paddingHorizontal: 12, flexGrow: 1 },
  secondaryButtonText: { color: colors.accent, fontWeight: "700" },
  textButton: { minHeight: 44, paddingHorizontal: 8, paddingVertical: 7, alignItems: "center", justifyContent: "center" },
  textButtonLabel: { color: colors.accent, fontWeight: "600" },
  actionMiniButton: { minHeight: 44, borderRadius: 8, borderColor: colors.line, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 6, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  actionMiniButtonDanger: { minHeight: 44, borderRadius: 8, borderColor: "#FFB4B4", borderWidth: 1, paddingHorizontal: 9, paddingVertical: 6, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  actionMiniText: { color: colors.ink, fontWeight: "700", fontSize: 12 },
  actionMiniTextDanger: { color: "#E05252", fontWeight: "700", fontSize: 12 },
  tripActionButton: { minHeight: 44, borderRadius: 8, borderColor: colors.line, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  tripActionButtonDanger: { minHeight: 44, borderRadius: 8, borderColor: "#E7C4C4", borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  tripActionText: { color: colors.ink, fontWeight: "600", fontSize: 12 },
  tripActionTextDanger: { color: "#E05252", fontWeight: "600", fontSize: 12 },
  disabled: { opacity: 0.65 },
  card: { backgroundColor: colors.surface, borderColor: colors.line, borderWidth: 1, borderRadius: 10, padding: 18, gap: 9 },
  emptyState: { backgroundColor: colors.surface, borderColor: colors.line, borderWidth: 1, borderRadius: 10, padding: 20, gap: 12, alignItems: "stretch" },
  cardSelected: { borderColor: colors.accent, borderWidth: 2, backgroundColor: colors.accentSoft },
  inlineCard: { borderRadius: 8, borderColor: colors.line, borderWidth: 1, backgroundColor: colors.surface, padding: 8, gap: 6 },
  selectedActionBar: { borderRadius: 8, borderColor: colors.line, borderWidth: 1, backgroundColor: colors.accentSoft, paddingHorizontal: 8, paddingVertical: 7, gap: 6, flexDirection: "row", alignItems: "center" },
  selectedActionTextGroup: { flex: 1, minWidth: 0 },
  selectedActionTitle: { color: colors.ink, fontSize: 14, fontWeight: "800" },
  selectedActionMeta: { color: colors.muted, fontSize: 11, fontWeight: "600", marginTop: 1 },
  moreActionPanel: { flexDirection: "row", gap: 6, flexWrap: "wrap", borderTopColor: colors.line, borderTopWidth: 1, paddingTop: 7, marginTop: 2 },
  timelinePanel: { gap: 10 },
  timelineGroup: { gap: 6 },
  timelineMonthTitle: { color: colors.ink, fontWeight: "600", fontSize: 18 },
  timelineRow: { flexDirection: "row", gap: 8 },
  timelineDotColumn: { width: 22, alignItems: "center", paddingTop: 8 },
  timelineDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.line, borderColor: colors.accent, borderWidth: 2 },
  timelineDotSelected: { backgroundColor: colors.accent },
  timelineContent: { flex: 1, backgroundColor: colors.surface, borderColor: colors.line, borderWidth: 1, borderRadius: 10, padding: 16, gap: 8 },
  calendarCard: { borderRadius: 8, borderColor: colors.line, borderWidth: 1, backgroundColor: colors.surface, padding: 8, gap: 8 },
  calendarHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  calendarMonthRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  calendarNavButton: { minHeight: 34, minWidth: 64, borderRadius: 8, borderColor: colors.line, borderWidth: 1, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", paddingHorizontal: 10, paddingVertical: 6 },
  calendarNavText: { color: colors.ink, fontWeight: "600" },
  calendarMonthLabel: { flex: 1, textAlign: "center", color: colors.ink, fontWeight: "600" },
  calendarWeekdaysRow: { flexDirection: "row", gap: 4 },
  calendarWeekdayLabel: { flex: 1, textAlign: "center", color: colors.muted, fontSize: 12, fontWeight: "600" },
  calendarDaysRow: { flexDirection: "row", gap: 4 },
  calendarDayButton: { flex: 1, minHeight: 40, borderRadius: 8, borderColor: colors.line, borderWidth: 1, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  calendarDayButtonMuted: { borderColor: colors.line, backgroundColor: colors.background },
  calendarDayButtonToday: { borderColor: colors.accent },
  calendarDayButtonSelected: { borderColor: colors.accent, backgroundColor: colors.accent },
  calendarDayText: { color: colors.ink, fontWeight: "600" },
  calendarDayTextMuted: { color: colors.muted },
  calendarDayTextSelected: { color: colors.surface },
  stayDateCard: { borderRadius: 8, borderColor: colors.line, borderWidth: 1, backgroundColor: colors.surface, padding: 8, gap: 6 },
  dateInputColumn: { flex: 1 },
  rowCard: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderColor: colors.line, borderWidth: 1, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 7, backgroundColor: colors.surface },
  rowCardText: { flex: 1, paddingRight: 8 },
  rowSpaceBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  personRowCard: { flexDirection: "row", alignItems: "center", borderColor: colors.line, borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 7, backgroundColor: colors.surface, gap: 8 },
  personRowCardDragging: { borderColor: colors.accent, backgroundColor: colors.soft, zIndex: 10, elevation: 3 },
  personRowDragArea: { flex: 1, minWidth: 0, alignSelf: "stretch", justifyContent: "center", borderRadius: 7, paddingVertical: 3, paddingRight: 4 },
  personRowText: { minWidth: 0, paddingRight: 4 },
  personRowActions: { flexDirection: "row", gap: 6, flexShrink: 0, justifyContent: "flex-end" },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 12 },
  cardTitle: { flex: 1, fontSize: 21, fontWeight: "700", color: colors.ink, letterSpacing: -0.4 },
  cardTitleSmall: { fontSize: 17, fontWeight: "600", color: colors.ink },
  badgeRow: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 6, flexShrink: 0, flexWrap: "wrap" },
  selectedBadge: { overflow: "hidden", borderRadius: 6, backgroundColor: colors.soft, color: colors.accent, borderColor: colors.accent, borderWidth: 1, fontWeight: "800", paddingHorizontal: 7, paddingVertical: 3, fontSize: 12 },
  badge: { overflow: "hidden", borderRadius: 5, backgroundColor: colors.accentSoft, color: colors.accent, fontWeight: "600", paddingHorizontal: 8, paddingVertical: 4, fontSize: 11 },
  cardMeta: { color: colors.muted, fontWeight: "400", fontSize: 13, lineHeight: 20 },
  cardText: { color: colors.ink, fontSize: 15, lineHeight: 23 },
  checkItem: { minHeight: 44, borderColor: colors.line, borderWidth: 1, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 6, backgroundColor: colors.surface, justifyContent: "center" },
  checkItemActive: { backgroundColor: colors.soft, borderColor: colors.accent },
  checkItemText: { color: colors.ink, fontWeight: "700" },
  checkItemTextActive: { color: colors.accent },
  error: { color: "#B42318", backgroundColor: "#FFECEC", borderRadius: 8, padding: 10 },
  inlineError: { marginHorizontal: 16, marginTop: 10, color: "#B42318", backgroundColor: "#FFECEC", borderRadius: 8, padding: 10 },
  inlineNotice: { marginHorizontal: 16, marginTop: 10, color: colors.success, backgroundColor: colors.soft, borderRadius: 8, padding: 10, lineHeight: 20 },
  notice: { color: colors.success, backgroundColor: colors.soft, borderRadius: 8, padding: 10, lineHeight: 20 },
  helperText: { color: colors.muted, lineHeight: 20 },
  linkText: { color: colors.accent, fontWeight: "600" },
  loader: { marginBottom: 10 },
  mapDetailCard: { backgroundColor: colors.surface, borderColor: colors.line, borderWidth: 1, borderRadius: 8, padding: 14, gap: 6 },
});
