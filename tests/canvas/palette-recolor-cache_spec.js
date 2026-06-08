/**
 * Tests for the bounded LRU recolor cache inside `getImageToDraw`.
 *
 * Invariants guarded:
 * - Same (spritePath, recolors) returns the same cached canvas reference.
 * - Different recolors produce different canvases (no false key collision).
 * - `spritePath = null` bypasses cache (custom uploads, etc.).
 * - `!recolors` short-circuits before cache (raw image returned).
 * - `clearRecolorCache()` empties the cache.
 * - Concurrent callers for the same key share one in-flight Promise.
 */
import { expect } from "chai";
import { describe, it, beforeEach } from "mocha-globals";
import {
  getImageToDraw,
  clearRecolorCache,
  drawRecolorPreview,
} from "../../sources/canvas/palette-recolor.ts";

// Real item id from the dataset with a single recolor region.
// `body` has type_name="body", recolors=[{material: "body"}].
const RECOLOR_ITEM_ID = "body";

function solidColorCanvas(r, g, b, w = 8, h = 8) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  ctx.fillStyle = `rgb(${r},${g},${b})`;
  ctx.fillRect(0, 0, w, h);
  return c;
}

describe("canvas/palette-recolor.ts recolor cache", () => {
  beforeEach(() => {
    clearRecolorCache();
  });

  it("returns the same canvas reference on cache hit (same spritePath + recolors)", async () => {
    const img = solidColorCanvas(255, 0, 0);
    const recolors = { body: "olive" };
    const path = "spritesheets/body/bodies/male/walk.png";

    const first = await getImageToDraw(img, RECOLOR_ITEM_ID, recolors, path);
    const second = await getImageToDraw(img, RECOLOR_ITEM_ID, recolors, path);

    expect(first).to.equal(second);
  });

  it("produces different canvases when recolors differ", async () => {
    const img = solidColorCanvas(255, 0, 0);
    const path = "spritesheets/body/bodies/male/walk.png";

    const olive = await getImageToDraw(
      img,
      RECOLOR_ITEM_ID,
      { body: "olive" },
      path,
    );
    const bronze = await getImageToDraw(
      img,
      RECOLOR_ITEM_ID,
      { body: "bronze" },
      path,
    );

    expect(olive).to.not.equal(bronze);
  });

  it("produces different canvases when spritePath differs", async () => {
    const img = solidColorCanvas(255, 0, 0);
    const recolors = { body: "olive" };

    const a = await getImageToDraw(
      img,
      RECOLOR_ITEM_ID,
      recolors,
      "spritesheets/body/bodies/male/walk.png",
    );
    const b = await getImageToDraw(
      img,
      RECOLOR_ITEM_ID,
      recolors,
      "spritesheets/body/bodies/male/slash.png",
    );

    expect(a).to.not.equal(b);
  });

  it("bypasses cache when spritePath is null (uncacheable inputs)", async () => {
    const img = solidColorCanvas(255, 0, 0);
    const recolors = { body: "olive" };

    const first = await getImageToDraw(img, RECOLOR_ITEM_ID, recolors, null);
    const second = await getImageToDraw(img, RECOLOR_ITEM_ID, recolors, null);

    expect(first).to.not.equal(second);
  });

  it("returns the input image unchanged when recolors is null (no cache entry)", async () => {
    const img = solidColorCanvas(255, 0, 0);
    const path = "spritesheets/body/bodies/male/walk.png";

    const result = await getImageToDraw(img, RECOLOR_ITEM_ID, null, path);

    expect(result).to.equal(img);
  });

  it("clearRecolorCache() drops all entries so the next call recomputes", async () => {
    const img = solidColorCanvas(255, 0, 0);
    const recolors = { body: "olive" };
    const path = "spritesheets/body/bodies/male/walk.png";

    const first = await getImageToDraw(img, RECOLOR_ITEM_ID, recolors, path);
    clearRecolorCache();
    const second = await getImageToDraw(img, RECOLOR_ITEM_ID, recolors, path);

    expect(first).to.not.equal(second);
  });

  it("concurrent callers for the same key resolve to the same canvas", async () => {
    const img = solidColorCanvas(255, 0, 0);
    const recolors = { body: "olive" };
    const path = "spritesheets/body/bodies/male/walk.png";

    const [a, b, c] = await Promise.all([
      getImageToDraw(img, RECOLOR_ITEM_ID, recolors, path),
      getImageToDraw(img, RECOLOR_ITEM_ID, recolors, path),
      getImageToDraw(img, RECOLOR_ITEM_ID, recolors, path),
    ]);

    expect(a).to.equal(b);
    expect(b).to.equal(c);
  });

  it("drawRecolorPreview returns 0 without drawing when its signal is already aborted", async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    document.body.appendChild(canvas);
    const abortController = new AbortController();
    abortController.abort();

    try {
      const imagesLoaded = await drawRecolorPreview(
        "preview_abort_test",
        {
          name: "Abort Test",
          type_name: "body",
          required: [],
          animations: ["walk"],
          recolors: [],
          matchBodyColor: false,
          variants: [],
          path: [],
          credits: [],
          layers: { layer_1: { male: "body/bodies/male/" } },
        },
        canvas,
        {},
        abortController.signal,
      );

      expect(imagesLoaded).to.equal(0);
      const pixel = canvas.getContext("2d").getImageData(0, 0, 1, 1).data;
      expect(pixel[3]).to.equal(0);
    } finally {
      canvas.remove();
    }
  });
});
