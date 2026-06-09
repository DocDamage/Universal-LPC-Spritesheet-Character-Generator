// @ts-nocheck
import { expect } from "chai";
import { describe, it } from "mocha-globals";
import { encodeCanvasesAsGif } from "../../sources/canvas/preview-gif.ts";
import { encodeCanvasesAsAnimatedWebp } from "../../sources/canvas/preview-webp.ts";

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

  it("wraps GIF frames as animated WebP through an injected encoder", async () => {
    const webpBytes = new Uint8Array([82, 73, 70, 70]);
    const encoder = {
      encodeGifImageData(gifBytes, size, lossless) {
        expect(gifBytes.slice(0, 6)).to.deep.equal(
          new Uint8Array([71, 73, 70, 56, 57, 97]),
        );
        expect(size).to.equal(gifBytes.length);
        expect(lossless).to.equal(1);
        return webpBytes;
      },
    };

    const blob = await encodeCanvasesAsAnimatedWebp(
      [makeFrame("red"), makeFrame("blue")],
      12,
      encoder,
    );
    const header = new Uint8Array(await blob.arrayBuffer());

    expect(blob.type).to.equal("image/webp");
    expect(header).to.deep.equal(webpBytes);
  });

  it("encodes canvases to animated WebP directly using native browser encoder", async () => {
    // Only verify if browser supports webp canvas export
    const checkCanvas = document.createElement("canvas");
    const dataUrl = checkCanvas.toDataURL("image/webp");
    if (!dataUrl.startsWith("data:image/webp")) {
      // Skip if browser environment has no native webp support
      return;
    }

    const blob = await encodeCanvasesAsAnimatedWebp(
      [makeFrame("red"), makeFrame("blue")],
      12
    );
    const buffer = new Uint8Array(await blob.arrayBuffer());
    
    expect(blob.type).to.equal("image/webp");
    expect(blob.size).to.be.greaterThan(30);
    // Header should start with RIFF...WEBP
    const headerStr = String.fromCharCode(...buffer.slice(0, 4)) + String.fromCharCode(...buffer.slice(8, 12));
    expect(headerStr).to.equal("RIFFWEBP");
  });
});
