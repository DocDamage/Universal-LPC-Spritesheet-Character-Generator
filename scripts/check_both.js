/* eslint-disable no-console */
import { metadataIndexes } from "../dist/index-metadata.js";

const { byTypeName, variantArrays, recolorVariantArrays } = metadataIndexes;

console.log("Checking if any item has both variants and recolors...");

let found = 0;
for (const [typeName, items] of Object.entries(byTypeName)) {
  for (const item of items) {
    const hasV =
      item.v !== undefined &&
      variantArrays[item.v] &&
      variantArrays[item.v].length > 0;
    const hasR =
      item.r !== undefined &&
      recolorVariantArrays[item.r] &&
      recolorVariantArrays[item.r].length > 0;
    if (hasV && hasR) {
      console.log(
        `Item: ${item.itemId} (Type: ${typeName}) has both variants and recolors!`,
      );
      console.log(`  Variants: ${JSON.stringify(variantArrays[item.v])}`);
      console.log(
        `  Recolors: ${JSON.stringify(recolorVariantArrays[item.r])}`,
      );
      found++;
    }
  }
}

if (found === 0) {
  console.log(
    "No items have both variants and recolors in the index-metadata.",
  );
}
