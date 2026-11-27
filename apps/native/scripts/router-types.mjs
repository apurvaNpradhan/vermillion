// Regenerates `.expo/types/router.d.ts` (typed routes) without starting Metro, so a new route
// typechecks on machines or worktrees where `expo start` cannot get file watchers.
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const require = createRequire(path.join(root, "package.json"));
const expoDir = path.dirname(require.resolve("expo/package.json"));
const cliRequire = createRequire(path.join(expoDir, "package.json"));
const cliDir = path.dirname(cliRequire.resolve("@expo/cli/package.json"));
const { setupTypedRoutes } = cliRequire(
  path.join(cliDir, "build/src/start/server/type-generation/routes.js"),
);
const typesDirectory = path.join(root, ".expo/types");
await mkdir(typesDirectory, { recursive: true });
await setupTypedRoutes({
  projectRoot: root,
  typesDirectory,
  routerDirectory: path.join(root, "app"),
  plugin: {},
});
