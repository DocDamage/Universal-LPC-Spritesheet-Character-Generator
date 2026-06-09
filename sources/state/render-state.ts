// Render state extracted from canvas/renderer.ts to break the state↔canvas
// circular dependency.  These values are produced by the renderer and consumed
// by state-layer export / tween logic.

import type { Recolors } from "./palettes.ts";

export type LayerSource =
  | { kind: "catalog"; spritePath: string }
  | { kind: "custom"; image: HTMLCanvasElement | HTMLImageElement };

export type DrawCall = {
  itemId: string;
  name?: string;
  variant: string | null;
  recolors?: Recolors;
  zPos: number;
  layerNum: number;
  animation: string;
  yPos: number;
  needsRecolor?: boolean;
  source: LayerSource;
};

type CustomSpriteAreaItem = {
  type: "custom_sprite";
  zPos: number;
  source: LayerSource;
  itemId: string;
  animation: string;
  recolors: Recolors;
  variant: string | null;
  name?: string;
};

type ExtractedFramesAreaItem = {
  type: "extracted_frames";
  zPos: number;
  source: { kind: "catalog"; spritePath: string };
  itemId: string;
  animation: string;
  needsRecolor?: boolean;
  recolors?: Recolors;
  variant: string | null;
  name?: string;
};

export type CustomAreaItem = CustomSpriteAreaItem | ExtractedFramesAreaItem;

/** Mutable render-state container so canvas layer can write in-place without
 *  violating ES-module import immutability rules. */
export const renderState = {
  /** Flat list of queued draw operations produced by the last `renderCharacter`. */
  drawCalls: [] as DrawCall[],

  /** Set of custom-animation names that were added during the last render. */
  addedCustomAnimations: new Set<string>(),

  /** Per-custom-animation items collected during the last render. */
  customAreaItems: {} as Record<string, CustomAreaItem[]>,
};
