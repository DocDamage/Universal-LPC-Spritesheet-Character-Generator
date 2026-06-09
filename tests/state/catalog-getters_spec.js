// @ts-nocheck
import { expect } from "chai";
import { describe, it, beforeEach, afterEach } from "mocha-globals";
import {
  defaultCatalog,
  resetCatalogForTests,
} from "../../sources/state/catalog.ts";
import { restoreAppCatalogAfterTest } from "../browser-catalog-fixture.js";

const FIXTURES = {
  itemMetadata: {
    a: { name: "A", type_name: "body", required: ["male"] },
    b: { name: "B", type_name: "head", required: ["male", "female"] },
  },
  aliasMetadata: { aliasFlag: 1 },
  categoryTree: { items: ["a", "b"], children: {} },
  metadataIndexes: { byTypeName: {}, hashMatch: {} },
  paletteMetadata: { versions: {}, materials: {} },
};

describe("state/catalog.ts", () => {
  beforeEach(() => {
    resetCatalogForTests();
  });

  afterEach(async () => {
    await restoreAppCatalogAfterTest();
  });

  describe("getItemLite", () => {
    it("returns Err({kind:'loading'}) before lite chunk loads", () => {
      const r = defaultCatalog.getItemLite("a");
      expect(r.isErr()).to.be.true;
      if (r.isErr()) {
        expect(r.error).to.deep.equal({ kind: "loading", chunk: "lite" });
      }
    });

    it("returns Ok(item) after lite chunk loads with valid id", () => {
      defaultCatalog.registerFromItemModule({
        itemMetadata: FIXTURES.itemMetadata,
      });
      const r = defaultCatalog.getItemLite("a");
      expect(r.isOk()).to.be.true;
      if (r.isOk()) {
        expect(r.value.name).to.equal("A");
        expect(r.value.type_name).to.equal("body");
      }
    });

    it("returns Err({kind:'not-found'}) after load with unknown id", () => {
      defaultCatalog.registerFromItemModule({
        itemMetadata: FIXTURES.itemMetadata,
      });
      const r = defaultCatalog.getItemLite("ghost");
      expect(r.isErr()).to.be.true;
      if (r.isErr()) {
        expect(r.error).to.deep.equal({ kind: "not-found", id: "ghost" });
      }
    });
  });

  describe("getItemMerged", () => {
    it("returns Err({kind:'loading'}) before lite chunk loads", () => {
      const r = defaultCatalog.getItemMerged("a");
      expect(r.isErr()).to.be.true;
      if (r.isErr()) expect(r.error.kind).to.equal("loading");
    });

    it("returns Ok with empty layers/credits when only lite is loaded", () => {
      defaultCatalog.registerFromItemModule({
        itemMetadata: FIXTURES.itemMetadata,
      });
      const r = defaultCatalog.getItemMerged("a");
      expect(r.isOk()).to.be.true;
      if (r.isOk()) {
        expect(r.value.name).to.equal("A");
        expect(r.value.layers).to.deep.equal({});
        expect(r.value.credits).to.deep.equal([]);
      }
    });

    it("returns Err({kind:'not-found'}) for unknown id", () => {
      defaultCatalog.registerFromItemModule({
        itemMetadata: FIXTURES.itemMetadata,
      });
      const r = defaultCatalog.getItemMerged("ghost");
      expect(r.isErr()).to.be.true;
      if (r.isErr()) expect(r.error.kind).to.equal("not-found");
    });

    it("merges credits and layers when those chunks have loaded", () => {
      defaultCatalog.loadCatalogFromFixtures({
        ...FIXTURES,
        itemMetadata: {
          a: {
            name: "A",
            layers: { layer_1: { male: "path/to/a" } },
            credits: [{ file: "path/to/a", licenses: ["CC0"] }],
          },
        },
      });
      const r = defaultCatalog.getItemMerged("a");
      expect(r.isOk()).to.be.true;
      if (r.isOk()) {
        expect(r.value.layers.layer_1.male).to.equal("path/to/a");
        expect(r.value.credits[0].licenses).to.deep.equal(["CC0"]);
      }
    });
  });

  describe("getItemCredits", () => {
    it("returns Err({kind:'loading'}) before credits chunk loads", () => {
      const r = defaultCatalog.getItemCredits("a");
      expect(r.isErr()).to.be.true;
      if (r.isErr()) expect(r.error.kind).to.equal("loading");
    });

    it("returns Err({kind:'not-found'}) for unknown id when credits chunk is loaded", () => {
      defaultCatalog.registerFromCreditsModule({ itemCredits: {} });
      const r = defaultCatalog.getItemCredits("ghost");
      expect(r.isErr()).to.be.true;
      if (r.isErr()) {
        expect(r.error).to.deep.equal({ kind: "not-found", id: "ghost" });
      }
    });

    it("returns Ok(credits) when chunk is loaded and id has entries", () => {
      defaultCatalog.registerFromCreditsModule({
        itemCredits: { a: [{ file: "f", licenses: ["MIT"] }] },
      });
      const r = defaultCatalog.getItemCredits("a");
      expect(r.isOk()).to.be.true;
      if (r.isOk()) expect(r.value[0].licenses).to.deep.equal(["MIT"]);
    });

    it("returns Ok([]) when chunk is loaded and id has an empty array entry", () => {
      defaultCatalog.registerFromCreditsModule({ itemCredits: { a: [] } });
      const r = defaultCatalog.getItemCredits("a");
      expect(r.isOk()).to.be.true;
      if (r.isOk()) expect(r.value).to.deep.equal([]);
    });
  });

  describe("getItemLayers", () => {
    it("returns Err({kind:'loading'}) before layers chunk loads", () => {
      const r = defaultCatalog.getItemLayers("a");
      expect(r.isErr()).to.be.true;
      if (r.isErr()) expect(r.error.kind).to.equal("loading");
    });

    it("returns Err({kind:'not-found'}) for unknown id when layers chunk is loaded", () => {
      defaultCatalog.registerFromLayersModule({ itemLayers: {} });
      const r = defaultCatalog.getItemLayers("ghost");
      expect(r.isErr()).to.be.true;
      if (r.isErr()) {
        expect(r.error).to.deep.equal({ kind: "not-found", id: "ghost" });
      }
    });

    it("returns Ok({}) when chunk is loaded and id has an empty object entry", () => {
      defaultCatalog.registerFromLayersModule({ itemLayers: { a: {} } });
      const r = defaultCatalog.getItemLayers("a");
      expect(r.isOk()).to.be.true;
      if (r.isOk()) expect(r.value).to.deep.equal({});
    });
  });

  describe("getPaletteMetadata", () => {
    it("returns Err({kind:'loading'}) before palette chunk loads", () => {
      const r = defaultCatalog.getPaletteMetadata();
      expect(r.isErr()).to.be.true;
      if (r.isErr()) expect(r.error.kind).to.equal("loading");
    });

    it("returns Ok(meta) when palette chunk is loaded", () => {
      defaultCatalog.registerFromPaletteModule({
        paletteMetadata: { versions: {}, materials: { skin: {} } },
      });
      const r = defaultCatalog.getPaletteMetadata();
      expect(r.isOk()).to.be.true;
      if (r.isOk()) expect(r.value.materials).to.have.property("skin");
    });
  });

  describe("getCategoryTree / getMetadataIndexes / getAliasMetadata (index chunk)", () => {
    it("all return Err({kind:'loading', chunk:'index'}) before index chunk loads", () => {
      const tree = defaultCatalog.getCategoryTree();
      const indexes = defaultCatalog.getMetadataIndexes();
      const alias = defaultCatalog.getAliasMetadata();
      for (const r of [tree, indexes, alias]) {
        expect(r.isErr()).to.be.true;
        if (r.isErr()) {
          expect(r.error).to.deep.equal({ kind: "loading", chunk: "index" });
        }
      }
    });

    it("all return Ok after index chunk loads", () => {
      defaultCatalog.registerFromIndexModule({
        aliasMetadata: FIXTURES.aliasMetadata,
        categoryTree: FIXTURES.categoryTree,
        metadataIndexes: FIXTURES.metadataIndexes,
      });
      const tree = defaultCatalog.getCategoryTree();
      const indexes = defaultCatalog.getMetadataIndexes();
      const alias = defaultCatalog.getAliasMetadata();
      expect(tree.isOk()).to.be.true;
      expect(indexes.isOk()).to.be.true;
      expect(alias.isOk()).to.be.true;
      if (alias.isOk()) expect(alias.value).to.deep.equal({ aliasFlag: 1 });
    });
  });

  describe("resetCatalogForTests", () => {
    it("flips all getters back to Err({kind:'loading'})", () => {
      defaultCatalog.loadCatalogFromFixtures(FIXTURES);
      expect(defaultCatalog.getItemLite("a").isOk()).to.be.true;
      expect(defaultCatalog.getCategoryTree().isOk()).to.be.true;
      resetCatalogForTests();
      expect(defaultCatalog.getItemLite("a").isErr()).to.be.true;
      expect(defaultCatalog.getCategoryTree().isErr()).to.be.true;
      expect(defaultCatalog.getItemCredits("a").isErr()).to.be.true;
      expect(defaultCatalog.getItemLayers("a").isErr()).to.be.true;
      expect(defaultCatalog.getPaletteMetadata().isErr()).to.be.true;
    });
  });
});
