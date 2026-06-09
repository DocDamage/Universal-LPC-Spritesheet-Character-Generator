// Palette recolor configuration, stats, and dispatch (WebGL vs CPU)

import {
  recolorImageWebGL,
  isWebGLAvailable,
} from "./webgl-palette-recolor.ts";
import { recolorImageCPU } from "./recolor-cpu.ts";
import { debugLog, debugWarn } from "../utils/debug.ts";
import type { PaletteMapping } from "./webgl-palette-recolor.ts";

// Configuration flags
const config = {
  forceCPU: false, // Set to true to force CPU mode even if WebGL is available
  useWebGL: isWebGLAvailable(),
};

// Check WebGL availability once at module load
const USE_WEBGL = config.useWebGL && !config.forceCPU;

// Log which method will be used
if (USE_WEBGL) {
  debugLog("🎨 Palette recoloring: WebGL GPU-accelerated mode enabled");
  debugLog("💡 To check stats, run: window.getPaletteRecolorStats()");
  debugLog('💡 To force CPU mode, run: window.setPaletteRecolorMode("cpu")');
} else if (config.forceCPU) {
  debugLog("🎨 Palette recoloring: CPU mode (forced by configuration)");
} else {
  debugLog("🎨 Palette recoloring: CPU mode (WebGL not available)");
}

export type RecolorStats = { webgl: number; cpu: number; fallback: number };
export type RecolorMode = "webgl" | "cpu";
export type RecolorConfig = {
  forceCPU: boolean;
  useWebGL: boolean;
  activeMode: RecolorMode;
};

// Track recolor stats for debugging
let recolorStats: RecolorStats = { webgl: 0, cpu: 0, fallback: 0 };

/** Get recolor statistics. */
export function getRecolorStats(): RecolorStats {
  return { ...recolorStats };
}

/** Reset recolor statistics. */
export function resetRecolorStats(): void {
  recolorStats = { webgl: 0, cpu: 0, fallback: 0 };
}

/**
 * Set palette recolor mode.
 * Runtime guard preserved: main.js attaches this to `window` and the dev
 * console may pass arbitrary strings.
 */
export function setPaletteRecolorMode(mode: RecolorMode): void {
  if (mode === "cpu") {
    config.forceCPU = true;
    debugLog("🎨 Switched to CPU mode (forced)");
  } else if (mode === "webgl") {
    if (config.useWebGL) {
      config.forceCPU = false;
      debugLog("🎨 Switched to WebGL mode");
    } else {
      debugWarn("⚠️ WebGL not available on this browser");
    }
  } else {
    console.error('Invalid mode. Use "webgl" or "cpu"');
  }
}

/** Get current palette recolor configuration. */
export function getPaletteRecolorConfig(): RecolorConfig {
  return {
    ...config,
    activeMode: !config.forceCPU && config.useWebGL ? "webgl" : "cpu",
  };
}

/**
 * Recolor an image using one or more palette mappings in a single pass.
 * Automatically uses WebGL if available, falls back to CPU.
 */
export function recolorImage(
  sourceImage: HTMLImageElement | HTMLCanvasElement,
  paletteMappings: PaletteMapping[],
): HTMLCanvasElement {
  const shouldUseWebGL = config.useWebGL && !config.forceCPU;

  if (shouldUseWebGL) {
    try {
      recolorStats.webgl++;
      return recolorImageWebGL(sourceImage, paletteMappings);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn("⚠️ WebGL recoloring failed, falling back to CPU:", error);
      recolorStats.fallback++;
      return recolorImageCPU(sourceImage, paletteMappings);
    }
  }
  recolorStats.cpu++;
  return recolorImageCPU(sourceImage, paletteMappings);
}
