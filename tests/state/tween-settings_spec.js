import { expect } from "chai";
import { describe, it, beforeEach } from "mocha-globals";
import { resetState } from "../../sources/state/hash.ts";
import { state } from "../../sources/state/state.ts";
import {
  applyTweenPreset,
  buildTweenEnginePresets,
  buildTweenExportReadme,
  estimateTweenExportFrames,
  getTweenSettingsForAnimation,
  setTweenOverrideForAnimation,
} from "../../sources/state/tween-settings.ts";

describe("state/tween-settings.ts", () => {
  beforeEach(() => {
    resetState();
  });

  it("applies global tween presets", () => {
    const settings = applyTweenPreset("pixel-art");

    expect(settings).to.include({
      mode: "pixel-motion",
      inbetweens: 2,
      fps: 12,
      alphaThreshold: 16,
    });
    expect(state.previewTweenPreset).to.equal("pixel-art");
  });

  it("returns per-animation overrides when present", () => {
    applyTweenPreset("smooth");
    setTweenOverrideForAnimation("slash", {
      mode: "hold",
      inbetweens: 3,
      fps: 10,
    });

    expect(getTweenSettingsForAnimation("slash")).to.include({
      mode: "hold",
      inbetweens: 3,
      fps: 10,
    });
    expect(getTweenSettingsForAnimation("walk")).to.include({
      mode: "crossfade",
      inbetweens: 2,
      fps: 12,
    });
  });

  it("estimates generated tween frames", () => {
    state.previewTweenMode = "crossfade";
    state.previewTweenInbetweens = 1;

    const estimate = estimateTweenExportFrames();

    expect(estimate.enabled).to.equal(true);
    expect(estimate.sourceFrames).to.be.greaterThan(0);
    expect(estimate.generatedTweenFrames).to.be.greaterThan(0);
    expect(estimate.totalFrames).to.equal(
      estimate.sourceFrames + estimate.generatedTweenFrames,
    );
  });

  it("builds export README text with override summary", () => {
    setTweenOverrideForAnimation("walk", { mode: "hold" });

    const readme = buildTweenExportReadme("individual-frames");

    expect(readme).to.include("LPC Tween Export");
    expect(readme).to.include("individual-frames");
    expect(readme).to.include("walk");
  });

  it("builds engine presets for tween export importers", () => {
    const presets = buildTweenEnginePresets("split-by-animation", 64);

    expect(presets.map((preset) => preset.engine)).to.deep.equal([
      "generic",
      "godot",
      "phaser",
      "rpg-maker",
    ]);
    expect(presets[0].pathTemplate).to.equal(
      "tweened/standard/{animation}.png",
    );
    expect(presets[0].frameSize).to.equal(64);
    expect(presets[0].animations.map((animation) => animation.id)).to.include(
      "walk",
    );
  });
});
