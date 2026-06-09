import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const host = process.env["VITE_DEV_HOST"] || "127.0.0.1";
const port = Number(process.env["VITE_DEV_PORT"] || 5173);
const url = `http://${host}:${port}/`;

function openUrl() {
  if (process.platform === "win32") {
    spawn("cmd", ["/c", "start", "", url], {
      detached: true,
      stdio: "ignore",
      shell: false,
    }).unref();
    return;
  }

  const command = process.platform === "darwin" ? "open" : "xdg-open";
  spawn(command, [url], {
    detached: true,
    stdio: "ignore",
    shell: false,
  }).unref();
}

process.stdout.write(`Starting Vite at ${url}\n`);
const { createServer } = await import("vite");
const server = await createServer({
  root: rootDir,
  server: {
    host,
    port,
    strictPort: true,
  },
});

await server.listen();
server.printUrls();
openUrl();
process.stdout.write(`Opened ${url}\n`);

/** @type {NodeJS.Signals[]} */
const shutdownSignals = ["SIGINT", "SIGTERM"];

for (const signal of shutdownSignals) {
  process.on(signal, async () => {
    await server.close();
    process.exit(0);
  });
}
