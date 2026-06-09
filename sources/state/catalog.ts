/**
 * Central catalog module — state, registration, and the typed Result-returning
 * consumer API in one place.
 *
 * Loaders call `registerFromXModule` after each dynamic import; consumers use
 * the typed getters (returning `Result<T, LoadError>` from neverthrow) and
 * either `isXReady()` (sync) or `catalogReady.onXReady` (async) for readiness
 * signals.
 *
 * Every getter returns `Result<T, LoadError>`:
 *   - `Ok(value)` when the chunk is registered and the id resolves.
 *   - `Err({ kind: "loading" })` when the chunk has not registered yet.
 *   - `Err({ kind: "not-found" })` when the chunk is registered but the id is absent.
 *
 * Dynamic-import failures intentionally crash today (no `Err` variant): the
 * chunk loading machinery in `install-item-metadata.ts` propagates the
 * rejection. If we ever need to recover instead of crash, add a `"load-failed"`
 * variant here.
 *
 * Consumer-side code pairs this with the `renderResult` helper (in the render
 * tree) or with `.match` / `.unwrapOr` / `if (r.isErr())` (everywhere else).
 *
 * Catalog DI migration:
 *   - `createCatalog()` is the factory used by `main.ts` and by tests that
 *     want an isolated instance.
 *   - `defaultCatalog` is a module-level instance — the same shared state we
 *     had before the factory, just encapsulated. Legacy free-function exports
 *     delegate to it; they're thin wrappers preserved for incremental
 *     migration and get removed in the final cleanup phase.
 */

// Re-export all types and the error formatter from the type module.
export * from "./catalog-types.ts";

// Re-export custom-parts CRUD (previously inlined here).
export * from "./custom-parts.ts";

// ────────────────────────────────────────────────────────────────────────────
// Additional imports needed only by the factory
// ────────────────────────────────────────────────────────────────────────────

import { ok, err } from "neverthrow";
import {
  buildItemsByTypeNameLite,
  expandInternedItemLite,
  expandMetadataIndexesWithInternedArrays,
  isInternedItemLite,
} from "./resolve-hash-param.ts";
import { customParts, clearCustomParts } from "./custom-parts.ts";
import type {
  ChunkName,
  LoadError,
  AliasMetadata,
  CategoryTree,
  MetadataIndexes,
  PaletteMetadata,
  ItemLite,
  Credit,
  LayerEntry,
  FullItemMetadata,
  ItemMerged,
  CatalogReady,
  Catalog,
} from "./catalog-types.ts";

// ────────────────────────────────────────────────────────────────────────────
// Internal helpers — pure, outside the factory
// ────────────────────────────────────────────────────────────────────────────

type Stage = {
  promise: Promise<void>;
  resolved: boolean;
  resolve: () => void;
};

function makeStage(): Stage {
  let resolveFn: (() => void) | undefined;
  const promise = new Promise<void>((r) => {
    resolveFn = r;
  });
  const stage: Stage = {
    promise,
    resolved: false,
    resolve: () => {
      stage.resolved = true;
      resolveFn?.();
    },
  };
  return stage;
}

function splitFullItemMetadataForCatalog(
  fullItemMetadata: Record<string, FullItemMetadata>,
): {
  itemMetadataLite: Record<string, ItemLite>;
  itemCredits: Record<string, Credit[]>;
  itemLayers: Record<string, Record<string, LayerEntry>>;
} {
  const itemMetadataLite: Record<string, ItemLite> = {};
  const itemCredits: Record<string, Credit[]> = {};
  const itemLayers: Record<string, Record<string, LayerEntry>> = {};

  for (const [itemId, meta] of Object.entries(fullItemMetadata)) {
    const { layers, credits, ...lite } = meta;
    itemMetadataLite[itemId] = lite;
    itemCredits[itemId] = credits ?? [];
    itemLayers[itemId] = layers ?? {};
  }
  return { itemMetadataLite, itemCredits, itemLayers };
}

const loading = (chunk: ChunkName): LoadError => ({ kind: "loading", chunk });
const notFound = (id: string): LoadError => ({ kind: "not-found", id });

// ────────────────────────────────────────────────────────────────────────────
// Factory
// ────────────────────────────────────────────────────────────────────────────

export function createCatalog(): Catalog {
  let indexStage = makeStage();
  let liteStage = makeStage();
  let creditsStage = makeStage();
  let paletteStage = makeStage();
  let layersStage = makeStage();

  let aliasMetadataStore: AliasMetadata | null = null;
  let categoryTreeStore: CategoryTree | null = null;
  let metadataIndexesStore: MetadataIndexes | null = null;
  let itemLiteStore: Record<string, ItemLite> | null = null;
  let itemCreditsStore: Record<string, Credit[]> | null = null;
  let itemLayersStore: Record<string, Record<string, LayerEntry>> | null = null;
  let paletteMetadataStore: PaletteMetadata | null = null;

  function expandInternedItemLitesInStore(): void {
    if (itemLiteStore === null || metadataIndexesStore === null) return;
    const { variantArrays, recolorVariantArrays } = metadataIndexesStore;
    if (!Array.isArray(variantArrays) || !Array.isArray(recolorVariantArrays)) {
      return;
    }
    for (const itemId of Object.keys(itemLiteStore)) {
      const cur = itemLiteStore[itemId]!;
      if (isInternedItemLite(cur)) {
        itemLiteStore[itemId] = expandInternedItemLite(
          cur,
          variantArrays,
          recolorVariantArrays,
        ) as ItemLite;
      }
    }
  }

  const ready: CatalogReady = {
    get onIndexReady() {
      return indexStage.promise;
    },
    get onLiteReady() {
      return liteStage.promise;
    },
    get onCreditsReady() {
      return creditsStage.promise;
    },
    get onPaletteReady() {
      return paletteStage.promise;
    },
    get onLayersReady() {
      return layersStage.promise;
    },
    get onAllReady() {
      return Promise.all([
        indexStage.promise,
        liteStage.promise,
        creditsStage.promise,
        paletteStage.promise,
        layersStage.promise,
      ]).then(() => {});
    },
  };

  return {
    ready,

    // readiness predicates
    isIndexReady: () => indexStage.resolved,
    isLiteReady: () => liteStage.resolved,
    isCreditsReady: () => creditsStage.resolved,
    isPaletteReady: () => paletteStage.resolved,
    isLayersReady: () => layersStage.resolved,

    chunkReady(chunk) {
      const stage = (
        {
          index: indexStage,
          lite: liteStage,
          credits: creditsStage,
          palette: paletteStage,
          layers: layersStage,
        } as const
      )[chunk];
      return stage.resolved ? ok(true as const) : err(loading(chunk));
    },

    // result-returning getters
    getItemLite(id) {
      if (!liteStage.resolved) return err(loading("lite"));
      const custom = customParts[id];
      const lookupId = custom ? custom.baseItemId : id;
      const item = itemLiteStore?.[lookupId];
      if (!item) return err(notFound(id));
      if (custom) {
        return ok({
          ...item,
          itemId: id,
          name: custom.name,
          type_name: custom.type_name,
        });
      }
      return ok(item);
    },

    getItemMerged(id) {
      if (!liteStage.resolved) return err(loading("lite"));
      const custom = customParts[id];
      const lookupId = custom ? custom.baseItemId : id;
      const lite = itemLiteStore?.[lookupId];
      if (!lite) return err(notFound(id));
      const layers = layersStage.resolved
        ? (itemLayersStore?.[lookupId] ?? {})
        : {};
      const credits = creditsStage.resolved
        ? (itemCreditsStore?.[lookupId] ?? [])
        : [];
      const merged: ItemMerged & { itemId?: string } = {
        ...lite,
        layers,
        credits,
      };
      if (custom) {
        merged.itemId = id;
        merged.name = custom.name;
        merged.type_name = custom.type_name;
      }
      return ok(merged);
    },

    getItemCredits(id) {
      if (!creditsStage.resolved) return err(loading("credits"));
      const credits = itemCreditsStore?.[id];
      return credits ? ok(credits) : err(notFound(id));
    },

    getItemLayers(id) {
      if (!layersStage.resolved) return err(loading("layers"));
      const layers = itemLayersStore?.[id];
      return layers ? ok(layers) : err(notFound(id));
    },

    getPaletteMetadata() {
      if (!paletteStage.resolved) return err(loading("palette"));
      return ok(paletteMetadataStore!);
    },

    getCategoryTree() {
      if (!indexStage.resolved) return err(loading("index"));
      return ok(categoryTreeStore!);
    },

    getMetadataIndexes() {
      if (!indexStage.resolved) return err(loading("index"));
      return ok(metadataIndexesStore!);
    },

    getAliasMetadata() {
      if (!indexStage.resolved) return err(loading("index"));
      return ok(aliasMetadataStore!);
    },

    buildItemsByTypeNameFromRegisteredLite() {
      if (!itemLiteStore) return {};
      const synthetic: Record<string, ItemMerged> = {};
      for (const [id, lite] of Object.entries(itemLiteStore)) {
        synthetic[id] = { ...lite, layers: {}, credits: [] };
      }
      return buildItemsByTypeNameLite(synthetic);
    },

    // writer methods
    registerFromIndexModule(exports_) {
      aliasMetadataStore = exports_.aliasMetadata;
      categoryTreeStore = exports_.categoryTree;
      const expanded = expandMetadataIndexesWithInternedArrays(
        exports_.metadataIndexes,
      );
      if (expanded) {
        metadataIndexesStore = expanded;
      }
      indexStage.resolve();
      expandInternedItemLitesInStore();
    },

    registerFromPaletteModule(exports_) {
      paletteMetadataStore = exports_.paletteMetadata;
      paletteStage.resolve();
    },

    registerFromItemModule(exports_) {
      itemLiteStore = exports_.itemMetadata;
      expandInternedItemLitesInStore();
      liteStage.resolve();
    },

    registerFromCreditsModule(exports_) {
      itemCreditsStore = exports_.itemCredits;
      creditsStage.resolve();
    },

    registerFromLayersModule(exports_) {
      itemLayersStore = exports_.itemLayers;
      layersStage.resolve();
    },

    loadCatalogFromFixtures(fixtureGlobals) {
      this.resetForTests();
      const {
        itemMetadata,
        aliasMetadata,
        categoryTree,
        metadataIndexes,
        paletteMetadata,
      } = fixtureGlobals;
      this.registerFromIndexModule({
        aliasMetadata,
        categoryTree,
        metadataIndexes,
      });
      this.registerFromPaletteModule({ paletteMetadata });
      const { itemMetadataLite, itemCredits, itemLayers } =
        splitFullItemMetadataForCatalog(itemMetadata);
      this.registerFromItemModule({ itemMetadata: itemMetadataLite });
      this.registerFromCreditsModule({ itemCredits });
      this.registerFromLayersModule({ itemLayers });
    },

    resetForTests() {
      indexStage = makeStage();
      liteStage = makeStage();
      creditsStage = makeStage();
      paletteStage = makeStage();
      layersStage = makeStage();

      aliasMetadataStore = null;
      categoryTreeStore = null;
      metadataIndexesStore = null;
      itemLiteStore = null;
      itemCreditsStore = null;
      itemLayersStore = null;
      paletteMetadataStore = null;
      clearCustomParts({ persist: false });
    },
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Default instance + test reset helper
// ────────────────────────────────────────────────────────────────────────────

export const defaultCatalog: Catalog = createCatalog();

/**
 * Reset the shared compatibility catalog. New isolated tests should prefer
 * `createCatalog()`, while suites that intentionally exercise module-level
 * helper exports reset this singleton between cases.
 */
export const resetCatalogForTests = (): void => defaultCatalog.resetForTests();

// ────────────────────────────────────────────────────────────────────────────
// Boot-time globalThis shims (Playwright, Argos, dump-computed-styles)
// ────────────────────────────────────────────────────────────────────────────

if (typeof globalThis !== "undefined") {
  (
    globalThis as unknown as { __LPC_waitCatalogAllReady: () => Promise<void> }
  ).__LPC_waitCatalogAllReady = async () => {
    await defaultCatalog.ready.onAllReady;
  };
  (
    globalThis as unknown as {
      __LPC_arePaletteModalMetadataChunksReady: () => boolean;
    }
  ).__LPC_arePaletteModalMetadataChunksReady = () =>
    defaultCatalog.isIndexReady() &&
    defaultCatalog.isLiteReady() &&
    defaultCatalog.isCreditsReady() &&
    defaultCatalog.isPaletteReady() &&
    defaultCatalog.isLayersReady();
}
