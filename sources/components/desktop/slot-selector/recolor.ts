import { getPaletteOptions } from "../../../state/palettes.ts";
import { state, getSelectionGroup } from "../../../state/state.ts";
import { ucwords } from "../../../utils/helpers.ts";
import type { CatalogReader } from "../../../state/catalog.ts";

/** Build a simple list of recolor choices for an item. */
export function getRecolorChoices(
  itemId: string,
  catalog: CatalogReader,
): { label: string; value: string; gradient: string[] }[] {
  const metaResult = catalog.getItemLite(itemId);
  if (metaResult.isErr()) return [];
  const meta = metaResult.value;

  const [paletteOptions] = getPaletteOptions(itemId, meta);
  if (!paletteOptions || paletteOptions.length === 0) return [];

  const choices: ReturnType<typeof getRecolorChoices> = [];

  for (const opt of paletteOptions) {
    const paletteMetaResult = catalog.getPaletteMetadata();
    if (paletteMetaResult.isErr()) continue;
    const paletteMeta = paletteMetaResult.value;

    for (const cat of opt.versions) {
      const [material, version] = cat.split(".") as [string, string];
      const materialMeta = paletteMeta.materials[material];
      const recolors: Record<string, string[]> =
        materialMeta?.palettes?.[version] ?? {};

      for (const [paletteName, colors] of Object.entries(recolors)) {
        const key =
          (material !== opt.material ? material + "." : "") +
          (version !== opt.default ? version + "." : "") +
          paletteName;
        choices.push({
          label: ucwords(paletteName.replaceAll("_", " ")),
          value: key,
          gradient: colors.slice().reverse(),
        });
      }
    }
  }

  return choices;
}

/** Get the currently selected recolor for an item. */
export function getSelectedRecolor(itemId: string): string | null {
  const selectionGroup = getSelectionGroup(itemId);
  const sel = state.selections[selectionGroup];
  if (sel?.itemId === itemId) {
    return sel.recolor || null;
  }
  return null;
}
