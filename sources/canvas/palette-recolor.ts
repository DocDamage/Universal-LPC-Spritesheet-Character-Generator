// Runtime palette swapping for LPC sprites
// Re-exports for backward compatibility; split into focused modules below.

export {
  recolorImage,
  getRecolorStats,
  resetRecolorStats,
  setPaletteRecolorMode,
  getPaletteRecolorConfig,
} from "./recolor-config.ts";
export type {
  RecolorStats,
  RecolorMode,
  RecolorConfig,
} from "./recolor-config.ts";

export { getImageToDraw, clearRecolorCache } from "./recolor-cache.ts";

export { loadPalette, recolorWithPalette } from "./recolor-palette.ts";
export type { LoadPaletteError } from "./recolor-palette.ts";

export { drawRecolorPreview } from "./recolor-preview.ts";
