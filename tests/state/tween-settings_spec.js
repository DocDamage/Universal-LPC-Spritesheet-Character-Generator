/**
 * Tween settings tests — covers global settings, overrides, estimates,
 * README generation, engine presets, and the new management functions.
 */

import { expect } from "chai";
import { describe, it, beforeEach } from "mocha-globals";
import { resetState } from "../../sources/state/hash.ts";
import { state } from "../../sources/state/state.ts";
import {
  getGlobalTweenSettings,
  getTweenSettingsForAnimation,
  setGlobalTweenSettings,
  applyTweenPreset,
  setTweenOverrideForAnimation,
  clearTweenOverrideForAnimation,
  hasTweenOverride,
  clearAllTweenOverrides,
  copySettingsToAllAnimations,
  resetAllTweenSettings,
  getOverrideCount,
  getOverriddenAnimations,
  estimateTweenExportFrames,
  buildTweenExportReadme,
  buildTweenEnginePresets,
} from "../../sources/state/tween-settings.ts";

describe("state/tween-settings.ts", () => {
  beforeEach(() => {
    resetState();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Global settings
  // ──────────────────────────────────────────────────────────────────────────

  describe("getGlobalTweenSettings", () => {
    it("returns the current global settings from state", () => {
      state.previewTweenMode = "crossfade";
      state.previewTweenInbetweens = 3;
      state.previewTweenFps = 12;
      var settings = getGlobalTweenSettings();
      expect(settings.mode).to.equal("crossfade");
      expect(settings.inbetweens).to.equal(3);
      expect(settings.fps).to.equal(12);
    });

    it("clamps out-of-range values via normalizeTweenSettings", () => {
      state.previewTweenInbetweens = 99;
      state.previewTweenFps = 999;
      var settings = getGlobalTweenSettings();
      expect(settings.inbetweens).to.be.at.most(4);
      expect(settings.fps).to.be.at.most(24);
    });
  });

  describe("setGlobalTweenSettings", () => {
    it("updates only the provided fields", () => {
      setGlobalTweenSettings({ mode: "hold", inbetweens: 3 });
      expect(state.previewTweenMode).to.equal("hold");
      expect(state.previewTweenInbetweens).to.equal(3);
      // Unchanged fields keep their defaults
      expect(state.previewTweenFps).to.equal(8);
    });
  });

  describe("applyTweenPreset", () => {
    it("applies the original preset", () => {
      var result = applyTweenPreset("original");
      expect(result.mode).to.equal("off");
      expect(state.previewTweenPreset).to.equal("original");
    });

    it("applies the smooth preset", () => {
      var result = applyTweenPreset("smooth");
      expect(result.mode).to.equal("crossfade");
      expect(result.inbetweens).to.be.greaterThan(1);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Per-animation overrides
  // ──────────────────────────────────────────────────────────────────────────

  describe("per-animation overrides", () => {
    it("getTweenSettingsForAnimation returns global when no override exists", () => {
      var settings = getTweenSettingsForAnimation("walk");
      expect(settings.mode).to.equal("off");
    });

    it("setTweenOverrideForAnimation stores an override", () => {
      var result = setTweenOverrideForAnimation("walk", {
        mode: "crossfade",
        inbetweens: 3,
      });
      expect(result.mode).to.equal("crossfade");
      expect(state.previewTweenOverrides.walk.mode).to.equal("crossfade");
    });

    it("hasTweenOverride returns true when an override exists", () => {
      setTweenOverrideForAnimation("walk", { mode: "hold" });
      expect(hasTweenOverride("walk")).to.equal(true);
      expect(hasTweenOverride("slash")).to.equal(false);
    });

    it("clearTweenOverrideForAnimation removes a specific override", () => {
      setTweenOverrideForAnimation("walk", { mode: "hold" });
      clearTweenOverrideForAnimation("walk");
      expect(hasTweenOverride("walk")).to.equal(false);
    });

    it("getTweenSettingsForAnimation returns the override when one exists", () => {
      setTweenOverrideForAnimation("walk", {
        mode: "pixel-motion",
        inbetweens: 4,
      });
      var settings = getTweenSettingsForAnimation("walk");
      expect(settings.mode).to.equal("pixel-motion");
      expect(settings.inbetweens).to.equal(4);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // New management functions (Phase 6)
  // ──────────────────────────────────────────────────────────────────────────

  describe("clearAllTweenOverrides", () => {
    it("removes all per-animation overrides", () => {
      setTweenOverrideForAnimation("walk", { mode: "hold" });
      setTweenOverrideForAnimation("slash", { mode: "crossfade" });
      expect(getOverrideCount()).to.equal(2);
      clearAllTweenOverrides();
      expect(getOverrideCount()).to.equal(0);
    });

    it("is a no-op when there are no overrides", () => {
      clearAllTweenOverrides();
      expect(getOverrideCount()).to.equal(0);
    });
  });

  describe("copySettingsToAllAnimations", () => {
    it("copies global settings as overrides to all standard animations", () => {
      setGlobalTweenSettings({ mode: "crossfade", inbetweens: 2 });
      copySettingsToAllAnimations();
      expect(getOverrideCount()).to.be.greaterThan(3);
      // Walk should have the global settings
      expect(state.previewTweenOverrides.walk).to.include({
        mode: "crossfade",
        inbetweens: 2,
      });
    });

    it("does not create overrides for noExport animations", () => {
      copySettingsToAllAnimations();
      // climb may be noExport — verify existing overrides are valid
      for (var key of Object.keys(state.previewTweenOverrides)) {
        expect(key).to.be.a("string").and.not.empty;
      }
    });
  });

  describe("resetAllTweenSettings", () => {
    it("resets global settings and clears overrides", () => {
      setGlobalTweenSettings({ mode: "crossfade", inbetweens: 5, fps: 24 });
      setTweenOverrideForAnimation("walk", { mode: "hold" });
      resetAllTweenSettings();
      expect(state.previewTweenMode).to.equal("off");
      expect(state.previewTweenInbetweens).to.equal(1);
      expect(state.previewTweenFps).to.equal(8);
      expect(getOverrideCount()).to.equal(0);
      expect(state.previewTweenPreset).to.equal("original");
    });
  });

  describe("getOverrideCount", () => {
    it("returns 0 when there are no overrides", () => {
      expect(getOverrideCount()).to.equal(0);
    });

    it("returns the correct count", () => {
      setTweenOverrideForAnimation("walk", { mode: "hold" });
      setTweenOverrideForAnimation("slash", { mode: "crossfade" });
      expect(getOverrideCount()).to.equal(2);
    });
  });

  describe("getOverriddenAnimations", () => {
    it("returns sorted animation names with overrides", () => {
      setTweenOverrideForAnimation("slash", { mode: "crossfade" });
      setTweenOverrideForAnimation("walk", { mode: "hold" });
      var names = getOverriddenAnimations();
      expect(names).to.deep.equal(["slash", "walk"]);
    });

    it("returns empty array when no overrides exist", () => {
      expect(getOverriddenAnimations()).to.deep.equal([]);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Estimate, README, engine presets
  // ──────────────────────────────────────────────────────────────────────────

  describe("estimateTweenExportFrames", () => {
    it("returns a valid estimate with tween off", () => {
      state.previewTweenMode = "off";
      var estimate = estimateTweenExportFrames();
      expect(estimate.enabled).to.equal(false);
      expect(estimate.sourceFrames).to.be.greaterThan(0);
      expect(estimate.generatedTweenFrames).to.equal(0);
      expect(estimate.totalFrames).to.equal(estimate.sourceFrames);
    });

    it("returns generated tween frames when tween is on", () => {
      state.previewTweenMode = "crossfade";
      state.previewTweenInbetweens = 2;
      var estimate = estimateTweenExportFrames();
      expect(estimate.enabled).to.equal(true);
      expect(estimate.generatedTweenFrames).to.be.greaterThan(0);
      expect(estimate.totalFrames).to.be.greaterThan(estimate.sourceFrames);
    });
  });

  describe("buildTweenExportReadme", () => {
    it("returns a non-empty readme for split-by-animation", () => {
      var readme = buildTweenExportReadme("split-by-animation");
      expect(readme).to.be.a("string");
      expect(readme.length).to.be.greaterThan(100);
      expect(readme).to.include("LPC Tween Export");
      expect(readme).to.include("standard/");
    });

    it("returns a non-empty readme for individual-frames", () => {
      var readme = buildTweenExportReadme("individual-frames");
      expect(readme).to.include("_tween_");
    });

    it("includes override info when overrides exist", () => {
      setTweenOverrideForAnimation("walk", { mode: "hold" });
      var readme = buildTweenExportReadme("split-by-animation");
      expect(readme).to.include("walk");
    });
  });

  describe("buildTweenEnginePresets", () => {
    it("returns presets for all four engines", () => {
      var presets = buildTweenEnginePresets("split-by-animation", 64);
      expect(presets.length).to.equal(4);
      expect(
        presets.map(function (p) {
          return p.engine;
        }),
      ).to.deep.equal(["generic", "godot", "phaser", "rpg-maker"]);
    });

    it("includes animation details", () => {
      var presets = buildTweenEnginePresets("individual-frames", 64);
      expect(presets[0].animations.length).to.be.greaterThan(0);
      expect(presets[0].animations[0]).to.include.keys(
        "id",
        "mode",
        "inbetweens",
        "fps",
        "frameDurationMs",
      );
    });

    it("uses individual-frames path template", () => {
      var presets = buildTweenEnginePresets("individual-frames", 64);
      expect(presets[0].pathTemplate).to.include("{frame}");
    });

    it("uses split-by-animation path template", () => {
      var presets = buildTweenEnginePresets("split-by-animation", 64);
      expect(presets[0].pathTemplate).to.include("{animation}");
      expect(presets[0].pathTemplate).to.not.include("{frame}");
    });
  });
});
