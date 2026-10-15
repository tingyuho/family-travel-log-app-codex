import { useMemo, useState } from "react";
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import type { Trip } from "../api";
import { filterTripPickerOptions, RECENT_TRIP_LIMIT, tripPickerDateLabel } from "../tripPicker";
import { sortTrips } from "../utils";

type Props = {
  trips: Trip[];
  selectedTripId: number | null;
  formatDateRange: (start?: string | null, end?: string | null) => string;
  onSelect: (trip: Trip) => void;
  onClose: () => void;
};

export default function QuickStopTripPicker({ trips, selectedTripId, formatDateRange, onSelect, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  const orderedTrips = useMemo(() => sortTrips(trips, "date_desc"), [trips]);
  const options = useMemo(
    () => filterTripPickerOptions(orderedTrips, query, showAll, formatDateRange),
    [orderedTrips, query, showAll, formatDateRange]
  );
  const searching = Boolean(query.trim());

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={pickerStyles.sheet}>
        <View style={pickerStyles.header}>
          <Text accessibilityRole="header" style={pickerStyles.heading}>Choose trip</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Close trip picker" onPress={onClose} style={pickerStyles.close}>
            <Text style={pickerStyles.link}>Done</Text>
          </Pressable>
        </View>
        <TextInput
          accessibilityLabel="Search trips by name or date"
          testID="quick-stop-trip-search"
          placeholder="Search trips by name or date"
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
          autoCapitalize="none"
          clearButtonMode="while-editing"
          returnKeyType="search"
          style={pickerStyles.search}
        />
        <Text style={pickerStyles.caption} accessibilityLiveRegion="polite">
          {searching ? `${options.length} matching trip${options.length === 1 ? "" : "s"}` : showAll ? "All trips" : "Recent trips"}
        </Text>
        <FlatList
          data={options}
          keyExtractor={(trip) => String(trip.id)}
          extraData={selectedTripId}
          style={pickerStyles.list}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          automaticallyAdjustKeyboardInsets
          initialNumToRender={10}
          windowSize={5}
          renderItem={({ item: trip }) => {
            const selected = trip.id === selectedTripId;
            const dates = tripPickerDateLabel(trip, formatDateRange);
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${trip.title}, ${dates}`}
                accessibilityState={{ selected }}
                testID={`quick-stop-trip-${trip.id}`}
                onPress={() => onSelect(trip)}
                style={[pickerStyles.row, selected && pickerStyles.selectedRow]}
              >
                <View style={pickerStyles.rowText}>
                  <Text style={pickerStyles.title}>{trip.title}</Text>
                  <Text style={pickerStyles.dates}>{dates}</Text>
                </View>
                {selected ? <Text style={pickerStyles.check} accessibilityElementsHidden>✓</Text> : null}
              </Pressable>
            );
          }}
          ListEmptyComponent={<Text style={pickerStyles.empty}>{trips.length ? "No matching trips. Try another name or date." : "Create a trip before adding quick stops."}</Text>}
          ListFooterComponent={!searching && !showAll && trips.length > RECENT_TRIP_LIMIT ? (
            <Pressable accessibilityRole="button" onPress={() => setShowAll(true)} style={pickerStyles.showAll}>
              <Text style={pickerStyles.link}>Show all {trips.length} trips</Text>
            </Pressable>
          ) : null}
        />
      </SafeAreaView>
    </Modal>
  );
}

const pickerStyles = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: "#fffdf7" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 12, gap: 12 },
  heading: { flex: 1, fontSize: 24, fontWeight: "800", color: "#233640" },
  close: { minHeight: 44, justifyContent: "center", paddingHorizontal: 8 },
  link: { fontSize: 17, fontWeight: "700", color: "#3478f6" },
  search: { marginHorizontal: 20, padding: 14, minHeight: 50, borderRadius: 12, borderWidth: 1, borderColor: "#c8dfff", backgroundColor: "#fff", color: "#233640", fontSize: 17 },
  caption: { marginHorizontal: 20, marginTop: 18, marginBottom: 8, fontSize: 15, fontWeight: "600", color: "#64748b" },
  list: { flex: 1 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, marginHorizontal: 20, marginBottom: 8, padding: 16, minHeight: 72, borderWidth: 1, borderColor: "#dbe6f4", borderRadius: 12, backgroundColor: "#fff" },
  selectedRow: { borderColor: "#3478f6", backgroundColor: "#eef5ff" },
  rowText: { flex: 1, gap: 4 },
  title: { color: "#233640", fontSize: 17, fontWeight: "700" },
  dates: { color: "#64748b", fontSize: 15 },
  check: { color: "#3478f6", fontSize: 24, fontWeight: "700" },
  empty: { padding: 20, color: "#64748b", fontSize: 17 },
  showAll: { padding: 20, minHeight: 56, alignItems: "center" },
});
