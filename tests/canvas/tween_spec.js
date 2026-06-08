import { expect } from "chai";
import { describe, it } from "mocha-globals";
import {
  buildTweenSteps,
  normalizeTweenFps,
  normalizeTweenInbetweens,
  normalizeTweenSettings,
  tweenImageData,
} from "../../sources/canvas/tween.ts";

function makePixelImageData(pixel) {
  return new ImageData(new Uint8ClampedArray(pixel), 1, 1);
}

describe("canvas/tween.ts", () => {
  describe("buildTweenSteps", () => {
    it("returns only source frames when tweening is off", () => {
      const steps = buildTweenSteps([1, 2, 3], {
        mode: "off",
        inbetweens: 3,
      });

      expect(steps.map((step) => step.from)).to.deep.equal([1, 2, 3]);
      expect(steps.every((step) => step.isTween === false)).to.equal(true);
    });

    it("inserts evenly-spaced tween steps between looped frames", () => {
      const steps = buildTweenSteps(["a", "b"], {
        mode: "crossfade",
        inbetweens: 2,
      });

      expect(steps).to.have.length(6);
      expect(steps.map((step) => step.t)).to.deep.equal([
        0,
        1 / 3,
        2 / 3,
        0,
        1 / 3,
        2 / 3,
      ]);
      expect(steps[1]).to.include({
        from: "a",
        to: "b",
        isTween: true,
      });
      expect(steps[4]).to.include({
        from: "b",
        to: "a",
        isTween: true,
      });
    });
  });

  describe("normalizers", () => {
    it("clamps in-between counts to the supported range", () => {
      expect(normalizeTweenInbetweens(-5)).to.equal(0);
      expect(normalizeTweenInbetweens(99)).to.equal(4);
      expect(normalizeTweenInbetweens(2.4)).to.equal(2);
    });

    it("clamps FPS to the supported range", () => {
      expect(normalizeTweenFps(-5)).to.equal(1);
      expect(normalizeTweenFps(99)).to.equal(24);
      expect(normalizeTweenFps(12.4)).to.equal(12);
    });

    it("normalizes motion tuning values", () => {
      expect(
        normalizeTweenSettings({
          mode: "pixel-motion",
          inbetweens: 2,
          fps: 12,
          motionStrength: 1.26,
          alphaThreshold: 300,
        }),
      ).to.deep.include({
        motionStrength: 1.3,
        alphaThreshold: 255,
      });
    });
  });

  describe("tweenImageData", () => {
    it("crossfades pixel channels", () => {
      const from = makePixelImageData([0, 0, 0, 0]);
      const to = makePixelImageData([100, 50, 200, 255]);

      const tweened = tweenImageData(from, to, "crossfade", 0.5);

      expect(Array.from(tweened.data)).to.deep.equal([50, 25, 100, 128]);
    });

    it("keeps hold frames pixel-perfect until the target frame", () => {
      const from = makePixelImageData([10, 20, 30, 255]);
      const to = makePixelImageData([100, 110, 120, 255]);

      expect(
        Array.from(tweenImageData(from, to, "hold", 0.5).data),
      ).to.deep.equal([10, 20, 30, 255]);
      expect(
        Array.from(tweenImageData(from, to, "hold", 1).data),
      ).to.deep.equal([100, 110, 120, 255]);
    });

    it("moves pixel-art frames without blending colors", () => {
      const from = makePixelImageData([10, 20, 30, 255]);
      const to = makePixelImageData([100, 110, 120, 255]);

      const tweened = tweenImageData(from, to, "pixel-motion", 0.5);

      expect(Array.from(tweened.data)).to.deep.equal([100, 110, 120, 255]);
    });

    it("honors pixel-motion alpha threshold", () => {
      const from = makePixelImageData([10, 20, 30, 10]);
      const to = makePixelImageData([100, 110, 120, 10]);

      const tweened = tweenImageData(from, to, "pixel-motion", 0.5, {
        alphaThreshold: 16,
      });

      expect(Array.from(tweened.data)).to.deep.equal([100, 110, 120, 10]);
    });

    it("rejects mismatched image dimensions", () => {
      const from = new ImageData(1, 1);
      const to = new ImageData(2, 1);

      expect(() => tweenImageData(from, to, "crossfade", 0.5)).to.throw(
        "Cannot tween ImageData with different dimensions",
      );
    });
  });
});
