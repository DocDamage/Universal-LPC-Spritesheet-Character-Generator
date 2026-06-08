import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const DIST_FILES = [
  "item-metadata.js",
  "layers-metadata.js",
  "index-metadata.js",
];

/**
 * Ensures the `dist/` directory contains the metadata files required by audit
 * scripts.  If any are missing, runs `npm run build` and exits if the build
 * fails.
 */
export function guardDistGenerated() {
  const distDir = path.join(process.cwd(), "dist");
  const missing = DIST_FILES.filter(
    (f) => !fs.existsSync(path.join(distDir, f)),
  );
  if (missing.length === 0) return;

  // eslint-disable-next-line no-console
  console.log(
    `[audit-guard] Missing dist files: ${missing.join(", ")}. Running build...`,
  );

  const result = spawnSync(
    process.platform === "win32" ? "npm.cmd" : "npm",
    ["run", "build"],
    { stdio: "inherit", shell: false },
  );

  if (result.status !== 0) {
    // eslint-disable-next-line no-console
    console.error("[audit-guard] Build failed. Aborting audit.");
    process.exit(1);
  }

  const stillMissing = DIST_FILES.filter(
    (f) => !fs.existsSync(path.join(distDir, f)),
  );
  if (stillMissing.length > 0) {
    // eslint-disable-next-line no-console
    console.error(
      `[audit-guard] Files still missing after build: ${stillMissing.join(", ")}. Aborting.`,
    );
    process.exit(1);
  }
}
