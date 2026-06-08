import { expect } from "chai";
import { describe, it } from "mocha-globals";
import { encodeCanvasesAsGif } from "../../sources/canvas/preview-gif.ts";

function makeFrame(color) {
  const canvas = document.createElement("canvas");
  canvas.width = 2;
  canvas.height = 2;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 2, 2);
  return canvas;
}

describe("canvas/preview-gif.ts", () => {
  it("encodes canvases as an animated GIF blob", async () => {
    const blob = encodeCanvasesAsGif([makeFrame("red"), makeFrame("blue")], 12);
    const header = await blob.slice(0, 6).text();

    expect(blob.type).to.equal("image/gif");
    expect(header).to.equal("GIF89a");
    expect(blob.size).to.be.greaterThan(20);
  });

  it("rejects empty frame lists", () => {
    expect(() => encodeCanvasesAsGif([], 12)).to.throw(
      "Cannot encode an empty GIF",
    );
  });
});
