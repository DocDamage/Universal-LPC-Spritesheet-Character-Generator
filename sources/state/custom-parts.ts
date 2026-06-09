/**
 * Custom parts CRUD — split from the monolithic catalog module.
 *
 * Manages the in-memory and persisted custom part registry. Consumers that
 * previously imported these functions from `catalog.ts` can continue to do so
 * (they're re-exported there) or switch to this focused module.
 */

import { createCanvas } from "../canvas/canvas-utils.ts";
import {
  loadStoredCustomParts,
  persistCustomParts,
} from "./custom-parts-storage.ts";
import type { CustomPart } from "./catalog-types.ts";

// ────────────────────────────────────────────────────────────────────────────
// Global registry
// ────────────────────────────────────────────────────────────────────────────

const customPartGlobal = globalThis as typeof globalThis & {
  __LPC_customParts?: Record<string, CustomPart>;
};

export const customParts: Record<string, CustomPart> =
  (customPartGlobal.__LPC_customParts ??= {});

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

type RegisterCustomPartOptions = {
  persist?: boolean;
};

// ────────────────────────────────────────────────────────────────────────────
// CRUD functions
// ────────────────────────────────────────────────────────────────────────────

export function registerCustomPart(
  part: CustomPart,
  options: RegisterCustomPartOptions = {},
): void {
  customParts[part.itemId] = part;
  if (options.persist !== false) {
    persistCustomParts(customParts);
  }
}

export function getCustomPart(id: string): CustomPart | undefined {
  return customParts[id];
}

export function renameCustomPart(
  id: string,
  name: string,
  options: RegisterCustomPartOptions = {},
): boolean {
  const part = customParts[id];
  if (!part) return false;

  part.name = name;
  if (options.persist !== false) {
    persistCustomParts(customParts);
  }
  return true;
}

export function duplicateCustomPart(
  id: string,
  options: RegisterCustomPartOptions = {},
): CustomPart | null {
  const part = customParts[id];
  if (!part) return null;

  const newItemId = `custom_${part.type_name}_${Date.now()}`;
  const newSheets: Record<string, HTMLCanvasElement> = {};
  for (const [animation, sheet] of Object.entries(part.sheets)) {
    const { canvas: newCanvas, ctx } = createCanvas(
      sheet.width,
      sheet.height,
      true,
    );
    ctx.drawImage(sheet, 0, 0);
    newSheets[animation] = newCanvas;
  }

  const firstSheet = newSheets["walk"] ?? Object.values(newSheets)[0];
  const duplicated: CustomPart = {
    itemId: newItemId,
    name: `${part.name} (Copy)`,
    type_name: part.type_name,
    baseItemId: part.baseItemId,
    drawLayerNum: part.drawLayerNum,
    drawZPos: part.drawZPos,
    tags: part.tags ? [...part.tags] : undefined,
    sheets: newSheets,
    image: firstSheet,
  };

  registerCustomPart(duplicated, options);
  return duplicated;
}

export function deleteCustomPart(
  id: string,
  options: RegisterCustomPartOptions = {},
): boolean {
  if (!customParts[id]) return false;

  delete customParts[id];
  if (options.persist !== false) {
    persistCustomParts(customParts);
  }
  return true;
}

export function clearCustomParts(
  options: RegisterCustomPartOptions = {},
): void {
  for (const itemId of Object.keys(customParts)) {
    delete customParts[itemId];
  }
  if (options.persist !== false) {
    persistCustomParts(customParts);
  }
}

export async function hydrateCustomPartsFromStorage(): Promise<void> {
  const parts = await loadStoredCustomParts();
  for (const part of parts) {
    registerCustomPart(part, { persist: false });
  }
}
