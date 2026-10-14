import type { LatLng, Region } from "react-native-maps";

import type { RoutePoint, Trip } from "./api";

export type MapDisplayMode = "routes" | "dots";

export type MappedStop = {
  tripId: number;
  tripKind: Trip["trip_kind"];
  tripTitle: string;
  lat: number;
  lng: number;
  label: string;
  index: number;
};

export type ClusteredStop = {
  key: string;
  lat: number;
  lng: number;
  count: number;
  point: MappedStop | null;
};

export function getOrderedRoutePoints(route: RoutePoint[]) {
  return [...route]
    .filter(
      (point) =>
        Number.isFinite(point.lat) &&
        Number.isFinite(point.lng) &&
        Math.abs(point.lat) <= 90 &&
        Math.abs(point.lng) <= 180
    )
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export function routePointToLatLng(point: RoutePoint): LatLng {
  return { latitude: point.lat, longitude: point.lng };
}

export function getTripColor(kind: Trip["trip_kind"]) {
  return kind === "wishlist" ? "#FFBE0B" : "#3A86FF";
}

export function getMapRegion(trips: Trip[]): Region {
  const points = trips.flatMap((trip) => getOrderedRoutePoints(trip.route));
  if (!points.length) {
    return {
      latitude: 39.8283,
      longitude: -98.5795,
      latitudeDelta: 45,
      longitudeDelta: 60,
    };
  }
  const latitudes = points.map((point) => point.lat);
  const longitudes = points.map((point) => point.lng);
  const minLat = Math.min(...latitudes);
  const maxLat = Math.max(...latitudes);
  const minLng = Math.min(...longitudes);
  const maxLng = Math.max(...longitudes);
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max((maxLat - minLat) * 1.6, 0.2),
    longitudeDelta: Math.max((maxLng - minLng) * 1.6, 0.2),
  };
}

export function flattenTripRoutePoints(trips: Trip[]): MappedStop[] {
  return trips.flatMap((trip) =>
    getOrderedRoutePoints(trip.route).map((point, index) => ({
      tripId: trip.id,
      tripKind: trip.trip_kind,
      tripTitle: trip.title,
      lat: point.lat,
      lng: point.lng,
      label: point.label || `Stop ${index + 1}`,
      index,
    }))
  );
}

export function buildMapClusters(points: MappedStop[], region: Region): ClusteredStop[] {
  if (!points.length) return [];
  const latStep = Math.max(region.latitudeDelta / 12, 0.15);
  const lngStep = Math.max(region.longitudeDelta / 12, 0.15);
  const buckets = new Map<string, MappedStop[]>();

  points.forEach((point) => {
    const latBucket = Math.floor((point.lat + 90) / latStep);
    const lngBucket = Math.floor((point.lng + 180) / lngStep);
    const key = `${latBucket}:${lngBucket}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)?.push(point);
  });

  return [...buckets.entries()].map(([bucketKey, bucketPoints]) => {
    const count = bucketPoints.length;
    const lat = bucketPoints.reduce((sum, point) => sum + point.lat, 0) / count;
    const lng = bucketPoints.reduce((sum, point) => sum + point.lng, 0) / count;
    const point = count === 1 ? bucketPoints[0] : null;
    return {
      key: bucketKey,
      lat,
      lng,
      count,
      point,
    };
  });
}

export function buildHeatCells(points: MappedStop[], region: Region) {
  if (!points.length) return [] as Array<{ key: string; lat: number; lng: number; weight: number }>;
  const latStep = Math.max(region.latitudeDelta / 10, 0.25);
  const lngStep = Math.max(region.longitudeDelta / 10, 0.25);
  const buckets = new Map<string, { lat: number; lng: number; weight: number }>();

  points.forEach((point) => {
    const latBucket = Math.floor((point.lat + 90) / latStep);
    const lngBucket = Math.floor((point.lng + 180) / lngStep);
    const key = `${latBucket}:${lngBucket}`;
    const current = buckets.get(key);
    if (!current) {
      buckets.set(key, { lat: point.lat, lng: point.lng, weight: 1 });
      return;
    }
    const nextWeight = current.weight + 1;
    buckets.set(key, {
      lat: (current.lat * current.weight + point.lat) / nextWeight,
      lng: (current.lng * current.weight + point.lng) / nextWeight,
      weight: nextWeight,
    });
  });

  return [...buckets.entries()].map(([key, value]) => ({ key, ...value }));
}
