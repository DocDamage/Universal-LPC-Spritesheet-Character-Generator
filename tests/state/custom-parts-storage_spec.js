// @ts-nocheck
import { expect } from "chai";
import { describe, it, beforeEach, afterEach } from "mocha-globals";
import {
  clearCustomParts,
  customParts,
  deleteCustomPart,
  hydrateCustomPartsFromStorage,
  registerCustomPart,
  renameCustomPart,
} from "../../sources/state/catalog.ts";
import { get2DContext } from "../../sources/canvas/canvas-utils.ts";
import {
  clearStoredCustomPartsForTests,
  CUSTOM_PARTS_LEGACY_STORAGE_KEY,
  loadStoredCustomParts,
  waitForCustomPartsPersistence,
} from "../../sources/state/custom-parts-storage.ts";

describe("state/custom-parts-storage.ts", () => {
  beforeEach(async () => {
    clearCustomParts({ persist: false });
    await clearStoredCustomPartsForTests();
    window.localStorage.removeItem(CUSTOM_PARTS_LEGACY_STORAGE_KEY);
  });

  afterEach(async () => {
    clearCustomParts({ persist: false });
    await clearStoredCustomPartsForTests();
    window.localStorage.removeItem(CUSTOM_PARTS_LEGACY_STORAGE_KEY);
  });

  it("persists registered custom parts and hydrates them back into canvases", async () => {
    const sheet = document.createElement("canvas");
    sheet.width = 4;
    sheet.height = 4;
    const ctx = get2DContext(sheet, true);
    ctx.fillStyle = "#ff0000";
    ctx.fillRect(1, 2, 1, 1);

    registerCustomPart({
      itemId: "custom_weapon_storage_test",
      name: "Stored Axe",
      type_name: "weapon",
      baseItemId: "weapon_sword_longsword",
      drawLayerNum: 4,
      drawZPos: 150,
      sheets: { walk: sheet },
      image: sheet,
    });

    await waitForCustomPartsPersistence();
    expect(
      window.localStorage.getItem(CUSTOM_PARTS_LEGACY_STORAGE_KEY),
    ).to.equal(null);
    expect(await loadStoredCustomParts()).to.have.length(1);

    clearCustomParts({ persist: false });
    expect(customParts.custom_weapon_storage_test).to.equal(undefined);

    await hydrateCustomPartsFromStorage();

    const restored = customParts.custom_weapon_storage_test;
    expect(restored).to.include({
      itemId: "custom_weapon_storage_test",
      name: "Stored Axe",
      type_name: "weapon",
      baseItemId: "weapon_sword_longsword",
      drawLayerNum: 4,
      drawZPos: 150,
    });
    expect(restored.sheets.walk).to.be.instanceOf(HTMLCanvasElement);

    const restoredPixel = get2DContext(restored.sheets.walk, true).getImageData(
      1,
      2,
      1,
      1,
    ).data;
    expect(Array.from(restoredPixel)).to.deep.equal([255, 0, 0, 255]);
  });

  it("persists imported weapon alignment metadata and multiple animation sheets", async () => {
    const walkSheet = document.createElement("canvas");
    walkSheet.width = 4;
    walkSheet.height = 4;
    const walkCtx = get2DContext(walkSheet, true);
    walkCtx.fillStyle = "#ff0000";
    walkCtx.fillRect(1, 1, 1, 1);

    const slashSheet = document.createElement("canvas");
    slashSheet.width = 6;
    slashSheet.height = 8;
    const slashCtx = get2DContext(slashSheet, true);
    slashCtx.fillStyle = "#0000ff";
    slashCtx.fillRect(3, 5, 1, 1);

    registerCustomPart({
      itemId: "custom_weapon_import_persistence_test",
      name: "Imported Hammer",
      type_name: "weapon",
      baseItemId: "weapon_sword_longsword",
      drawLayerNum: 5,
      drawZPos: 175,
      sheets: { walk: walkSheet, slash: slashSheet },
      image: walkSheet,
    });

    await waitForCustomPartsPersistence();
    clearCustomParts({ persist: false });

    await hydrateCustomPartsFromStorage();

    const restored = customParts.custom_weapon_import_persistence_test;
    expect(restored).to.include({
      itemId: "custom_weapon_import_persistence_test",
      name: "Imported Hammer",
      type_name: "weapon",
      baseItemId: "weapon_sword_longsword",
      drawLayerNum: 5,
      drawZPos: 175,
    });
    expect(Object.keys(restored.sheets).sort()).to.deep.equal([
      "slash",
      "walk",
    ]);
    expect(restored.image).to.equal(restored.sheets.walk);
    expect(restored.sheets.slash.width).to.equal(6);
    expect(restored.sheets.slash.height).to.equal(8);

    const restoredWalkPixel = get2DContext(
      restored.sheets.walk,
      true,
    ).getImageData(1, 1, 1, 1).data;
    const restoredSlashPixel = get2DContext(
      restored.sheets.slash,
      true,
    ).getImageData(3, 5, 1, 1).data;

    expect(Array.from(restoredWalkPixel)).to.deep.equal([255, 0, 0, 255]);
    expect(Array.from(restoredSlashPixel)).to.deep.equal([0, 0, 255, 255]);
  });

  it("persists custom part rename and delete actions", async () => {
    const sheet = document.createElement("canvas");
    sheet.width = 1;
    sheet.height = 1;

    registerCustomPart({
      itemId: "custom_weapon_manage_test",
      name: "Managed Axe",
      type_name: "weapon",
      baseItemId: "weapon_sword_longsword",
      sheets: { walk: sheet },
      image: sheet,
    });
    await waitForCustomPartsPersistence();

    expect(
      renameCustomPart("custom_weapon_manage_test", "Renamed Axe"),
    ).to.equal(true);
    await waitForCustomPartsPersistence();
    expect((await loadStoredCustomParts())[0].name).to.equal("Renamed Axe");

    expect(deleteCustomPart("custom_weapon_manage_test")).to.equal(true);
    await waitForCustomPartsPersistence();
    expect(customParts.custom_weapon_manage_test).to.equal(undefined);
    expect(await loadStoredCustomParts()).to.deep.equal([]);
  });

  it("migrates legacy localStorage custom parts into IndexedDB", async () => {
    const sheet = document.createElement("canvas");
    sheet.width = 2;
    sheet.height = 2;
    get2DContext(sheet, true).fillRect(0, 0, 1, 1);

    window.localStorage.setItem(
      CUSTOM_PARTS_LEGACY_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        parts: [
          {
            version: 1,
            itemId: "custom_weapon_legacy_test",
            name: "Legacy Axe",
            type_name: "weapon",
            baseItemId: "weapon_sword_longsword",
            drawLayerNum: 4,
            drawZPos: 150,
            sheets: { walk: sheet.toDataURL("image/png") },
          },
        ],
      }),
    );

    await hydrateCustomPartsFromStorage();

    expect(customParts.custom_weapon_legacy_test.name).to.equal("Legacy Axe");
    expect(
      window.localStorage.getItem(CUSTOM_PARTS_LEGACY_STORAGE_KEY),
    ).to.equal(null);

    clearCustomParts({ persist: false });
    await hydrateCustomPartsFromStorage();

    expect(customParts.custom_weapon_legacy_test.name).to.equal("Legacy Axe");
  });
});
