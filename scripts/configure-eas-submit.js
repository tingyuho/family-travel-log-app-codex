const fs = require("node:fs");
const path = require("node:path");

const ascAppId = String(process.env.ASC_APP_ID || "").trim();
if (!/^\d{6,15}$/.test(ascAppId)) {
  console.error("ASC_APP_ID must be the numeric App Store Connect app ID.");
  process.exit(1);
}

const easPath = path.resolve(__dirname, "..", "apps", "mobile", "eas.json");
const eas = JSON.parse(fs.readFileSync(easPath, "utf8"));
eas.submit ||= {};
eas.submit.production ||= {};
eas.submit.production.ios = {
  ...(eas.submit.production.ios || {}),
  ascAppId,
};
fs.writeFileSync(easPath, `${JSON.stringify(eas, null, 2)}\n`, "utf8");
console.log("Configured the temporary EAS submit profile for App Store Connect.");
