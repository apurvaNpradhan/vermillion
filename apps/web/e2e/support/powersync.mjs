// A disposable PowerSync service for the browser suite. Never point browser tests at the dev
// service: uploads go to E2E_DATABASE_URL, so downloads must replicate that same database.
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const linux = process.platform === "linux";
const host = linux ? "127.0.0.1" : "host.docker.internal";
const source = new URL(process.env.E2E_DATABASE_URL);
if (["localhost", "127.0.0.1", "[::1]"].includes(source.hostname)) source.hostname = host;
const storage = new URL(source);
storage.pathname += "_powersync";
const port = process.env.E2E_POWERSYNC_PORT;
const name = `vermillion-e2e-powersync-${process.pid}`;
const configDir = fileURLToPath(new URL("../../../../powersync/", import.meta.url));
const args = [
  "run",
  "--rm",
  "--name",
  name,
  ...(linux ? ["--network", "host"] : ["-p", `127.0.0.1:${port}:${port}`]),
  "-v",
  `${configDir}:/config:ro`,
  ...Object.entries({
    POWERSYNC_CONFIG_PATH: "/config/service.yaml",
    PS_PORT: port,
    PS_SSLMODE: "disable",
    PS_DATA_SOURCE_URI: source.toString(),
    PS_STORAGE_SOURCE_URI: storage.toString(),
    PS_JWKS_URI: `http://${host}:${process.env.E2E_SERVER_PORT}/api/auth/jwks`,
    PS_ADMIN_TOKEN: "e2e-only-admin-token",
  }).flatMap(([key, value]) => ["-e", `${key}=${value}`]),
  "journeyapps/powersync-service:1.28.1@sha256:4955ebd8218d076f23296750f658c2973ce1dcd2ba49a6c7a7c3320acf97325c",
  "start",
  "-r",
  "unified",
];
const child = spawn("docker", args, { stdio: "inherit" });
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    spawnSync("docker", ["stop", "--time", "5", name], { stdio: "inherit" });
  });
}
child.on("error", (error) => {
  console.error(error);
  process.exit(1);
});
child.on("exit", (code) => process.exit(code ?? 1));
