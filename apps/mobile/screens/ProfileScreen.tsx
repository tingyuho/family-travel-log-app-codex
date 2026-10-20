import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { featureFlags } from "../featureFlags";
import type { ResetForm } from "../forms";
import type { AppStyles, FieldComponent, StateSetter } from "../screenTypes";
import { getPersonTravelHistory } from "../travelInsights";
import type { PersonProfile, Trip } from "../api";
import type { PackingScreenProps } from "./PackingScreen";
import PackingScreen from "./PackingScreen";
import type { PeopleScreenProps } from "./PeopleScreen";
import PeopleScreen from "./PeopleScreen";

type ProfileScreenProps = {
  styles: AppStyles;
  onLogout: () => void;
  Field: FieldComponent;
  sessionUser: string;
  profileEmail: string;
  setProfileEmail: (email: string) => void;
  handleSaveProfile: () => void;
  handleProfileRequestReset: () => void;
  profileResetCodeSent: boolean;
  profileResetForm: ResetForm;
  setProfileResetForm: StateSetter<ResetForm>;
  handleProfileResetPassword: () => void;
  trips: Trip[];
  formatDateRange: (start?: string | null, end?: string | null) => string;
  openTripDetails: (tripId: number) => void;
  viewTripsOnMap: (tripIds: number[]) => void;
  peopleProps: PeopleScreenProps;
  packingProps: PackingScreenProps;
};

export default function ProfileScreen(props: ProfileScreenProps) {
  const {
    styles,
    onLogout,
    Field,
    sessionUser,
    profileEmail,
    setProfileEmail,
    handleSaveProfile,
    handleProfileRequestReset,
    profileResetCodeSent,
    profileResetForm,
    setProfileResetForm,
    handleProfileResetPassword,
    trips,
    formatDateRange,
    openTripDetails,
    viewTripsOnMap,
    peopleProps,
    packingProps,
  } = props;
  const [showReset, setShowReset] = useState(false);
  const [historyPersonId, setHistoryPersonId] = useState<number | null>(null);
  const historyPerson = peopleProps.people.find((person) => person.id === historyPersonId) || null;
  const history = useMemo(
    () => (historyPerson ? getPersonTravelHistory(historyPerson, trips) : null),
    [historyPerson, trips]
  );

  if (history) {
    return (
      <View style={styles.panel}>
        <View style={styles.sectionHeader}>
          <Pressable accessibilityRole="button" accessibilityLabel="Back to Family Hub" style={styles.textButton} onPress={() => setHistoryPersonId(null)}>
            <Text style={styles.textButtonLabel}>Back</Text>
          </Pressable>
          <View style={styles.rowCardText}>
            <Text style={styles.sectionTitle}>{history.person.name}</Text>
            <Text style={styles.meta}>Travel history</Text>
          </View>
        </View>

        <View style={styles.statsRow}>
          <HistoryStat styles={styles} label="Trips" value={String(history.trips.length)} />
          <HistoryStat styles={styles} label="Stops" value={String(history.stops.length)} />
          <HistoryStat styles={styles} label="Years" value={String(history.years.length)} />
        </View>

        <View style={styles.formBlock}>
          <View style={styles.rowSpaceBetween}>
            <View style={styles.rowCardText}>
              <Text style={styles.formTitle}>Trips Together</Text>
              <Text style={styles.cardMeta}>
                {history.recentTrip ? `Most recent: ${history.recentTrip.title}` : "No trips recorded yet."}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`View ${history.person.name}'s trips on map`}
              accessibilityState={{ disabled: !history.trips.length }}
              disabled={!history.trips.length}
              style={[styles.tripActionButton, !history.trips.length && styles.disabled]}
              onPress={() => viewTripsOnMap(history.trips.map((trip) => trip.id))}
            >
              <Text style={styles.tripActionText}>Map</Text>
            </Pressable>
          </View>

          {history.trips.length ? (
            history.trips.map((trip) => (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Open ${trip.title} details`}
                key={`history-trip-${trip.id}`}
                style={styles.rowCard}
                onPress={() => openTripDetails(trip.id)}
              >
                <View style={styles.rowCardText}>
                  <Text style={styles.cardTitleSmall}>{trip.title}</Text>
                  <Text style={styles.cardMeta}>{formatDateRange(trip.start_date, trip.end_date)}</Text>
                </View>
                <Text style={styles.textButtonLabel}>Details</Text>
              </Pressable>
            ))
          ) : (
            <Text style={styles.cardText}>No trips with {history.person.name} yet.</Text>
          )}
        </View>

        <View style={styles.formBlock}>
          <Text style={styles.formTitle}>Visited Stops</Text>
          {history.stops.length ? (
            history.stops.slice(0, 12).map((stop) => (
              <View key={`history-stop-${stop.tripId}-${stop.index}-${stop.lat}-${stop.lng}`} style={styles.rowCard}>
                <View style={styles.rowCardText}>
                  <Text style={styles.cardTitleSmall}>{stop.label}</Text>
                  <Text style={styles.cardMeta}>{stop.tripTitle}</Text>
                </View>
              </View>
            ))
          ) : (
            <Text style={styles.cardText}>No saved map stops for this family member yet.</Text>
          )}
        </View>

        <View style={styles.formBlock}>
          <Text style={styles.formTitle}>Travel Companions</Text>
          {history.companions.length ? (
            <Text style={styles.cardText}>
              {history.companions.map((companion) => `${companion.name} (${companion.count})`).join(", ")}
            </Text>
          ) : (
            <Text style={styles.cardText}>No companion stats yet.</Text>
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.panel}>
      <Text style={styles.sectionTitle}>Family Hub</Text>
      <View style={styles.sectionHeader}>
        <View>
          <Text style={styles.sectionTitle}>Account</Text>
          <Text style={styles.meta}>Signed in as {sessionUser}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Save account"
          style={styles.primaryMiniButton}
          onPress={handleSaveProfile}
        >
          <Text style={styles.primaryMiniText}>Save Account</Text>
        </Pressable>
      </View>
      <View style={styles.formBlock}>
        <Pressable accessibilityRole="button" accessibilityLabel="Log out of account" style={styles.textButton} onPress={onLogout}><Text style={styles.textButtonLabel}>Log Out</Text></Pressable>
        <Field label="User ID" value={sessionUser} onChangeText={() => {}} editable={false} />
        <Field
          label="Email"
          value={profileEmail}
          onChangeText={setProfileEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />
      </View>

      <PeopleScreen
        {...peopleProps}
        title="Family Profiles"
        getTravelTripCount={(person: PersonProfile) => getPersonTravelHistory(person, trips).trips.length}
        onOpenTravelHistory={(person: PersonProfile) => setHistoryPersonId(person.id)}
      />

      <PackingScreen {...packingProps} title="Packing Lists" />

      {featureFlags.profileResetInApp ? (
        <View style={styles.formBlock}>
          <View style={styles.rowSpaceBetween}>
            <Text style={styles.formTitle}>Reset Password</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={showReset ? "Hide password reset form" : "Open password reset form"}
              style={styles.textButton}
              onPress={() => setShowReset((prev) => !prev)}
            >
              <Text style={styles.textButtonLabel}>{showReset ? "Hide" : "Open"}</Text>
            </Pressable>
          </View>
          {showReset ? (
            <>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Send password verification code"
                style={styles.secondaryButton}
                onPress={handleProfileRequestReset}
              >
                <Text style={styles.secondaryButtonText}>Send Verification Code</Text>
              </Pressable>
              {profileResetCodeSent ? <Text style={styles.helperText}>Code sent to your email.</Text> : null}
              <Field
                label="Email Verification Code"
                value={profileResetForm.email_code}
                onChangeText={(email_code: string) => setProfileResetForm((prev) => ({ ...prev, email_code }))}
                autoCapitalize="none"
              />
              <Field
                label="New Password"
                value={profileResetForm.new_password}
                onChangeText={(new_password: string) => setProfileResetForm((prev) => ({ ...prev, new_password }))}
                secureTextEntry
              />
              <Field
                label="Confirm New Password"
                value={profileResetForm.confirm_password}
                onChangeText={(confirm_password: string) => setProfileResetForm((prev) => ({ ...prev, confirm_password }))}
                secureTextEntry
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Reset password"
                style={styles.primaryButton}
                onPress={handleProfileResetPassword}
              >
                <Text style={styles.primaryButtonText}>Reset Password</Text>
              </Pressable>
            </>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function HistoryStat({ styles, label, value }: { styles: AppStyles; label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}
