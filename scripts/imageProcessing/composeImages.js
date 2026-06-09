// @ts-nocheck
// Use this script in order to recompose universal spritesheets from the separate animations.
// This script traverses all files inside `sheetsFolder` and concat the animations
// spellcast, thrust, walk ,slash, shoot, hurt into a new image file
// The new image can be found at the /universal folder of the asset with the variant name.

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { debugLog } from "../utils/debug.js";

const walk = function (dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(function (file) {
    file = dir + "/" + file;
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      if (file.endsWith("walk")) {
        results.push(file.replace("/walk", ""));
      } else {
        results = results.concat(walk(file));
      }
    }
  });
  return results;
};
const sheetsFolder = "spritesheets";
const walkDirectories = walk(sheetsFolder);
debugLog("file", walkDirectories);

const masterSheetNames = [
  "spellcast",
  "thrust",
  "walk",
  "slash",
  "shoot",
  "hurt",
];

function imageDimensions(imagePath) {
  const output = execFileSync(
    "magick",
    ["identify", "-format", "%w,%h", imagePath],
    { encoding: "utf8" },
  ).trim();
  const [width, height] = output.split(",").map(Number);
  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    throw new Error(`Could not determine dimensions for ${imagePath}`);
  }
  return { width, height };
}

function transparentPlaceholder(referencePath, outputPath) {
  const { width, height } = imageDimensions(referencePath);
  execFileSync("magick", [
    "-size",
    `${width}x${height}`,
    "xc:none",
    outputPath,
  ]);
}

walkDirectories.forEach(function (walkDirectory) {
  debugLog(`Start processing sheet: ${walkDirectory}`);
  const list = fs.readdirSync(walkDirectory + "/walk");
  let variants = [];
  list.forEach(function (file) {
    if (file.includes(".png")) {
      variants.push(file);
    }
  });
  debugLog("variants found", variants);

  const universalFolder = `${walkDirectory}/_universal`;
  if (fs.existsSync(universalFolder)) {
    fs.rmdirSync(universalFolder, { recursive: true, force: true });
  }
  fs.mkdirSync(universalFolder);
  variants.forEach(function (variant) {
    let imagesToCompose = [];
    const existingVariantPaths = masterSheetNames
      .map((animation) => `${walkDirectory}/${animation}/${variant}`)
      .filter((variantPath) => fs.existsSync(variantPath));
    const referencePath = existingVariantPaths[0];
    if (!referencePath) {
      debugLog("No source images found for variant, skipping", variant);
      return;
    }
    const placeholderPath = path.join(
      universalFolder,
      `__transparent_${variant}`,
    );

    masterSheetNames.forEach(function (animation) {
      const variantPath = `${walkDirectory}/${animation}/${variant}`;
      if (fs.existsSync(`${walkDirectory}/${animation}/${variant}`)) {
        imagesToCompose.push(variantPath);
      } else {
        debugLog("variantPath does NOT exist", variantPath);
        if (!fs.existsSync(placeholderPath)) {
          transparentPlaceholder(referencePath, placeholderPath);
        }
        imagesToCompose.push(placeholderPath);
      }
    });
    debugLog("composing images", imagesToCompose);

    const newFile = `${universalFolder}/${variant}`;
    execFileSync("magick", [
      "convert",
      "-background",
      "transparent",
      "-append",
      ...imagesToCompose,
      newFile,
    ]);
  });
});
