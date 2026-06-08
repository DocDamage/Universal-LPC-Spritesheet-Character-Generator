import { createCanvas, get2DContext } from "../canvas/canvas-utils.ts";
import { debugWarn } from "../utils/debug.ts";
import type { CustomPart } from "./catalog.ts";
import type { ZipFolder } from "../utils/zip-helpers.ts";

export const CUSTOM_PARTS_LEGACY_STORAGE_KEY = "lpc.customParts.v1";

const DB_NAME = "lpc-custom-parts";
const DB_VERSION = 1;
const STORE_NAME = "customParts";

type StoredCustomPart = {
  version: 1;
  itemId: string;
  name: string;
  type_name: string;
  baseItemId: string;
  drawLayerNum?: number;
  drawZPos?: number;
  tags?: string[];
  sheets: Record<string, string>;
};

type StoredCustomPartsPayload = {
  version: 1;
  parts: StoredCustomPart[];
};

let pendingPersist: Promise<void> = Promise.resolve();

export function persistCustomParts(parts: Record<string, CustomPart>): void {
  const storedParts = Object.values(parts)
    .map(serializeCustomPart)
    .filter((part): part is StoredCustomPart => part !== null);

  void enqueuePersist(storedParts);
}

export async function loadStoredCustomParts(): Promise<CustomPart[]> {
  const indexedDb = getCustomPartsIndexedDb();
  if (indexedDb) {
    try {
      const indexedParts = await readPartsFromIndexedDb(indexedDb);
      if (indexedParts.length > 0) {
        clearLegacyLocalStorage();
        return deserializeCustomParts(indexedParts);
      }
    } catch (err) {
      debugWarn("Unable to load custom parts from IndexedDB:", err);
    }
  }

  const legacyParts = readPartsFromLegacyLocalStorage();
  if (legacyParts.length === 0) return [];

  if (indexedDb) {
    try {
      await writePartsToIndexedDb(indexedDb, legacyParts);
      clearLegacyLocalStorage();
    } catch (err) {
      debugWarn("Unable to migrate custom parts to IndexedDB:", err);
    }
  }

  return deserializeCustomParts(legacyParts);
}

export async function waitForCustomPartsPersistence(): Promise<void> {
  await pendingPersist;
}

export async function clearStoredCustomPartsForTests(): Promise<void> {
  await enqueuePersist([]);
  pendingPersist = Promise.resolve();
}

function enqueuePersist(parts: StoredCustomPart[]): Promise<void> {
  pendingPersist = pendingPersist.then(
    () => persistStoredParts(parts),
    () => persistStoredParts(parts),
  );
  return pendingPersist;
}

async function persistStoredParts(parts: StoredCustomPart[]): Promise<void> {
  const indexedDb = getCustomPartsIndexedDb();
  if (indexedDb) {
    try {
      await writePartsToIndexedDb(indexedDb, parts);
      clearLegacyLocalStorage();
      return;
    } catch (err) {
      debugWarn("Unable to persist custom parts to IndexedDB:", err);
    }
  }

  persistPartsToLegacyLocalStorage(parts);
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
    tags: part.tags,
    sheets,
  };
}

async function deserializeCustomParts(
  parts: StoredCustomPart[],
): Promise<CustomPart[]> {
  const customParts = await Promise.all(parts.map(deserializeCustomPart));
  return customParts.filter((part): part is CustomPart => part !== null);
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
    tags: stored.tags,
    sheets,
    image: firstSheet,
  };
}

function canvasFromDataUrl(dataUrl: string): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const { canvas } = createCanvas(
        img.naturalWidth || img.width,
        img.naturalHeight || img.height,
        true,
      );
      get2DContext(canvas, true).drawImage(img, 0, 0);
      resolve(canvas);
    };
    img.onerror = () => reject(new Error("Unable to load custom part sheet."));
    img.src = dataUrl;
  });
}

function getCustomPartsIndexedDb(): IDBFactory | null {
  if (
    typeof window === "undefined" ||
    typeof window.indexedDB === "undefined"
  ) {
    return null;
  }

  try {
    return window.indexedDB;
  } catch {
    return null;
  }
}

function openCustomPartsDb(indexedDb: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDb.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "itemId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Unable to open custom parts store."));
  });
}

async function writePartsToIndexedDb(
  indexedDb: IDBFactory,
  parts: StoredCustomPart[],
): Promise<void> {
  const db = await openCustomPartsDb(indexedDb);
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      store.clear();
      for (const part of parts) {
        store.put(part);
      }
      transaction.oncomplete = () => resolve();
      transaction.onerror = () =>
        reject(transaction.error ?? new Error("Unable to write custom parts."));
      transaction.onabort = () =>
        reject(transaction.error ?? new Error("Custom parts write aborted."));
    });
  } finally {
    db.close();
  }
}

async function readPartsFromIndexedDb(
  indexedDb: IDBFactory,
): Promise<StoredCustomPart[]> {
  const db = await openCustomPartsDb(indexedDb);
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readonly");
      const request = transaction.objectStore(STORE_NAME).getAll();
      request.onsuccess = () =>
        resolve(
          (request.result as Partial<StoredCustomPart>[]).filter(
            isStoredCustomPart,
          ),
        );
      request.onerror = () =>
        reject(request.error ?? new Error("Unable to read custom parts."));
    });
  } finally {
    db.close();
  }
}

function isStoredCustomPart(
  part: Partial<StoredCustomPart>,
): part is StoredCustomPart {
  return (
    part.version === 1 &&
    typeof part.itemId === "string" &&
    typeof part.name === "string" &&
    typeof part.type_name === "string" &&
    typeof part.baseItemId === "string" &&
    !!part.sheets &&
    typeof part.sheets === "object"
  );
}

function readPartsFromLegacyLocalStorage(): StoredCustomPart[] {
  const storage = getCustomPartsStorage();
  if (!storage) return [];

  let rawPayload: string | null;
  try {
    rawPayload = storage.getItem(CUSTOM_PARTS_LEGACY_STORAGE_KEY);
  } catch (err) {
    debugWarn("Unable to read legacy custom parts:", err);
    return [];
  }

  if (!rawPayload) return [];

  try {
    const payload = JSON.parse(rawPayload) as Partial<StoredCustomPartsPayload>;
    if (payload.version !== 1 || !Array.isArray(payload.parts)) return [];
    return payload.parts.filter(isStoredCustomPart);
  } catch (err) {
    debugWarn("Unable to load legacy custom parts:", err);
    return [];
  }
}

function persistPartsToLegacyLocalStorage(parts: StoredCustomPart[]): void {
  const storage = getCustomPartsStorage();
  if (!storage) return;

  try {
    if (parts.length === 0) {
      storage.removeItem(CUSTOM_PARTS_LEGACY_STORAGE_KEY);
      return;
    }

    const payload: StoredCustomPartsPayload = {
      version: 1,
      parts,
    };
    storage.setItem(CUSTOM_PARTS_LEGACY_STORAGE_KEY, JSON.stringify(payload));
  } catch (err) {
    debugWarn("Unable to persist legacy custom parts:", err);
  }
}

function clearLegacyLocalStorage(): void {
  const storage = getCustomPartsStorage();
  if (!storage) return;
  try {
    storage.removeItem(CUSTOM_PARTS_LEGACY_STORAGE_KEY);
  } catch (err) {
    debugWarn("Unable to clear legacy custom parts:", err);
  }
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

// ─── ZIP export / import helpers ───

type WindowWithJSZip = Window & {
  JSZip?: new () => ZipFolder;
};

type ZipLoader = ZipFolder & {
  loadAsync(file: File): Promise<LoadedZip>;
};

type LoadedZipFile = {
  async(type: "string"): Promise<string>;
  async(type: "blob"): Promise<Blob>;
};

type LoadedZip = {
  file(name: string): LoadedZipFile | null;
};

export async function exportCustomPartsZip(parts: CustomPart[]): Promise<Blob> {
  const w = window as WindowWithJSZip;
  if (!w.JSZip) {
    throw new Error("JSZip library not loaded");
  }
  const JSZip = w.JSZip;
  const zip = new JSZip();

  const manifest = parts.map((part) => ({
    itemId: part.itemId,
    name: part.name,
    type_name: part.type_name,
    baseItemId: part.baseItemId,
    tags: part.tags ?? [],
    drawLayerNum: part.drawLayerNum,
    drawZPos: part.drawZPos,
    sheets: Object.keys(part.sheets),
  }));

  zip.file(
    "manifest.json",
    JSON.stringify({ version: 1, parts: manifest }, null, 2),
  );

  for (const part of parts) {
    const folder = zip.folder(part.itemId);
    for (const [animation, sheet] of Object.entries(part.sheets)) {
      const blob = await new Promise<Blob | null>((resolve) => {
        sheet.toBlob((b) => resolve(b), "image/png");
      });
      if (blob) {
        folder.file(`${animation}.png`, blob);
      }
    }
  }

  return zip.generateAsync({ type: "blob" });
}

export async function importCustomPartsZip(
  zipFile: File,
): Promise<CustomPart[]> {
  const w = window as WindowWithJSZip;
  if (!w.JSZip) {
    throw new Error("JSZip library not loaded");
  }
  const JSZip = w.JSZip;
  const zipLoader = new JSZip() as ZipLoader;
  const zip = await zipLoader.loadAsync(zipFile);

  const manifestFile = zip.file("manifest.json");
  if (!manifestFile) {
    throw new Error("Backup ZIP missing manifest.json");
  }

  const manifestRaw = await manifestFile.async("string");
  const manifest = JSON.parse(manifestRaw) as {
    version: number;
    parts: Array<{
      itemId: string;
      name: string;
      type_name: string;
      baseItemId: string;
      tags?: string[];
      drawLayerNum?: number;
      drawZPos?: number;
      sheets: string[];
    }>;
  };

  if (manifest.version !== 1 || !Array.isArray(manifest.parts)) {
    throw new Error("Invalid manifest format");
  }

  const imported: CustomPart[] = [];

  for (const meta of manifest.parts) {
    const sheets: Record<string, HTMLCanvasElement> = {};
    for (const animation of meta.sheets) {
      const imgFile = zip.file(`${meta.itemId}/${animation}.png`);
      if (!imgFile) continue;
      const imgBlob = await imgFile.async("blob");
      const dataUrl = await blobToDataUrl(imgBlob);
      const canvas = await canvasFromDataUrl(dataUrl);
      sheets[animation] = canvas;
    }

    const firstSheet = sheets.walk ?? Object.values(sheets)[0];
    if (!firstSheet) continue;

    imported.push({
      itemId: meta.itemId,
      name: meta.name,
      type_name: meta.type_name,
      baseItemId: meta.baseItemId,
      drawLayerNum: meta.drawLayerNum,
      drawZPos: meta.drawZPos,
      tags: meta.tags,
      sheets,
      image: firstSheet,
    });
  }

  return imported;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to read blob"));
    reader.readAsDataURL(blob);
  });
}
