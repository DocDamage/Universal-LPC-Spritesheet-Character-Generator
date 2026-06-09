import { defaultCatalog } from "../state/catalog.ts";

function addExtensionIfMissing(filename: string, extension: string): string {
  if (filename.toLowerCase().endsWith(extension.toLowerCase())) {
    return filename;
  }
  return `${filename}.${extension}`;
}

export function getItemFileName(
  itemId: string,
  variant: string,
  name: string,
  layerNum: number = 1,
  zOverride?: number,
): string {
  const result = defaultCatalog.getItemMerged(itemId);
  if (result.isErr()) return addExtensionIfMissing(name, "png");

  // Get zPos from specified layer
  const layer = result.value.layers[`layer_${layerNum}`];
  if (!layer)
    throw new Error(
      "Requested layer number " + layerNum + " not found for item: " + itemId,
    );
  const zPos = zOverride || layer.zPos || 100;
  const altName = `${itemId}_${variant}`;

  // Format: "050 body_male_light" (zPos padded to 3 digits + space + name)
  const safeName = (name || altName).replace(/[^a-z0-9.]/gi, "_").toLowerCase();
  const fileName = `${String(zPos).padStart(3, "0")} ${safeName}`;
  return addExtensionIfMissing(fileName, "png");
}

export function applyNamingTemplate(
  template: string,
  vars: {
    character?: string;
    animation?: string;
    direction?: string;
    frame?: number | string;
    zpos?: number | string;
    slot?: string;
  },
): string {
  if (!template) return "";
  let name = template;
  name = name.replace(/{character}/g, vars.character || "character");
  name = name.replace(/{animation}/g, vars.animation || "walk");
  name = name.replace(/{direction}/g, vars.direction || "down");
  name = name.replace(/{frame}/g, String(vars.frame ?? "0"));
  name = name.replace(/{zpos}/g, String(vars.zpos ?? "000"));
  name = name.replace(/{slot}/g, vars.slot || "slot");
  // Clean up potential unsafe characters, keeping folders/extensions if any, but let's make it relatively safe:
  return name.replace(/[<>:"\\|?*]/g, "_");
}
