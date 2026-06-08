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
});
