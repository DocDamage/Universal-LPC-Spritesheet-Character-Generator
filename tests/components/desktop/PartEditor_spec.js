// @ts-nocheck
import { expect } from "chai";
import { describe, it } from "mocha-globals";
import { get2DContext } from "../../../sources/canvas/canvas-utils.ts";
import {
  createPartEditorStateForTests,
  getEditorWheelZoomUpdate,
  partEditorTestApi,
} from "../../../sources/components/desktop/PartEditor.ts";

function getPixel(canvas, x, y) {
  return Array.from(get2DContext(canvas, true).getImageData(x, y, 1, 1).data);
}

function getImageDataPixel(imageData, x, y) {
  const index = (y * imageData.width + x) * 4;
  return Array.from(imageData.data.slice(index, index + 4));
}

function paintPixel(canvas, x, y, color) {
  const ctx = get2DContext(canvas, true);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, 1, 1);
}

function getActiveLayer(stateObj) {
  const layer = partEditorTestApi.getActiveLayer(stateObj);
  expect(layer).to.not.equal(null);
  return layer;
}

function paintActiveLayer(stateObj, color, x = 5, y = 5, direction = "front") {
  paintPixel(getActiveLayer(stateObj).canvases[direction], x, y, color);
  partEditorTestApi.recomposeCanvases(stateObj);
}

describe("components/desktop/PartEditor.ts", () => {
  it("calculates wheel zoom and keeps the pointer position anchored", () => {
    expect(
      getEditorWheelZoomUpdate({
        zoom: 4,
        deltaY: -120,
        pointerRatioX: 0.25,
        pointerRatioY: 0.75,
      }),
    ).to.deep.equal({
      nextZoom: 5,
      scrollLeftDelta: 16,
      scrollTopDelta: 48,
      changed: true,
    });

    expect(
      getEditorWheelZoomUpdate({
        zoom: 5,
        deltaY: 120,
        pointerRatioX: 2,
        pointerRatioY: -1,
      }),
    ).to.deep.equal({
      nextZoom: 4,
      scrollLeftDelta: -64,
      scrollTopDelta: 0,
      changed: true,
    });

    expect(getEditorWheelZoomUpdate({ zoom: 16, deltaY: -1 })).to.deep.equal({
      nextZoom: 16,
      scrollLeftDelta: 0,
      scrollTopDelta: 0,
      changed: false,
    });
    expect(getEditorWheelZoomUpdate({ zoom: 2, deltaY: 1 })).to.deep.equal({
      nextZoom: 2,
      scrollLeftDelta: 0,
      scrollTopDelta: 0,
      changed: false,
    });
  });

  it("adds and duplicates layers without imposing a hard layer cap", () => {
    const stateObj = createPartEditorStateForTests();

    for (let i = 0; i < 40; i += 1) {
      partEditorTestApi.addEditLayer(stateObj);
    }

    expect(stateObj.editLayers).to.have.length(41);

    const sourceLayer = getActiveLayer(stateObj);
    paintActiveLayer(stateObj, "#123456", 4, 4);

    partEditorTestApi.duplicateActiveLayer(stateObj);

    const copyLayer = getActiveLayer(stateObj);
    expect(stateObj.editLayers).to.have.length(42);
    expect(copyLayer.name).to.equal(`${sourceLayer.name} copy`);
    expect(getPixel(copyLayer.canvases.front, 4, 4)).to.deep.equal([
      18, 52, 86, 255,
    ]);
    expect(getPixel(stateObj.canvases.front, 4, 4)).to.deep.equal([
      18, 52, 86, 255,
    ]);
  });

  it("keeps layer order, locks, merges, deletes, and flattening predictable", () => {
    const stateObj = createPartEditorStateForTests();

    paintActiveLayer(stateObj, "#ff0000", 2, 2);
    const baseLayer = getActiveLayer(stateObj);

    partEditorTestApi.addEditLayer(stateObj);
    paintActiveLayer(stateObj, "#0000ff", 2, 2);
    const topLayer = getActiveLayer(stateObj);
    expect(getPixel(stateObj.canvases.front, 2, 2)).to.deep.equal([
      0, 0, 255, 255,
    ]);

    partEditorTestApi.moveActiveLayer(stateObj, -1);
    expect(stateObj.editLayers[0].id).to.equal(topLayer.id);
    expect(getPixel(stateObj.canvases.front, 2, 2)).to.deep.equal([
      255, 0, 0, 255,
    ]);

    partEditorTestApi.moveActiveLayer(stateObj, 1);
    expect(getPixel(stateObj.canvases.front, 2, 2)).to.deep.equal([
      0, 0, 255, 255,
    ]);

    baseLayer.locked = true;
    partEditorTestApi.mergeActiveLayerDown(stateObj);
    expect(stateObj.editLayers).to.have.length(2);

    baseLayer.locked = false;
    partEditorTestApi.mergeActiveLayerDown(stateObj);
    expect(stateObj.editLayers).to.have.length(1);
    expect(getActiveLayer(stateObj).id).to.equal(baseLayer.id);
    expect(getPixel(stateObj.canvases.front, 2, 2)).to.deep.equal([
      0, 0, 255, 255,
    ]);

    partEditorTestApi.deleteActiveLayer(stateObj);
    expect(stateObj.editLayers).to.have.length(1);

    partEditorTestApi.addEditLayer(stateObj);
    const hiddenLayer = getActiveLayer(stateObj);
    paintPixel(hiddenLayer.canvases.front, 2, 2, "#00ff00");
    hiddenLayer.visible = false;
    partEditorTestApi.recomposeCanvases(stateObj);
    expect(getPixel(stateObj.canvases.front, 2, 2)).to.deep.equal([
      0, 0, 255, 255,
    ]);

    partEditorTestApi.flattenVisibleLayers(stateObj);
    expect(stateObj.editLayers).to.have.length(1);
    expect(
      getPixel(getActiveLayer(stateObj).canvases.front, 2, 2),
    ).to.deep.equal([0, 0, 255, 255]);

    partEditorTestApi.addEditLayer(stateObj);
    const lockedLayer = getActiveLayer(stateObj);
    lockedLayer.locked = true;
    partEditorTestApi.deleteActiveLayer(stateObj);
    expect(getActiveLayer(stateObj).id).to.equal(lockedLayer.id);

    lockedLayer.locked = false;
    partEditorTestApi.deleteActiveLayer(stateObj);
    expect(stateObj.editLayers).to.have.length(1);
  });

  it("switches between global edits and animation frame edits without losing context", async () => {
    const stateObj = createPartEditorStateForTests({
      activeEditorTab: "edit",
      availableFrameAnimations: ["walk"],
    });
    paintActiveLayer(stateObj, "#ff0000", 5, 5);

    const frameState = createPartEditorStateForTests({
      availableFrameAnimations: ["walk"],
    });
    paintActiveLayer(frameState, "#0000ff", 5, 5);
    stateObj.frameEditorContexts[
      partEditorTestApi.getFrameContextKey("walk", 1)
    ] = partEditorTestApi.createEditorContextSnapshot(frameState);

    await partEditorTestApi.switchEditorContext(stateObj, true, "walk", 1);

    expect(stateObj.frameMode).to.equal(true);
    expect(stateObj.activeEditorTab).to.equal("animation");
    expect(stateObj.frameAnimation).to.equal("walk");
    expect(stateObj.frameIndex).to.equal(1);
    expect(getPixel(stateObj.canvases.front, 5, 5)).to.deep.equal([
      0, 0, 255, 255,
    ]);

    paintActiveLayer(stateObj, "#00ff00", 6, 6);
    await partEditorTestApi.switchEditorContext(stateObj, false);

    expect(stateObj.frameMode).to.equal(false);
    expect(getPixel(stateObj.canvases.front, 5, 5)).to.deep.equal([
      255, 0, 0, 255,
    ]);
    expect(getPixel(stateObj.canvases.front, 6, 6)).to.deep.equal([0, 0, 0, 0]);

    await partEditorTestApi.switchEditorContext(stateObj, true, "walk", 1);

    expect(getPixel(stateObj.canvases.front, 5, 5)).to.deep.equal([
      0, 0, 255, 255,
    ]);
    expect(getPixel(stateObj.canvases.front, 6, 6)).to.deep.equal([
      0, 255, 0, 255,
    ]);
  });

  it("populates thumbnail cache after recomposing canvases", () => {
    const stateObj = createPartEditorStateForTests();
    paintPixel(getActiveLayer(stateObj).canvases.front, 10, 10, "#abcdef");
    stateObj.thumbnailCache = null;

    expect(stateObj.thumbnailCache).to.equal(null);
    partEditorTestApi.recomposeCanvases(stateObj);

    expect(stateObj.thumbnailCache).to.not.equal(null);
    expect(stateObj.thumbnailCache.front).to.be.instanceof(HTMLCanvasElement);
    expect(stateObj.thumbnailCache.front.width).to.equal(64);
    expect(stateObj.thumbnailCache.front.height).to.equal(64);
    expect(getPixel(stateObj.thumbnailCache.front, 10, 10)).to.deep.equal([
      171, 205, 239, 255,
    ]);
  });

  it("copies selection with source direction and mirrors on left-right paste", () => {
    const stateObj = createPartEditorStateForTests();
    paintActiveLayer(stateObj, "#ff0000", 5, 5, "left");
    stateObj.selectionRect = { x: 4, y: 4, width: 3, height: 3 };
    stateObj.activeDirection = "left";

    const copied = partEditorTestApi.copySelection(stateObj);
    expect(copied).to.equal(true);
    expect(stateObj.clipboard.sourceDirection).to.equal("left");
    expect(getImageDataPixel(stateObj.clipboard.imageData, 1, 1)).to.deep.equal(
      [255, 0, 0, 255],
    );

    stateObj.activeDirection = "right";
    const pasted = partEditorTestApi.pasteClipboard(stateObj);
    expect(pasted).to.equal(true);
    // Pasted image should be horizontally flipped: pixel at (1,1) in 3x3 becomes (1,1) in flipped
    // because width=3, x=0->2, x=1->1, x=2->0, so center stays center
    expect(
      getPixel(getActiveLayer(stateObj).canvases.right, 5, 5),
    ).to.deep.equal([255, 0, 0, 255]);
  });

  it("nudges selection by 1px and 10px", () => {
    const stateObj = createPartEditorStateForTests();
    paintActiveLayer(stateObj, "#ff0000", 5, 5);
    stateObj.selectionRect = { x: 4, y: 4, width: 3, height: 3 };

    const nudged1 = partEditorTestApi.nudgeSelection(stateObj, "arrowright", 1);
    expect(nudged1).to.equal(true);
    expect(stateObj.selectionRect).to.deep.equal({
      x: 5,
      y: 4,
      width: 3,
      height: 3,
    });

    const nudged10 = partEditorTestApi.nudgeSelection(
      stateObj,
      "arrowdown",
      10,
    );
    expect(nudged10).to.equal(true);
    expect(stateObj.selectionRect).to.deep.equal({
      x: 5,
      y: 14,
      width: 3,
      height: 3,
    });
  });

  it("transforms only selected pixels when selection exists", () => {
    const stateObj = createPartEditorStateForTests();
    paintActiveLayer(stateObj, "#ff0000", 5, 5);
    paintActiveLayer(stateObj, "#00ff00", 20, 20);
    stateObj.selectionRect = { x: 4, y: 4, width: 3, height: 3 };

    partEditorTestApi.transformActivePixels(stateObj, "clear");

    // Selected pixel should be cleared
    expect(
      getPixel(getActiveLayer(stateObj).canvases.front, 5, 5),
    ).to.deep.equal([0, 0, 0, 0]);
    // Unselected pixel should remain
    expect(
      getPixel(getActiveLayer(stateObj).canvases.front, 20, 20),
    ).to.deep.equal([0, 255, 0, 255]);
  });

  it("detects dirty frames by comparing against global context", () => {
    const stateObj = createPartEditorStateForTests({
      availableFrameAnimations: ["walk"],
    });
    stateObj.globalEditorContext =
      partEditorTestApi.createEditorContextSnapshot(stateObj);

    expect(partEditorTestApi.isFrameDirty(stateObj, 0)).to.equal(false);

    const frameState = createPartEditorStateForTests({
      availableFrameAnimations: ["walk"],
    });
    paintActiveLayer(frameState, "#0000ff", 5, 5);
    stateObj.frameEditorContexts[
      partEditorTestApi.getFrameContextKey("walk", 0)
    ] = partEditorTestApi.createEditorContextSnapshot(frameState);

    expect(partEditorTestApi.isFrameDirty(stateObj, 0)).to.equal(true);
    expect(partEditorTestApi.isFrameDirty(stateObj, 1)).to.equal(false);
  });

  it("applies global edits to the current frame", async () => {
    const stateObj = createPartEditorStateForTests({
      availableFrameAnimations: ["walk"],
    });
    paintActiveLayer(stateObj, "#ff0000", 5, 5);
    stateObj.globalEditorContext =
      partEditorTestApi.createEditorContextSnapshot(stateObj);

    await partEditorTestApi.switchEditorContext(stateObj, true, "walk", 0);
    paintActiveLayer(stateObj, "#00ff00", 6, 6);

    expect(getPixel(stateObj.canvases.front, 5, 5)).to.deep.equal([
      255, 0, 0, 255,
    ]);
    expect(getPixel(stateObj.canvases.front, 6, 6)).to.deep.equal([
      0, 255, 0, 255,
    ]);

    await partEditorTestApi.applyGlobalToFrame(stateObj);

    expect(getPixel(stateObj.canvases.front, 5, 5)).to.deep.equal([
      255, 0, 0, 255,
    ]);
    expect(getPixel(stateObj.canvases.front, 6, 6)).to.deep.equal([0, 0, 0, 0]);
  });
});
