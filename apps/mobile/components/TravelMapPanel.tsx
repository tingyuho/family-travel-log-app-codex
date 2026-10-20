import { useEffect, useMemo, useRef, useState } from "react";
import { Platform, Pressable, ScrollView, Text, UIManager, View } from "react-native";
import Constants from "expo-constants";
import type { Region } from "react-native-maps";

import type { Trip } from "../api";
import type { TripFilterKind } from "../forms";
import { featureFlags } from "../featureFlags";
import {
  buildHeatCells,
  buildMapClusters,
  flattenTripRoutePoints,
  getMapRegion,
  getOrderedRoutePoints,
  getTripColor,
  type MapDisplayMode,
  routePointToLatLng,
} from "../mapLayers";
import type { AppStyles } from "../screenTypes";

type TravelMapPanelProps = {
  trips: Trip[];
  selectedTripId: number | null;
  selectedTripCount?: number;
  mapMode?: MapDisplayMode;
  onSelectTrip: (tripId: number, stopLabel?: string) => void;
  compact?: boolean;
  fullScreen?: boolean;
  immersive?: boolean;
  emptyFilterKind?: TripFilterKind;
  styles: AppStyles;
};

type NativeMapsModule = typeof import("react-native-maps");
type MapHandle = {
  animateToRegion: (region: Region, duration?: number) => void;
};

let cachedMapsModule: NativeMapsModule | null | undefined;

function getNativeMapsModule() {
  if (cachedMapsModule !== undefined) return cachedMapsModule;
  try {
    cachedMapsModule = require("react-native-maps") as NativeMapsModule;
  } catch {
    cachedMapsModule = null;
  }
  return cachedMapsModule;
}

export default function TravelMapPanel({
  trips,
  selectedTripId,
  selectedTripCount = 0,
  mapMode = "routes",
  onSelectTrip,
  compact = false,
  fullScreen = false,
  immersive = false,
  emptyFilterKind = "all",
  styles,
}: TravelMapPanelProps) {
  const routedTrips = useMemo(
    () => trips.filter((trip) => getOrderedRoutePoints(trip.route).length > 0),
    [trips]
  );
  const tripsWithoutStops = useMemo(
    () => trips.filter((trip) => getOrderedRoutePoints(trip.route).length === 0),
    [trips]
  );
  const hiddenTripCount = tripsWithoutStops.length;
  const mapRegion = useMemo(() => getMapRegion(routedTrips), [routedTrips]);
  const isExpoGo = Constants.executionEnvironment === "storeClient";
  const mapsModule = getNativeMapsModule();
  const NativeMapView = mapsModule?.default;
  const NativeCircle = mapsModule?.Circle;
  const NativeMarker = mapsModule?.Marker;
  const NativePolyline = mapsModule?.Polyline;
  const providerGoogle = mapsModule?.PROVIDER_GOOGLE;
  const hasIosGoogleMapsView = Platform.OS !== "ios" || UIManager.hasViewManagerConfig("AIRGoogleMap");
  const useGoogleProvider = Boolean(providerGoogle && (Platform.OS === "android" || (!isExpoGo && hasIosGoogleMapsView)));
  const mapRef = useRef<MapHandle | null>(null);
  const [showClusters, setShowClusters] = useState(featureFlags.mapClusters);
  const [showHeatmap, setShowHeatmap] = useState(featureFlags.mapHeatmap);
  const [mapBounds, setMapBounds] = useState(mapRegion);
  const isDotsMode = mapMode === "dots";

  const mappedPoints = useMemo(() => flattenTripRoutePoints(routedTrips), [routedTrips]);
  const totalPointCount = mappedPoints.length;
  const perfGate = useMemo(
    () => ({
      clusters: totalPointCount <= 1400,
      heatmap: totalPointCount <= 700,
    }),
    [totalPointCount]
  );
  const shouldShowClusters =
    featureFlags.mapAdvancedLayers && featureFlags.mapClusters && showClusters && perfGate.clusters;
  const shouldShowHeatmap =
    featureFlags.mapAdvancedLayers && featureFlags.mapHeatmap && showHeatmap && perfGate.heatmap;
  const clusteredStops = useMemo(() => buildMapClusters(mappedPoints, mapBounds), [mappedPoints, mapBounds]);
  const heatCells = useMemo(() => buildHeatCells(mappedPoints, mapBounds), [mappedPoints, mapBounds]);

  useEffect(() => {
    if (selectedTripCount > 1) {
      mapRef.current?.animateToRegion(mapRegion, 450);
      return;
    }
    if (!selectedTripId) return;
    const selectedTrip = routedTrips.find((trip) => trip.id === selectedTripId);
    if (!selectedTrip) return;
    mapRef.current?.animateToRegion(getMapRegion([selectedTrip]), 450);
  }, [
    mapRegion,
    routedTrips,
    selectedTripCount,
    selectedTripId,
  ]);

  useEffect(() => {
    setMapBounds(mapRegion);
  }, [mapRegion.latitude, mapRegion.longitude, mapRegion.latitudeDelta, mapRegion.longitudeDelta]);

  const mapResetKey = routedTrips
    .map((trip) => `${trip.id}:${getOrderedRoutePoints(trip.route).map((point) => `${point.lat},${point.lng}`).join(";")}`)
    .join("|");

  return (
    <View style={[styles.mapPanel, fullScreen && styles.mapPanelFull, immersive && styles.mapPanelImmersive]}>
      {!immersive ? (
        <View style={styles.mapPanelHeader}>
          <Text style={styles.mapTitle}>{isDotsMode ? "Visited Dots" : "Travel Map"}</Text>
          {routedTrips.length ? (
            <Text style={styles.mapCount}>
              {isDotsMode
                ? `${totalPointCount} stop${totalPointCount === 1 ? "" : "s"}`
                : `${routedTrips.length} route${routedTrips.length === 1 ? "" : "s"}`}
            </Text>
          ) : null}
        </View>
      ) : null}
      {hiddenTripCount && !immersive ? (
        <Text style={styles.mapHint}>
          {hiddenTripCount} saved trip{hiddenTripCount === 1 ? "" : "s"} need map stops before they can draw on the map.
        </Text>
      ) : null}
      {routedTrips.length && featureFlags.mapAdvancedLayers && !immersive ? (
        <View style={styles.mapLayerRow}>
          <Pressable
            accessibilityRole="switch"
            accessibilityLabel="Toggle map clusters"
            accessibilityState={{ checked: shouldShowClusters }}
            style={[styles.mapLayerChip, shouldShowClusters && styles.mapLayerChipActive]}
            onPress={() => setShowClusters((prev) => !prev)}
          >
            <Text style={[styles.mapLayerChipText, shouldShowClusters && styles.mapLayerChipTextActive]}>
              Clusters
            </Text>
          </Pressable>
          {featureFlags.mapHeatmap ? (
            <Pressable
              accessibilityRole="switch"
              accessibilityLabel="Toggle map heatmap"
              accessibilityState={{ checked: shouldShowHeatmap }}
              style={[styles.mapLayerChip, shouldShowHeatmap && styles.mapLayerChipActive]}
              onPress={() => setShowHeatmap((prev) => !prev)}
            >
              <Text style={[styles.mapLayerChipText, shouldShowHeatmap && styles.mapLayerChipTextActive]}>
                Heatmap
              </Text>
            </Pressable>
          ) : null}
          {(!perfGate.clusters || !perfGate.heatmap) ? (
            <Text style={styles.mapPerfHint}>Auto limited for performance</Text>
          ) : null}
        </View>
      ) : null}

      {routedTrips.length ? (
        <>
          {!NativeMapView || !NativeMarker || !NativePolyline || !NativeCircle ? (
            <MapFallback
              routedTrips={routedTrips}
              styles={styles}
              onSelectTrip={onSelectTrip}
            />
          ) : (
            <View style={[styles.mapShell, compact && styles.mapShellCompact, fullScreen && styles.mapShellFull, immersive && styles.mapShellImmersive]}>
            <NativeMapView
              ref={(instance: MapHandle | null) => {
                mapRef.current = instance;
              }}
              key={mapResetKey}
              style={styles.mapView}
              initialRegion={mapRegion}
              provider={useGoogleProvider ? providerGoogle : undefined}
              scrollEnabled
              zoomEnabled
              pitchEnabled
              rotateEnabled
              toolbarEnabled
              showsCompass
              showsScale
              onRegionChangeComplete={(region: Region) => {
                setMapBounds(region);
              }}
            >
              {shouldShowHeatmap
                ? heatCells.map((cell) => (
                    <NativeCircle
                      key={`heat-${cell.key}`}
                      center={{ latitude: cell.lat, longitude: cell.lng }}
                      radius={Math.max(9000, Math.min(55000, cell.weight * 8000))}
                      fillColor="rgba(229, 95, 43, 0.16)"
                      strokeColor="rgba(229, 95, 43, 0.24)"
                      strokeWidth={1}
                    />
                  ))
                : null}
              {!isDotsMode ? routedTrips.map((trip) => {
                const isSelected = selectedTripId === trip.id;
                const points = getOrderedRoutePoints(trip.route);
                const coordinates = points.map(routePointToLatLng);
                return coordinates.length > 1 ? (
                  <NativePolyline
                    key={`polyline-${trip.id}`}
                    coordinates={coordinates}
                    strokeColor={isSelected ? "#FF6B6B" : getTripColor(trip.trip_kind)}
                    strokeWidth={isSelected ? 5 : 3}
                    lineCap="round"
                    lineJoin="round"
                  />
                ) : null;
              }) : null}
              {shouldShowClusters
                ? clusteredStops.map((cluster) => {
                    if (cluster.count === 1 && cluster.point) {
                      const point = cluster.point;
                      const trip = routedTrips.find((item) => item.id === point.tripId);
                      const selected = selectedTripId === point.tripId;
                      return (
                        <NativeMarker
                          key={`cluster-single-${cluster.key}`}
                          coordinate={{ latitude: point.lat, longitude: point.lng }}
                          pinColor={!isDotsMode ? (selected ? "#FF6B6B" : getTripColor(trip?.trip_kind || "past")) : undefined}
                          title={point.label || trip?.title || "Trip stop"}
                          description={`${trip?.title || "Trip"} - Stop ${(point.index ?? 0) + 1}`}
                          onPress={() => onSelectTrip(point.tripId, point.label || `Stop ${(point.index ?? 0) + 1}`)}
                        >
                          {isDotsMode ? (
                            <View
                              style={[
                                styles.mapDotMarker,
                                trip?.trip_kind === "wishlist" && styles.mapDotMarkerWishlist,
                                selected && styles.mapDotMarkerSelected,
                              ]}
                            />
                          ) : null}
                        </NativeMarker>
                      );
                    }

                    return (
                      <NativeMarker
                        key={`cluster-multi-${cluster.key}`}
                        coordinate={{ latitude: cluster.lat, longitude: cluster.lng }}
                        onPress={() => {
                          mapRef.current?.animateToRegion({
                            latitude: cluster.lat,
                            longitude: cluster.lng,
                            latitudeDelta: Math.max(mapBounds.latitudeDelta / 2.2, 0.08),
                            longitudeDelta: Math.max(mapBounds.longitudeDelta / 2.2, 0.08),
                          });
                        }}
                      >
                        <View style={styles.clusterBubble}>
                          <Text style={styles.clusterBubbleText}>{cluster.count}</Text>
                        </View>
                      </NativeMarker>
                    );
                  })
                : routedTrips.flatMap((trip) => {
                    const isSelected = selectedTripId === trip.id;
                    return getOrderedRoutePoints(trip.route).map((point, index) => (
                      <NativeMarker
                        key={`marker-${trip.id}-${index}-${point.lat}-${point.lng}`}
                        coordinate={routePointToLatLng(point)}
                        pinColor={!isDotsMode ? (isSelected ? "#FF6B6B" : getTripColor(trip.trip_kind)) : undefined}
                        title={point.label || trip.title}
                        description={`${trip.title} - Stop ${index + 1}`}
                        onPress={() => onSelectTrip(trip.id, point.label || `Stop ${index + 1}`)}
                      >
                        {isDotsMode ? (
                          <View
                            style={[
                              styles.mapDotMarker,
                              trip.trip_kind === "wishlist" && styles.mapDotMarkerWishlist,
                              isSelected && styles.mapDotMarkerSelected,
                            ]}
                          />
                        ) : null}
                      </NativeMarker>
                    ));
                  })}
            </NativeMapView>
            </View>
          )}
        </>
      ) : (
        <ScrollView
          style={immersive ? styles.mapEmptyScroll : undefined}
          contentContainerStyle={immersive ? styles.mapEmptyContent : undefined}
        >
          <View testID="map-empty-state" style={styles.card}>
            <Text style={styles.cardTitle}>
              {trips.length ? "These trips don't have map stops yet" : `No ${emptyFilterKind === "all" ? "" : `${emptyFilterKind} `}trips to display`}
            </Text>
            <Text style={styles.cardText}>
              {trips.length
                ? "Add a place in a trip's Route step to show it on the map."
                : "Try another filter, or add a trip from the Trips screen."}
            </Text>
            {tripsWithoutStops.slice(0, 4).map((trip) => (
              <Text key={`unmapped-trip-${trip.id}`} style={styles.cardMeta}>
                {trip.title}
              </Text>
            ))}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

function MapFallback({
  routedTrips,
  styles,
  onSelectTrip,
}: {
  routedTrips: Trip[];
  styles: AppStyles;
  onSelectTrip: (tripId: number, stopLabel?: string) => void;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Map preview unavailable</Text>
      <Text style={styles.cardText}>This build is missing the native map module.</Text>
      {routedTrips.map((trip) => {
        const firstStop = getOrderedRoutePoints(trip.route)[0];
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Select ${trip.title} on map`}
            key={`fallback-route-${trip.id}`}
            style={styles.rowCard}
            onPress={() => onSelectTrip(trip.id, firstStop?.label || trip.title)}
          >
            <View style={styles.rowCardText}>
              <Text style={styles.cardTitleSmall}>{trip.title}</Text>
              <Text style={styles.cardMeta}>{firstStop?.label || "Route stop available"}</Text>
            </View>
            <Text style={styles.textButtonLabel}>Select</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
