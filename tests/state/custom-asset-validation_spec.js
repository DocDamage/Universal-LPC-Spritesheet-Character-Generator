// @ts-nocheck
/**
 * Custom asset validation tests — validate the validateCustomAsset function.
 * Uses canvas ImageData objects to simulate various image states.
 */

import { expect } from "chai";
import { describe, it } from "mocha-globals";
import { validateCustomAsset } from "../../sources/state/custom-asset-validation.ts";

/** Default opaque alpha value for filled pixels */
var OPAQUE = 255;
/** Default transparent alpha value */
var TRANSPARENT = 0;
/** Partially transparent alpha */
var PARTIAL = 200;

/**
 * Helper: create an ImageData with the given alpha values.
 */
function makeImageData(width, height, fillAlpha) {
  var canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  var ctx = canvas.getContext("2d");
  var imgData = ctx.createImageData(width, height);

  for (var y = 0; y < height; y++) {
    for (var x = 0; x < width; x++) {
      var alpha = typeof fillAlpha === "function" ? fillAlpha(x, y) : fillAlpha;
      var idx = (y * width + x) * 4;
      imgData.data[idx] = 128; // R
      imgData.data[idx + 1] = 64; // G
      imgData.data[idx + 2] = 255; // B
      imgData.data[idx + 3] = Math.round(Math.max(0, Math.min(255, alpha)));
    }
  }

  return imgData;
}

describe("custom-asset-validation", function () {
  describe("validateCustomAsset (weapon mode)", function () {
    it("passes for a normal 64x64 image with alpha", function () {
      var imgData = makeImageData(64, 64, function (x, y) {
        return x === 0 || y === 0 || x === 63 || y === 63
          ? TRANSPARENT
          : PARTIAL;
      });
      var result = validateCustomAsset(imgData, "weapon");
      expect(result.passed).to.equal(true);
      expect(result.issues.length).to.equal(0);
    });

    it("fails (error) for a completely empty image", function () {
      var imgData = makeImageData(64, 64, TRANSPARENT);
      var result = validateCustomAsset(imgData, "weapon");
      expect(result.passed).to.equal(false);
      expect(
        result.issues.some(function (i) {
          return i.severity === "error" && i.message.indexOf("empty") !== -1;
        }),
      ).to.equal(true);
    });

    it("warns for an image without transparency", function () {
      var imgData = makeImageData(64, 64, OPAQUE);
      var result = validateCustomAsset(imgData, "weapon");
      expect(result.passed).to.equal(true);
      expect(
        result.issues.some(function (i) {
          return i.message.indexOf("no transparency") !== -1;
        }),
      ).to.equal(true);
    });

    it("errors for an image smaller than 16x16", function () {
      var imgData = makeImageData(8, 8, PARTIAL);
      var result = validateCustomAsset(imgData, "weapon");
      expect(result.passed).to.equal(false);
      expect(
        result.issues.some(function (i) {
          return (
            i.severity === "error" && i.message.indexOf("too small") !== -1
          );
        }),
      ).to.equal(true);
    });

    it("warns for a spritesheet-size image (weapon mode expects single frame)", function () {
      var imgData = makeImageData(192, 192, PARTIAL); // 3x3 frames
      var result = validateCustomAsset(imgData, "weapon");
      expect(result.passed).to.equal(true);
      expect(
        result.issues.some(function (i) {
          return i.message.indexOf("larger than expected") !== -1;
        }),
      ).to.equal(true);
    });

    it("warns when content touches the top edge", function () {
      // Make a pixel at (0,0) with alpha > 0
      var imgData = makeImageData(64, 64, function (x, y) {
        return x === 0 && y === 0 ? PARTIAL : TRANSPARENT;
      });
      var result = validateCustomAsset(imgData, "weapon");
      expect(result.passed).to.equal(true);
      expect(
        result.issues.some(function (i) {
          return i.message.indexOf("touches") !== -1;
        }),
      ).to.equal(true);
    });
  });

  describe("validateCustomAsset (spritesheet mode)", function () {
    it("passes for a standard LPC sheet multiple (192x192)", function () {
      var imgData = makeImageData(192, 192, PARTIAL);
      var result = validateCustomAsset(imgData, "spritesheet");
      expect(result.passed).to.equal(true);
    });

    it("warns for non-standard dimensions", function () {
      var imgData = makeImageData(100, 100, PARTIAL);
      var result = validateCustomAsset(imgData, "spritesheet");
      expect(result.passed).to.equal(true);
      expect(
        result.issues.some(function (i) {
          return i.message.indexOf("not standard LPC multiples") !== -1;
        }),
      ).to.equal(true);
    });

    it("errors when smaller than single frame", function () {
      var imgData = makeImageData(32, 32, PARTIAL);
      var result = validateCustomAsset(imgData, "spritesheet");
      expect(result.passed).to.equal(false);
      expect(
        result.issues.some(function (i) {
          return i.severity === "error";
        }),
      ).to.equal(true);
    });
  });

  describe("validateCustomAsset (animation mode)", function () {
    it("passes for animation sheet width that is a multiple of FRAME_SIZE", function () {
      var imgData = makeImageData(192, 64, PARTIAL); // 3 frames wide
      var result = validateCustomAsset(imgData, "animation");
      expect(result.passed).to.equal(true);
    });

    it("warns when animation sheet width is not a multiple of frame width", function () {
      var imgData = makeImageData(100, 64, PARTIAL);
      var result = validateCustomAsset(imgData, "animation");
      expect(result.passed).to.equal(true);
      expect(
        result.issues.some(function (i) {
          return i.message.indexOf("not a multiple") !== -1;
        }),
      ).to.equal(true);
    });
  });

  describe("info issues", function () {
    it("reports info for excessively large images", function () {
      var imgData = makeImageData(1024, 1024, PARTIAL);
      var result = validateCustomAsset(imgData, "weapon");
      expect(
        result.issues.some(function (i) {
          return (
            i.severity === "info" && i.message.indexOf("very large") !== -1
          );
        }),
      ).to.equal(true);
    });
  });
});
