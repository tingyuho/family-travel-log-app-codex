import { useEffect, useMemo } from "react";
import { Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import { normalizeTripKind } from "../lib/tripUtils.js";
import "leaflet.markercluster";
import "leaflet.heat";

const pinIcon = new L.Icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

const pastTripIcon = new L.Icon({
  iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-blue.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

const wishlistTripIcon = new L.Icon({
  iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

export function getTripMarkerIcon(tripKind) {
  return normalizeTripKind(tripKind) === "wishlist" ? wishlistTripIcon : pastTripIcon;
}

export function getTripLineColor(tripKind, highlighted) {
  if (normalizeTripKind(tripKind) === "wishlist") {
    return highlighted ? "#5f6b76" : "#9aa7b3";
  }
  return highlighted ? "#e55f2b" : "#3388ff";
}

export function getTripLineWeight(highlighted) {
  return highlighted ? 4 : 2;
}

export function getOrderedRoutePoints(route) {
  return [...(route || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export function getRouteArrowSegments(route) {
  const points = getOrderedRoutePoints(route);
  const segments = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    const midLat = (start.lat + end.lat) / 2;
    const midLng = (start.lng + end.lng) / 2;
    const lngScale = Math.cos((midLat * Math.PI) / 180);
    const dx = (end.lng - start.lng) * lngScale;
    const dy = end.lat - start.lat;
    if (!Number.isFinite(dx) || !Number.isFinite(dy) || (dx === 0 && dy === 0)) continue;
    segments.push({
      position: [midLat, midLng],
      angle: (Math.atan2(dx, dy) * 180) / Math.PI,
      order: start.order ?? index,
    });
  }
  return segments;
}

export function createRouteArrowIcon(color, angle, highlighted) {
  return L.divIcon({
    className: "route-arrow-icon",
    html: `<span class="route-arrow${highlighted ? " is-highlighted" : ""}" style="--route-arrow-color: ${color}; transform: rotate(${angle}deg);"></span>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

function normalizeLng(lng) {
  return ((((lng + 180) % 360) + 360) % 360) - 180;
}

function buildFocusBounds(points) {
  const latLngs = points.map(([lat, lng]) => L.latLng(lat, lng));
  if (!latLngs.length) return null;

  let bounds = L.latLngBounds(latLngs);
  const directSpan = bounds.getEast() - bounds.getWest();

  // If selected points straddle the date line, shift negative longitudes to reduce span.
  if (directSpan > 180) {
    const shifted = latLngs.map((point) =>
      L.latLng(point.lat, point.lng < 0 ? point.lng + 360 : point.lng)
    );
    const shiftedBounds = L.latLngBounds(shifted);
    const sw = shiftedBounds.getSouthWest();
    const ne = shiftedBounds.getNorthEast();
    bounds = L.latLngBounds(
      [sw.lat, normalizeLng(sw.lng)],
      [ne.lat, normalizeLng(ne.lng)]
    );
  }

  return bounds.pad(0.14);
}

export function MapFocus({ selectedTrips }) {
  const map = useMap();
  useEffect(() => {
    const observer = new ResizeObserver(() => {
      if (map.getContainer().clientWidth) map.invalidateSize({ pan: false });
    });
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [map]);
  useEffect(() => {
    if (!selectedTrips?.length) return;
    const points = selectedTrips
      .flatMap((trip) => trip.route || [])
      .map((point) => [point.lat, point.lng]);
    if (!points.length) return;
    if (points.length === 1) {
      map.setView(points[0], Math.max(map.getZoom(), 7), { animate: true });
      return;
    }
    const bounds = buildFocusBounds(points);
    if (!bounds || !bounds.isValid()) return;
    map.fitBounds(bounds, {
      padding: [42, 42],
      maxZoom: 8,
      animate: true,
    });
  }, [map, selectedTrips]);
  return null;
}


function createSearchResultIcon(label) {
  const shortLabel = (label || "Place").split(",")[0].slice(0, 34);
  const safeLabel = shortLabel
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
  return L.divIcon({
    className: "map-search-result-icon",
    html: `<span>${safeLabel}</span>`,
    iconSize: [120, 30],
    iconAnchor: [60, 15],
  });
}

function getSearchResultPosition(result) {
  const lat = Number(result.lat);
  const lng = Number(result.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return [lat, lng];
}

export function splitPlaceName(displayName) {
  const parts = (displayName || "").split(",").map((part) => part.trim()).filter(Boolean);
  return {
    primary: parts[0] || "Place",
    secondary: parts.slice(1, 4).join(", "),
  };
}

export function formatSuggestionLocation(result) {
  const address = result.address || {};
  const city = address.city || address.town || address.village || address.hamlet || address.county;
  const region = address.state || address.province || address.region;
  const country = address.country;
  const parts = [city, region, country].filter(Boolean);
  if (parts.length) return parts.join(", ");
  return splitPlaceName(result.display_name).secondary;
}

export function MapSearchResultsLayer({ results, targetLabel, onAddResult }) {
  const map = useMap();
  const validResults = useMemo(
    () => (results || [])
      .map((result) => ({ result, position: getSearchResultPosition(result) }))
      .filter((item) => item.position),
    [results]
  );

  useEffect(() => {
    if (!validResults.length) return;
    if (validResults.length === 1) {
      map.setView(validResults[0].position, Math.max(map.getZoom(), 10), { animate: true });
      return;
    }
    const bounds = L.latLngBounds(validResults.map((item) => item.position));
    if (bounds.isValid()) {
      map.fitBounds(bounds.pad(0.22), { padding: [42, 42], maxZoom: 10, animate: true });
    }
  }, [map, validResults]);

  return (
    <>
      {validResults.map(({ result, position }) => (
        <Marker
          key={`search-result-${result.place_id || `${position[0]}-${position[1]}`}`}
          position={position}
          icon={createSearchResultIcon(result.display_name)}
          zIndexOffset={700}
        >
          <Popup>
            <div className="map-search-popup">
              <strong>{(result.display_name || "Place").split(",")[0]}</strong>
              <p>{result.display_name}</p>
              <button type="button" onClick={() => onAddResult(result)}>
                Add to {targetLabel} route
              </button>
            </div>
          </Popup>
        </Marker>
      ))}
    </>
  );
}
export function ClusteredTripMarkers({
  trips,
  selectedTripIdsSet,
  hasExplicitSelection,
  onToggleTripSelection,
  onShowTripDetail,
}) {
  const map = useMap();

  useEffect(() => {
    const globalLeaflet = typeof window !== "undefined" ? window.L : null;
    const clusterFactory = L.markerClusterGroup || globalLeaflet?.markerClusterGroup;
    if (typeof clusterFactory !== "function") return undefined;

    const clusterGroup = clusterFactory({
      chunkedLoading: true,
      disableClusteringAtZoom: 10,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
    });

    trips.forEach((trip) => {
      const isSelected = selectedTripIdsSet.has(trip.id);
      const shouldHighlight = !hasExplicitSelection || isSelected;
      (trip.route || []).forEach((point, idx) => {
        const marker = L.marker([point.lat, point.lng], {
          icon: getTripMarkerIcon(trip.trip_kind),
          opacity: shouldHighlight ? 1 : 0.55,
        });
        marker.on("click", () => {
          onToggleTripSelection(trip.id);
          onShowTripDetail(trip, point.label || `Stop ${idx + 1}`, [point.lat, point.lng]);
        });
        clusterGroup.addLayer(marker);
      });
    });

    map.addLayer(clusterGroup);
    return () => {
      map.removeLayer(clusterGroup);
    };
  }, [map, trips, selectedTripIdsSet, hasExplicitSelection, onToggleTripSelection, onShowTripDetail]);

  return null;
}

export function TripHeatmapLayer({ trips }) {
  const map = useMap();

  useEffect(() => {
    const globalLeaflet = typeof window !== "undefined" ? window.L : null;
    const heatFactory = L.heatLayer || globalLeaflet?.heatLayer;
    if (typeof heatFactory !== "function") return undefined;

    const bucketedPoints = new Map();
    trips.forEach((trip) => {
      (trip.route || []).forEach((point) => {
        const key = `${point.lat.toFixed(2)}|${point.lng.toFixed(2)}`;
        const existing = bucketedPoints.get(key);
        if (existing) {
          existing.count += 1;
          return;
        }
        bucketedPoints.set(key, { lat: point.lat, lng: point.lng, count: 1 });
      });
    });

    const pointList = [...bucketedPoints.values()];
    if (!pointList.length) return undefined;

    const maxCount = Math.max(...pointList.map((point) => point.count));
    const heatPoints = pointList.map((point) => [
      point.lat,
      point.lng,
      Math.max(0.25, point.count / Math.max(1, maxCount)),
    ]);

    const heatLayer = heatFactory(heatPoints, {
      radius: 28,
      blur: 24,
      minOpacity: 0.3,
      maxZoom: 7,
      gradient: {
        0.2: "#4cc9f0",
        0.4: "#3a86ff",
        0.6: "#ffbe0b",
        0.8: "#fb5607",
        1: "#d00000",
      },
    });

    map.addLayer(heatLayer);
    return () => {
      map.removeLayer(heatLayer);
    };
  }, [map, trips]);

  return null;
}
