import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, PanResponder, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { Trip } from "../api";
import TravelMapPanel from "../components/TravelMapPanel";
import type { AppStyles } from "../screenTypes";
import type { TripFilterKind } from "../forms";
import type { MapDisplayMode } from "../mapLayers";
import { getOrderedRoutePoints } from "../mapLayers";

type MapSheetState = "collapsed" | "expanded";

const collapsedSheetHeight = 112;

type MapSheetHeights = Record<MapSheetState, number>;

const defaultMapSheetHeights: MapSheetHeights = {
  collapsed: collapsedSheetHeight,
  expanded: 174,
};

type MapScreenProps = {
  styles: AppStyles;
  trips: Trip[];
  selectedTripCount: number;
  selectedTrip: Trip | null;
  selectedTripId: number | null;
  selectedStopLabel: string;
  tripFilterKind: TripFilterKind;
  setTripFilterKind: (value: TripFilterKind) => void;
  onSelectTrip: (tripId: number, stopLabel?: string) => void;
  formatDateRange: (start?: string | null, end?: string | null) => string;
  openTrips: () => void;
  onBackToTrips?: () => void;
};

export default function MapScreen({
  styles,
  trips,
  selectedTripCount,
  selectedTrip: focusedTrip,
  selectedTripId: focusedTripId,
  selectedStopLabel,
  tripFilterKind,
  setTripFilterKind,
  onSelectTrip,
  formatDateRange,
  openTrips,
  onBackToTrips,
}: MapScreenProps) {
  const selectedTrip = focusedTrip && trips.some((trip) => trip.id === focusedTrip.id) ? focusedTrip : null;
  const selectedTripId = selectedTrip ? focusedTripId : null;
  const insets = useSafeAreaInsets();
  const [sheetState, setSheetState] = useState<MapSheetState>("collapsed");
  const [mapMode, setMapMode] = useState<MapDisplayMode>("routes");
  const sheetHeight = useRef(new Animated.Value(defaultMapSheetHeights.collapsed)).current;
  const sheetDragStartHeight = useRef(defaultMapSheetHeights.collapsed);
  const hasFocusedTrip = Boolean(selectedTrip);
  const hasSelectedTrips = selectedTripCount > 0;
  const hasAnySheetContent = hasFocusedTrip || hasSelectedTrips;
  const hasMapStops = trips.some((trip) => getOrderedRoutePoints(trip.route).length > 0);
  const hasTripNotes = Boolean(selectedTrip?.notes?.trim());
  const selectedTripIndex = selectedTrip ? trips.findIndex((trip) => trip.id === selectedTrip.id) : -1;
  const selectedTripPosition =
    selectedTrip && selectedTripCount > 1 && selectedTripIndex >= 0
      ? `Viewing ${selectedTripIndex + 1} of ${selectedTripCount}`
      : "";
  const canPageSelectedTrips = Boolean(selectedTrip && selectedTripCount > 1 && trips.length > 1);
  const hasExpandedSheetDetails = Boolean(
    selectedStopLabel || hasTripNotes || canPageSelectedTrips || (!selectedTrip && hasSelectedTrips)
  );
  const expandedSheetHeight = selectedTrip ? (hasExpandedSheetDetails ? 276 : 168) : 176;
  const sheetHeights = useMemo<MapSheetHeights>(
    () => ({
      collapsed: collapsedSheetHeight,
      expanded: expandedSheetHeight,
    }),
    [expandedSheetHeight]
  );
  const sheetExpanded = sheetState === "expanded";
  const sheetToggleLabel = sheetExpanded ? "Less" : "More";
  const bottomOverlayStyle = useMemo(
    () => [styles.mapBottomOverlay, { bottom: Math.max(12, insets.bottom + 12) }],
    [insets.bottom, styles.mapBottomOverlay]
  );

  const sheetPanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, gesture) =>
          hasAnySheetContent && Math.abs(gesture.dy) > 6 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
        onPanResponderGrant: () => {
          sheetDragStartHeight.current = sheetHeights[sheetState];
          sheetHeight.stopAnimation((value) => {
            sheetDragStartHeight.current = value;
          });
        },
        onPanResponderMove: (_, gesture) => {
          const nextHeight = clampSheetHeight(sheetDragStartHeight.current - gesture.dy, sheetHeights);
          sheetHeight.setValue(nextHeight);
        },
        onPanResponderRelease: (_, gesture) => {
          snapSheetToState(getTargetSheetState(sheetDragStartHeight.current - gesture.dy, gesture.vy, sheetHeights));
        },
        onPanResponderTerminate: () => {
          snapSheetToState(sheetState);
        },
        onPanResponderTerminationRequest: () => true,
      }),
    [hasAnySheetContent, sheetHeight, sheetHeights, sheetState]
  );

  useEffect(() => {
    snapSheetToState("collapsed");
  }, [selectedTripCount, selectedTripId]);

  function toggleSheet() {
    if (!hasAnySheetContent) return;
    const nextState = sheetState === "collapsed" ? "expanded" : "collapsed";
    snapSheetToState(nextState);
  }

  function snapSheetToState(nextState: MapSheetState) {
    setSheetState(nextState);
    Animated.spring(sheetHeight, {
      toValue: sheetHeights[nextState],
      useNativeDriver: false,
      speed: 24,
      bounciness: 4,
    }).start();
  }

  function focusRelativeSelectedTrip(offset: number) {
    if (!canPageSelectedTrips) return;

    const currentIndex = selectedTripIndex >= 0 ? selectedTripIndex : 0;
    const nextIndex = (currentIndex + offset + trips.length) % trips.length;
    onSelectTrip(trips[nextIndex].id);
  }

  return (
    <View style={styles.mapScreen}>
      <View testID="map-controls" style={styles.mapControls}>
        {onBackToTrips ? <Pressable accessibilityRole="button" onPress={onBackToTrips}><Text style={styles.linkText}>Back to Trips</Text></Pressable> : null}
        <View style={styles.mapModeRow}>
          {([
            ["routes", "Routes"],
            ["dots", "Places"],
          ] as Array<[MapDisplayMode, string]>).map(([value, label]) => {
            const active = mapMode === value;
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Show map as ${label.toLowerCase()}`}
                accessibilityState={{ selected: active }}
                key={`map-mode-${value}`}
                style={[styles.mapModeChip, active && styles.mapModeChipActive]}
                onPress={() => setMapMode(value)}
              >
                <Text style={[styles.mapModeChipText, active && styles.mapModeChipTextActive]}>{label}</Text>
              </Pressable>
            );
          })}
        </View>
        {selectedTripCount ? (
          <View style={styles.mapStatusRow}>
            <Text style={styles.mapStatusPill}>
              {selectedTripCount} selected trip{selectedTripCount === 1 ? "" : "s"}
            </Text>
          </View>
        ) : (
          <View style={styles.mapFilterRow}>
            {[
              ["all", "All"],
              ["past", "Past"],
              ["wishlist", "Wishlist"],
            ].map(([value, label]) => {
              const active = tripFilterKind === value;
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Show ${label.toLowerCase()} trips on map`}
                  accessibilityState={{ selected: active }}
                  key={`map-filter-${value}`}
                  style={[styles.mapFilterChip, active && styles.mapFilterChipActive]}
                  onPress={() => setTripFilterKind(value as TripFilterKind)}
                >
                  <Text style={[styles.mapFilterChipText, active && styles.mapFilterChipTextActive]}>{label}</Text>
                </Pressable>
              );
            })}
          </View>
        )}
      </View>

      <View testID="map-canvas" style={styles.mapCanvas}>
        <View style={styles.mapBaseLayer}>
          <TravelMapPanel
            trips={trips}
            selectedTripId={selectedTripId}
            selectedTripCount={selectedTripCount}
            mapMode={mapMode}
            onSelectTrip={onSelectTrip}
            emptyFilterKind={selectedTripCount ? "all" : tripFilterKind}
            fullScreen
            immersive
            styles={styles}
          />
        </View>

        {!hasMapStops ? null : hasAnySheetContent ? (
          <View pointerEvents="box-none" style={bottomOverlayStyle}>
            <Animated.View style={[styles.mapBottomSheet, { height: sheetHeight }]}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={sheetExpanded ? "Collapse map details" : "Expand map details"}
                accessibilityState={{ expanded: sheetExpanded }}
                style={styles.mapSheetHeader}
                onPress={toggleSheet}
                {...sheetPanResponder.panHandlers}
              >
                <View style={styles.mapSheetHandle} />
                <View style={styles.rowSpaceBetween}>
                  <View style={styles.rowCardText}>
                    <Text style={styles.mapSheetTitle}>
                      {selectedTrip ? selectedTrip.title : `${selectedTripCount} selected trip${selectedTripCount === 1 ? "" : "s"}`}
                    </Text>
                    <Text style={styles.mapSheetMeta}>
                      {selectedTrip
                        ? [selectedTripPosition, formatDateRange(selectedTrip.start_date, selectedTrip.end_date)]
                            .filter(Boolean)
                            .join(" | ")
                        : "Tap a map marker to focus a trip."}
                    </Text>
                  </View>
                  <Text style={styles.mapSheetToggleText}>{sheetToggleLabel}</Text>
                </View>
              </Pressable>

              {sheetExpanded && hasExpandedSheetDetails ? (
                <View style={styles.mapSheetBody}>
                  {selectedTrip ? (
                    <>
                      {canPageSelectedTrips ? (
                        <View style={styles.mapSheetPager}>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel="Show previous selected trip"
                            style={styles.tripActionButton}
                            onPress={() => focusRelativeSelectedTrip(-1)}
                          >
                            <Text style={styles.tripActionText}>Previous</Text>
                          </Pressable>
                          <Text style={styles.mapSheetPagerText}>{selectedTripPosition}</Text>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel="Show next selected trip"
                            style={styles.tripActionButton}
                            onPress={() => focusRelativeSelectedTrip(1)}
                          >
                            <Text style={styles.tripActionText}>Next</Text>
                          </Pressable>
                        </View>
                      ) : null}
                      {selectedStopLabel ? <Text style={styles.cardText}>Focused stop: {selectedStopLabel}</Text> : null}
                      {hasTripNotes ? <Text style={styles.cardText} numberOfLines={3}>{selectedTrip.notes}</Text> : null}
                    </>
                  ) : (
                    <Text style={styles.cardText}>Selected trips are visible on the map. Tap a marker to focus one trip and open its details.</Text>
                  )}
                </View>
              ) : null}

              {selectedTrip && sheetExpanded ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`View details for ${selectedTrip.title}`}
                  style={styles.mapSheetAction}
                  onPress={openTrips}
                >
                  <Text style={styles.mapSheetActionText}>View Trip Details</Text>
                </Pressable>
              ) : null}
            </Animated.View>
          </View>
        ) : (
          <View pointerEvents="box-none" style={bottomOverlayStyle}>
            <View style={styles.mapBottomSheet}>
              <View style={styles.mapSheetHandle} />
              <Text style={styles.mapSheetTitle}>No trip focused</Text>
              <Text style={styles.mapSheetMeta}>Tap a marker to see trip details here.</Text>
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

function clampSheetHeight(value: number, sheetHeights: MapSheetHeights) {
  return Math.max(sheetHeights.collapsed, Math.min(sheetHeights.expanded, value));
}

function getTargetSheetState(height: number, velocityY: number, sheetHeights: MapSheetHeights): MapSheetState {
  if (velocityY < -0.65) return "expanded";
  if (velocityY > 0.65) return "collapsed";

  const clampedHeight = clampSheetHeight(height, sheetHeights);
  const targets: MapSheetState[] = ["collapsed", "expanded"];
  return targets.reduce((nearest, candidate) => {
    const nearestDistance = Math.abs(sheetHeights[nearest] - clampedHeight);
    const candidateDistance = Math.abs(sheetHeights[candidate] - clampedHeight);
    return candidateDistance < nearestDistance ? candidate : nearest;
  }, "collapsed" as MapSheetState);
}
