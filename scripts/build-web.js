const path = require("node:path");
const { normalizePublicHttpsUrl } = require("./production-env");

async function main() {
  process.env.VITE_API_BASE_URL = normalizePublicHttpsUrl(
    process.env.VITE_API_BASE_URL,
    "VITE_API_BASE_URL"
  );
  const root = path.resolve(__dirname, "..", "apps", "web");
  const [{ build }, reactModule] = await Promise.all([
    import("vite"),
    import("@vitejs/plugin-react"),
  ]);

  await build({
    root,
    configFile: false,
    plugins: [reactModule.default()],
    server: {
      host: "0.0.0.0",
      port: 5173,
      proxy: {
        "/api": {
          target: "http://127.0.0.1:8000",
          changeOrigin: true,
        },
        "/health": {
          target: "http://127.0.0.1:8000",
          changeOrigin: true,
        },
      },
    },
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
