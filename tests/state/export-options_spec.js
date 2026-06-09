// @ts-nocheck
import { expect } from "chai";
import { describe, it, beforeEach } from "mocha-globals";
import { resetState } from "../../sources/state/hash.ts";
import { state } from "../../sources/state/state.ts";
import {
  EXPORT_OPTIONS,
  getExportOption,
  getExportOptionsByKind,
  buildExportSummary,
  getEngineGuidance,
  ENGINE_GUIDANCE,
  createDefaultWizardState,
} from "../../sources/state/export-options.ts";

describe("state/export-options.ts", () => {
  beforeEach(() => {
    resetState();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Static metadata
  // ──────────────────────────────────────────────────────────────────────────

  describe("EXPORT_OPTIONS", () => {
    it("includes all expected export targets", () => {
      const ids = EXPORT_OPTIONS.map(function (o) {
        return o.id;
      });
      expect(ids).to.include.members([
        "png",
        "gif-preview",
        "webp-preview",
        "credits-txt",
        "credits-csv",
        "json-clipboard",
        "json-clipboard-import",
        "zip-split-animation",
        "zip-split-item",
        "zip-split-animation-item",
        "zip-individual-frames",
      ]);
    });

    it("every export has a truthy label", function () {
      for (var i = 0; i < EXPORT_OPTIONS.length; i++) {
        expect(EXPORT_OPTIONS[i].label).to.be.a("string").and.not.empty;
      }
    });

    it("ZIP exports are flagged correctly", function () {
      var zipIds = EXPORT_OPTIONS.filter(function (o) {
        return o.isZip;
      }).map(function (o) {
        return o.id;
      });
      expect(zipIds).to.deep.equal([
        "zip-split-animation",
        "zip-split-item",
        "zip-split-animation-item",
        "zip-individual-frames",
      ]);
    });

    it("only ZIP exports support engine presets", function () {
      for (var i = 0; i < EXPORT_OPTIONS.length; i++) {
        var opt = EXPORT_OPTIONS[i];
        if (opt.isZip) {
          expect(opt.supportsEnginePresets).to.be.a("boolean");
        } else {
          expect(opt.supportsEnginePresets).to.equal(false);
        }
      }
    });

    it("GIF and WebP have usesTween = true", function () {
      expect(getExportOption("gif-preview").usesTween).to.equal(true);
      expect(getExportOption("webp-preview").usesTween).to.equal(true);
    });

    it("image and text exports have usesTween = false", function () {
      expect(getExportOption("png").usesTween).to.equal(false);
      expect(getExportOption("credits-txt").usesTween).to.equal(false);
      expect(getExportOption("credits-csv").usesTween).to.equal(false);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Lookup helpers
  // ──────────────────────────────────────────────────────────────────────────

  describe("getExportOption", function () {
    it("returns the option for a known id", function () {
      expect(getExportOption("png")).to.include({ id: "png" });
    });

    it("returns undefined for an unknown id", function () {
      expect(getExportOption("unknown")).to.equal(undefined);
    });
  });

  describe("getExportOptionsByKind", function () {
    it("returns only ZIP options for kind=zip", function () {
      var zips = getExportOptionsByKind("zip");
      expect(zips.length).to.equal(4);
      expect(
        zips.every(function (o) {
          return o.isZip;
        }),
      ).to.equal(true);
    });

    it("returns only animation options for kind=animation", function () {
      var anims = getExportOptionsByKind("animation");
      expect(anims.length).to.equal(2);
      expect(
        anims.map(function (o) {
          return o.id;
        }),
      ).to.deep.equal(["gif-preview", "webp-preview"]);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // buildExportSummary
  // ──────────────────────────────────────────────────────────────────────────

  describe("buildExportSummary", function () {
    it("returns null for unknown target", function () {
      expect(buildExportSummary("unknown")).to.equal(null);
    });

    it("returns a basic PNG summary", function () {
      var summary = buildExportSummary("png");
      expect(summary.format).to.equal("PNG");
      expect(summary.title).to.equal("Character spritesheet");
      expect(summary.includesTweenFrames).to.equal(false);
    });

    it("returns a GIF summary", function () {
      var summary = buildExportSummary("gif-preview");
      expect(summary.format).to.equal("GIF");
      expect(summary.title).to.include("Animated");
    });

    it("returns a WebP summary", function () {
      var summary = buildExportSummary("webp-preview");
      expect(summary.format).to.equal("WebP");
    });

    it("returns a split-by-animation ZIP summary", function () {
      var summary = buildExportSummary("zip-split-animation");
      expect(summary.format).to.equal("ZIP");
      expect(summary.fileTree.length).to.be.greaterThan(3);
      var labels = summary.fileTree.map(function (f) {
        return f.label;
      });
      expect(
        labels.some(function (l) {
          return l.indexOf("standard") !== -1;
        }),
      ).to.equal(true);
      expect(
        labels.some(function (l) {
          return l.indexOf("credits") !== -1;
        }),
      ).to.equal(true);
    });

    it("includes warning when tween is off for a tween-capable export", function () {
      state.previewTweenMode = "off";
      var summary = buildExportSummary("zip-split-animation");
      expect(
        summary.warnings.some(function (w) {
          return w.toLowerCase().indexOf("tween mode") !== -1;
        }),
      ).to.equal(true);
    });

    it("includes engine preset in file tree when engineTarget is specified", function () {
      var summary = buildExportSummary("zip-split-animation", "godot");
      expect(summary.enginePreset).to.equal("godot");
      var labels = summary.fileTree.map(function (f) {
        return f.label;
      });
      expect(
        labels.some(function (l) {
          return l.indexOf("godot") !== -1;
        }),
      ).to.equal(true);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Engine guidance
  // ──────────────────────────────────────────────────────────────────────────

  describe("ENGINE_GUIDANCE", function () {
    it("covers all four engines", function () {
      expect(
        ENGINE_GUIDANCE.map(function (g) {
          return g.engine;
        }),
      ).to.deep.equal(["generic", "godot", "phaser", "rpg-maker"]);
    });

    it("Godot prefers split-by-animation", function () {
      var godot = getEngineGuidance("godot");
      expect(godot.preferredExport).to.equal("zip-split-animation");
    });

    it("Generic prefers individual frames", function () {
      var generic = getEngineGuidance("generic");
      expect(generic.preferredExport).to.equal("zip-individual-frames");
    });

    it("returns undefined for unknown engine", function () {
      expect(getEngineGuidance("unknown")).to.equal(undefined);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Wizard state
  // ──────────────────────────────────────────────────────────────────────────

  describe("createDefaultWizardState", function () {
    it("returns closed state with no selections", function () {
      var wizardState = createDefaultWizardState();
      expect(wizardState.open).to.equal(false);
      expect(wizardState.selectedEngine).to.equal(null);
      expect(wizardState.selectedExport).to.equal(null);
    });
  });
});
