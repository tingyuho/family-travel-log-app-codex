const { normalizePublicHttpsUrl } = require("../../scripts/production-env");

const googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY?.trim();
const appEnvironment = (process.env.APP_ENV || process.env.EAS_BUILD_PROFILE || "development").trim().toLowerCase();
const configuredApiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL?.trim() || "";
const apiBaseUrl = appEnvironment === "production"
  ? normalizePublicHttpsUrl(configuredApiBaseUrl, "EXPO_PUBLIC_API_BASE_URL")
  : configuredApiBaseUrl.replace(/\/+$/, "");
const defaultAppId = "com.tyhotw.familytravellogmobile";
const iosBundleIdentifier = process.env.EXPO_IOS_BUNDLE_IDENTIFIER?.trim() || defaultAppId;
const androidPackage = process.env.EXPO_ANDROID_PACKAGE?.trim() || defaultAppId;
const easProjectId = "ecb04a1d-d864-4c6a-bb80-3ba4e3aea87b";

/** @type {import("expo/config").ExpoConfig} */
const expoConfig = {
  name: "Family Travel Log",
  slug: "family-travel-log-mobile",
  owner: "tyhotw",
  version: "1.0.0",
  orientation: "portrait",
  jsEngine: "jsc",
  userInterfaceStyle: "light",
  icon: "./assets/app-icon.png",
  assetBundlePatterns: ["**/*"],
  extra: {
    appEnvironment,
    apiBaseUrl,
    eas: {
      projectId: easProjectId,
    },
  },
};

expoConfig.ios = {
  bundleIdentifier: iosBundleIdentifier,
  supportsTablet: false,
  infoPlist: {
    ITSAppUsesNonExemptEncryption: false,
  },
};

if (googleMapsApiKey) {
  expoConfig.ios.config = {
    ...(expoConfig.ios.config || {}),
    googleMapsApiKey,
  };
}

expoConfig.android = {
  package: androidPackage,
};

if (googleMapsApiKey) {
  expoConfig.android.config = {
    ...(expoConfig.android.config || {}),
    googleMaps: {
      apiKey: googleMapsApiKey,
    },
  };
}

module.exports = {
  expo: expoConfig,
};
