import { spawnSync } from "node:child_process";
import path from "node:path";

const vitestBin = path.join("node_modules", "vitest", "vitest.mjs");
const result = spawnSync(process.execPath, [vitestBin, "run", "tests/node"], {
  stdio: "inherit",
  shell: false,
});

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

process.exit(result.status ?? 1);
