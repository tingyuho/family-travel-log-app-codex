const { spawn } = require("node:child_process");

const args = process.argv.slice(2);

const env = {
  ...process.env,
  EXPO_NO_DOCTOR: process.env.EXPO_NO_DOCTOR || "1",
};

let child;
if (process.platform === "win32") {
  const commandLine = `npx expo ${args.map(quoteWindowsArg).join(" ")}`.trim();
  child = spawn("cmd.exe", ["/d", "/s", "/c", commandLine], {
    cwd: process.cwd(),
    stdio: "inherit",
    env,
  });
} else {
  child = spawn("npx", ["expo", ...args], {
    cwd: process.cwd(),
    stdio: "inherit",
    env,
  });
}

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});

function quoteWindowsArg(value) {
  if (/^[a-zA-Z0-9_./:-]+$/.test(value)) return value;
  return `"${String(value).replace(/"/g, '\\"')}"`;
}
