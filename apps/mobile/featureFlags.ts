type FlagName =
  | "mapAdvancedLayers"
  | "mapClusters"
  | "mapHeatmap"
  | "calendarIcsShare"
  | "profileResetInApp";

function envFlag(value: string | undefined, fallback: boolean) {
  if (!value) return fallback;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

export const featureFlags: Record<FlagName, boolean> = {
  mapAdvancedLayers: envFlag(process.env.EXPO_PUBLIC_FEATURE_MAP_ADVANCED_LAYERS, true),
  mapClusters: envFlag(process.env.EXPO_PUBLIC_FEATURE_MAP_CLUSTERS, true),
  mapHeatmap: envFlag(process.env.EXPO_PUBLIC_FEATURE_MAP_HEATMAP, false),
  calendarIcsShare: envFlag(process.env.EXPO_PUBLIC_FEATURE_CALENDAR_ICS_SHARE, true),
  profileResetInApp: envFlag(process.env.EXPO_PUBLIC_FEATURE_PROFILE_RESET_IN_APP, true),
};
