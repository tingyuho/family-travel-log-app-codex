const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const mobileRoot = path.join(root, "apps", "mobile");
const easConfig = JSON.parse(fs.readFileSync(path.join(mobileRoot, "eas.json"), "utf8"));

process.env.APP_ENV = "production";
process.env.EAS_BUILD_PROFILE = "production";
process.env.EXPO_PUBLIC_API_BASE_URL ||= "https://api.example.invalid";
const { expo } = require(path.join(mobileRoot, "app.config.js"));

const errors = [];
const productionProfile = easConfig.build?.production;
if (easConfig.cli?.appVersionSource !== "remote") errors.push("EAS appVersionSource must be remote");
if (productionProfile?.environment !== "production") errors.push("EAS production profile must select the production environment");
if (productionProfile?.distribution !== "store") errors.push("EAS production profile must use store distribution");
if (productionProfile?.autoIncrement !== true) errors.push("EAS production profile must auto-increment build numbers");
if (!easConfig.submit?.production?.ios) errors.push("EAS production iOS submit profile is missing");
if (process.env.REQUIRE_EAS_SUBMIT_ID === "1" && !/^\d{6,15}$/.test(easConfig.submit?.production?.ios?.ascAppId || "")) {
  errors.push("EAS production submit profile requires a numeric ascAppId");
}

const bundleIdentifier = expo.ios?.bundleIdentifier || "";
if (!/^[A-Za-z][A-Za-z0-9-]*(\.[A-Za-z0-9-]+)+$/.test(bundleIdentifier)) {
  errors.push("iOS bundle identifier is missing or invalid");
}
if (bundleIdentifier.includes("yourname") || bundleIdentifier.includes("example")) {
  errors.push("iOS bundle identifier still contains a placeholder");
}
if (!expo.owner || !expo.extra?.eas?.projectId) errors.push("Expo owner or EAS project ID is missing");

const iconPath = path.join(mobileRoot, expo.icon || "");
if (!expo.icon || !fs.existsSync(iconPath)) {
  errors.push("App Store icon is missing");
} else {
  const icon = fs.readFileSync(iconPath);
  const width = icon.length >= 24 ? icon.readUInt32BE(16) : 0;
  const height = icon.length >= 24 ? icon.readUInt32BE(20) : 0;
  if (width !== height || width < 1024) {
    errors.push(`App icon must be square and at least 1024x1024; found ${width}x${height}`);
  }
}

const maestroFlow = fs.readFileSync(path.join(mobileRoot, "e2e", "maestro", "smoke.yaml"), "utf8");
if (!maestroFlow.includes(`appId: ${bundleIdentifier}`)) {
  errors.push(`Maestro smoke flow must target ${bundleIdentifier}`);
}

if (errors.length) {
  console.error(`iOS release preflight failed:\n- ${errors.join("\n- ")}`);
  process.exit(1);
}
console.log(`iOS release preflight passed for ${bundleIdentifier} (${expo.version}).`);
