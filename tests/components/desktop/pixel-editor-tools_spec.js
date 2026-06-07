import { expect } from "chai";
import { describe, it } from "mocha-globals";
import { FRAME_SIZE } from "../../../sources/state/constants.ts";
import { get2DContext } from "../../../sources/canvas/canvas-utils.ts";
import {
  applyBrush,
  DIRECTIONS,
} from "../../../sources/components/desktop/pixel-editor-tools.ts";

function createDirectionCanvases() {
  return Object.fromEntries(
    DIRECTIONS.map((direction) => {
      const canvas = document.createElement("canvas");
      canvas.width = FRAME_SIZE;
      canvas.height = FRAME_SIZE;
      return [direction, canvas];
    }),
  );
}

function getPixel(canvas, x, y) {
  return Array.from(get2DContext(canvas, true).getImageData(x, y, 1, 1).data);
}

describe("components/desktop/pixel-editor-tools.ts", () => {
  it("mirrors propagated front-view brush edits onto the right side", () => {
    const canvases = createDirectionCanvases();
    const toolState = {
      activeDirection: "front",
      tool: "pen",
      activeColor: "#ff0000",
      autoPropagate: true,
      canvases,
      brushSize: 1,
      mirrorX: false,
      mirrorY: false,
      alphaLocked: false,
    };

    applyBrush(toolState, { x: 10, y: 20 }, "paint");

    expect(getPixel(canvases.front, 10, 20)).to.deep.equal([255, 0, 0, 255]);
    expect(getPixel(canvases.back, 10, 20)).to.deep.equal([255, 0, 0, 255]);
    expect(getPixel(canvases.left, 10, 20)).to.deep.equal([255, 0, 0, 255]);
    expect(getPixel(canvases.right, FRAME_SIZE - 1 - 10, 20)).to.deep.equal([
      255, 0, 0, 255,
    ]);
    expect(getPixel(canvases.right, 10, 20)).to.deep.equal([0, 0, 0, 0]);
  });

  it("does not propagate side-view edits to other directions", () => {
    const canvases = createDirectionCanvases();
    const toolState = {
      activeDirection: "left",
      tool: "pen",
      activeColor: "#00ff00",
      autoPropagate: true,
      canvases,
      brushSize: 1,
      mirrorX: false,
      mirrorY: false,
      alphaLocked: false,
    };

    applyBrush(toolState, { x: 12, y: 18 }, "paint");

    expect(getPixel(canvases.left, 12, 18)).to.deep.equal([0, 255, 0, 255]);
    expect(getPixel(canvases.front, 12, 18)).to.deep.equal([0, 0, 0, 0]);
    expect(getPixel(canvases.back, 12, 18)).to.deep.equal([0, 0, 0, 0]);
    expect(getPixel(canvases.right, FRAME_SIZE - 1 - 12, 18)).to.deep.equal([
      0, 0, 0, 0,
    ]);
  });
});
