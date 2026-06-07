import { expect } from "chai";
import { describe, it } from "mocha-globals";
import { ok, err } from "neverthrow";
import { get2DContext } from "../../../sources/canvas/canvas-utils.ts";
import {
  ANIMATION_OFFSETS,
  FRAME_SIZE,
} from "../../../sources/state/constants.ts";
import {
  alignSourceToReferenceSheet,
  canUseWeaponImportReference,
  getWeaponImportDrawLayerNum,
} from "../../../sources/components/desktop/custom-weapon-import.ts";

function createCatalog(items) {
  return {
    getItemMerged(itemId) {
      const item = items[itemId];
      return item ? ok(item) : err({ kind: "not-found", id: itemId });
    },
  };
}

function createCanvas(width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function paintOrientationMarker(canvas, x, y) {
  const ctx = get2DContext(canvas, true);
  ctx.fillStyle = "#ff0000";
  ctx.fillRect(x, y, 1, 1);
  ctx.fillStyle = "#0000ff";
  ctx.fillRect(x + 2, y, 1, 1);
}

function paintReferenceBounds(canvas, row, x, y) {
  const ctx = get2DContext(canvas, true);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(x, row * FRAME_SIZE + y, 3, 1);
}

function getRgb(canvas, x, y) {
  return Array.from(
    get2DContext(canvas, true).getImageData(x, y, 1, 1).data,
  ).slice(0, 4);
}

describe("components/desktop/custom-weapon-import.ts", () => {
  it("allows standard weapon and magic-crystal mainhand references", () => {
    const catalog = createCatalog({
      sword: {
        type_name: "weapon",
        animations: ["walk"],
        layers: { layer_1: { zPos: 140 } },
      },
      crystal: {
        type_name: "weapon_magic_crystal",
        animations: ["thrust"],
        layers: { layer_1: { zPos: 140 } },
      },
      shield: {
        type_name: "shield",
        animations: ["walk"],
        layers: { layer_1: { zPos: 140 } },
      },
      emoteOnly: {
        type_name: "weapon",
        animations: ["dance"],
        layers: { layer_1: { zPos: 140 } },
      },
    });

    expect(canUseWeaponImportReference(catalog, "sword")).to.equal(true);
    expect(canUseWeaponImportReference(catalog, "crystal")).to.equal(true);
    expect(canUseWeaponImportReference(catalog, "shield")).to.equal(false);
    expect(canUseWeaponImportReference(catalog, "emoteOnly")).to.equal(false);
    expect(canUseWeaponImportReference(catalog, "missing")).to.equal(false);
  });

  it("uses the highest z-position layer as the custom asset draw layer", () => {
    const catalog = createCatalog({
      crystal: {
        type_name: "weapon_magic_crystal",
        animations: ["thrust"],
        layers: {
          layer_1: { zPos: 140 },
          layer_2: { zPos: 9 },
          layer_3: { zPos: 150 },
          layer_4: { zPos: -1 },
        },
      },
    });

    expect(getWeaponImportDrawLayerNum(catalog, "crystal")).to.equal(3);
  });

  it("mirrors a single-image import on the right-facing row", () => {
    const source = createCanvas(3, 1);
    paintOrientationMarker(source, 0, 0);
    const reference = createCanvas(FRAME_SIZE, FRAME_SIZE * 4);
    paintReferenceBounds(reference, 3, 30, 9);

    const aligned = alignSourceToReferenceSheet(
      source,
      { x: 0, y: 0, width: 3, height: 1 },
      "singleImage",
      reference,
      "walk",
      { offsetX: 0, offsetY: 0, scale: 1 },
    );

    expect(getRgb(aligned, 30, FRAME_SIZE * 3 + 9)).to.deep.equal([
      0, 0, 255, 255,
    ]);
    expect(getRgb(aligned, 32, FRAME_SIZE * 3 + 9)).to.deep.equal([
      255, 0, 0, 255,
    ]);
  });

  it("keeps full-sheet right-facing rows in their authored orientation", () => {
    const walkOffset = ANIMATION_OFFSETS.walk;
    const source = createCanvas(FRAME_SIZE, walkOffset + FRAME_SIZE * 4);
    paintOrientationMarker(source, 4, walkOffset + FRAME_SIZE * 3 + 7);
    const reference = createCanvas(FRAME_SIZE, FRAME_SIZE * 4);
    paintReferenceBounds(reference, 3, 30, 9);

    const aligned = alignSourceToReferenceSheet(
      source,
      { x: 0, y: 0, width: 3, height: 1 },
      "fullSheet",
      reference,
      "walk",
      { offsetX: 0, offsetY: 0, scale: 1 },
    );

    expect(getRgb(aligned, 30, FRAME_SIZE * 3 + 9)).to.deep.equal([
      255, 0, 0, 255,
    ]);
    expect(getRgb(aligned, 32, FRAME_SIZE * 3 + 9)).to.deep.equal([
      0, 0, 255, 255,
    ]);
  });
});
