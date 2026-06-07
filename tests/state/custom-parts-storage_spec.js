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

const STORAGE_KEY = "lpc.customParts.v1";

describe("state/custom-parts-storage.ts", () => {
  beforeEach(() => {
    clearCustomParts({ persist: false });
    window.localStorage.removeItem(STORAGE_KEY);
  });

  afterEach(() => {
    clearCustomParts();
    window.localStorage.removeItem(STORAGE_KEY);
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

    expect(window.localStorage.getItem(STORAGE_KEY)).to.be.a("string");

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

  it("persists custom part rename and delete actions", () => {
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

    expect(
      renameCustomPart("custom_weapon_manage_test", "Renamed Axe"),
    ).to.equal(true);
    const renamedPayload = JSON.parse(
      window.localStorage.getItem(STORAGE_KEY) ?? "{}",
    );
    expect(renamedPayload.parts[0].name).to.equal("Renamed Axe");

    expect(deleteCustomPart("custom_weapon_manage_test")).to.equal(true);
    expect(customParts.custom_weapon_manage_test).to.equal(undefined);
    expect(window.localStorage.getItem(STORAGE_KEY)).to.equal(null);
  });
});
