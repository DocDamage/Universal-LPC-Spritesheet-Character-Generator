import { spawnSync } from "node:child_process";

const args = ["exec", "vitest", "run", "tests/node"];
const result = spawnSync(
  process.platform === "win32" ? "npm.cmd" : "npm",
  args,
  { stdio: "inherit", shell: false },
);

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

process.exit(result.status ?? 1);
