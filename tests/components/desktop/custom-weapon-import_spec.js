import { expect } from "chai";
import { describe, it } from "mocha-globals";
import { ok, err } from "neverthrow";
import {
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
});
