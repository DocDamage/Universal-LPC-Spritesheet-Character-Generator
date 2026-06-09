// Custom weapon import — types

import type { Selections } from "../../../state/state.ts";
import type { CatalogReader } from "../../../state/catalog.ts";

export type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type SourceMode = "fullSheet" | "singleImage";

export type ImportWeaponOptions = {
  file: File;
  name: string;
  referenceItemId: string;
  referenceVariant: string | null;
  bodyType: string;
  selections: Selections;
  catalog: CatalogReader;
  offsetX?: number;
  offsetY?: number;
  scalePercent?: number;
};

export type ReferenceSprite = {
  img: HTMLImageElement;
  zPos: number;
};

export type ImportAdjustment = {
  offsetX: number;
  offsetY: number;
  scale: number;
};
