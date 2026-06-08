// @ts-nocheck
import fs from "node:fs";
import path from "node:path";

const wasmFileName = "a.out.wasm";

export function vitePluginWebpEncoderWasm(rootDir) {
  const wasmPath = path.resolve(
    rootDir,
    "node_modules/webp-encoder/lib/assets",
    wasmFileName,
  );

  return {
    name: "webp-encoder-wasm",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url !== `/${wasmFileName}`) {
          next();
          return;
        }

        res.setHeader("Content-Type", "application/wasm");
        fs.createReadStream(wasmPath).pipe(res);
      });
    },
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: wasmFileName,
        source: fs.readFileSync(wasmPath),
      });
    },
  };
}
