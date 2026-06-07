import { get2DContext } from "../canvas/canvas-utils.ts";
import { debugWarn } from "../utils/debug.ts";
import type { CustomPart } from "./catalog.ts";

const STORAGE_KEY = "lpc.customParts.v1";

type StoredCustomPart = {
  version: 1;
  itemId: string;
  name: string;
  type_name: string;
  baseItemId: string;
  drawLayerNum?: number;
  drawZPos?: number;
  sheets: Record<string, string>;
};

type StoredCustomPartsPayload = {
  version: 1;
  parts: StoredCustomPart[];
};

export function persistCustomParts(parts: Record<string, CustomPart>): void {
  const storage = getCustomPartsStorage();
  if (!storage) return;

  const storedParts = Object.values(parts)
    .map(serializeCustomPart)
    .filter((part): part is StoredCustomPart => part !== null);

  try {
    if (storedParts.length === 0) {
      storage.removeItem(STORAGE_KEY);
      return;
    }

    const payload: StoredCustomPartsPayload = {
      version: 1,
      parts: storedParts,
    };
    storage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (err) {
    debugWarn("Unable to persist custom parts:", err);
  }
}

export async function loadStoredCustomParts(): Promise<CustomPart[]> {
  const storage = getCustomPartsStorage();
  if (!storage) return [];

  const rawPayload = storage.getItem(STORAGE_KEY);
  if (!rawPayload) return [];

  try {
    const payload = JSON.parse(rawPayload) as Partial<StoredCustomPartsPayload>;
    if (payload.version !== 1 || !Array.isArray(payload.parts)) return [];

    const parts = await Promise.all(
      payload.parts.map((part) => deserializeCustomPart(part)),
    );
    return parts.filter((part): part is CustomPart => part !== null);
  } catch (err) {
    debugWarn("Unable to load persisted custom parts:", err);
    return [];
  }
}

function serializeCustomPart(part: CustomPart): StoredCustomPart | null {
  const sheets: Record<string, string> = {};
  for (const [animation, sheet] of Object.entries(part.sheets)) {
    try {
      sheets[animation] = sheet.toDataURL("image/png");
    } catch (err) {
      debugWarn(`Unable to serialize custom part sheet ${animation}:`, err);
    }
  }

  if (Object.keys(sheets).length === 0) return null;

  return {
    version: 1,
    itemId: part.itemId,
    name: part.name,
    type_name: part.type_name,
    baseItemId: part.baseItemId,
    drawLayerNum: part.drawLayerNum,
    drawZPos: part.drawZPos,
    sheets,
  };
}

async function deserializeCustomPart(
  stored: Partial<StoredCustomPart>,
): Promise<CustomPart | null> {
  if (
    stored.version !== 1 ||
    !stored.itemId ||
    !stored.name ||
    !stored.type_name ||
    !stored.baseItemId ||
    !stored.sheets
  ) {
    return null;
  }

  const sheets: Record<string, HTMLCanvasElement> = {};
  for (const [animation, dataUrl] of Object.entries(stored.sheets)) {
    if (typeof dataUrl !== "string") continue;
    try {
      sheets[animation] = await canvasFromDataUrl(dataUrl);
    } catch (err) {
      debugWarn(`Unable to deserialize custom part sheet ${animation}:`, err);
    }
  }

  const firstSheet = sheets.walk ?? Object.values(sheets)[0];
  if (!firstSheet) return null;

  return {
    itemId: stored.itemId,
    name: stored.name,
    type_name: stored.type_name,
    baseItemId: stored.baseItemId,
    drawLayerNum: stored.drawLayerNum,
    drawZPos: stored.drawZPos,
    sheets,
    image: firstSheet,
  };
}

function canvasFromDataUrl(dataUrl: string): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      get2DContext(canvas, true).drawImage(img, 0, 0);
      resolve(canvas);
    };
    img.onerror = () => reject(new Error("Unable to load custom part sheet."));
    img.src = dataUrl;
  });
}

function getCustomPartsStorage(): Storage | null {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
