// @ts-nocheck
/**
 * ExportWizard unit tests — validate the wizard modal component logic.
 * These tests verify the wizard's behavior without mounting DOM.
 */

import { expect } from "chai";
import { describe, it, beforeEach } from "mocha-globals";
import { resetState } from "../../../sources/state/hash.ts";
import {
  EXPORT_OPTIONS,
  buildExportSummary,
  getEngineGuidance,
  createDefaultWizardState,
} from "../../../sources/state/export-options.ts";

describe("ExportWizard", function () {
  beforeEach(function () {
    resetState();
  });

  // ── Export summary building ─────────────────────────────────────────────

  describe("buildExportSummary", function () {
    it("GIF summary is kind=animation", function () {
      var s = buildExportSummary("gif-preview");
      expect(s.format).to.equal("GIF");
      expect(s.fileTree.length).to.equal(1);
      expect(s.fileTree[0].label).to.include(".gif");
    });

    it("WebP summary is kind=animation", function () {
      var s = buildExportSummary("webp-preview");
      expect(s.format).to.equal("WebP");
    });

    it("split-by-animation ZIP has paths for standard animation dirs", function () {
      var s = buildExportSummary("zip-split-animation");
      expect(s.format).to.equal("ZIP");
      expect(
        s.fileTree.some(function (f) {
          return f.label.indexOf("standard") !== -1;
        }),
      ).to.equal(true);
      expect(
        s.fileTree.some(function (f) {
          return f.label.indexOf("credits") !== -1;
        }),
      ).to.equal(true);
    });

    it("individual-frames ZIP warns about large output when tween enabled", function () {
      var s = buildExportSummary("zip-individual-frames");
      expect(s.totalFrames).to.be.greaterThan(0);
    });

    it("GIF export has file tree with only the gif path", function () {
      var s = buildExportSummary("gif-preview");
      expect(
        s.fileTree.every(function (f) {
          return f.indent === 0;
        }),
      ).to.equal(true);
    });
  });

  // ── Engine guidance ─────────────────────────────────────────────────────

  describe("Engine guidance", function () {
    it("Godot guidance describes AnimatedSprite2D", function () {
      var godot = getEngineGuidance("godot");
      expect(godot.description).to.not.be.empty;
      expect(godot.notes.length).to.be.greaterThan(0);
    });

    it("Phaser guidance includes frame size info", function () {
      var phaser = getEngineGuidance("phaser");
      expect(
        phaser.notes.some(function (n) {
          return n.indexOf("frame") !== -1;
        }),
      ).to.equal(true);
    });

    it("RPG Maker guidance includes conversion note", function () {
      var rpg = getEngineGuidance("rpg-maker");
      expect(
        rpg.notes.some(function (n) {
          return n.indexOf("convert") !== -1 || n.indexOf("plugin") !== -1;
        }),
      ).to.equal(true);
    });

    it("Generic guidance prefers individual frames", function () {
      var generic = getEngineGuidance("generic");
      expect(generic.preferredExport).to.equal("zip-individual-frames");
    });
  });

  // ── Wizard state ────────────────────────────────────────────────────────

  describe("Wizard state defaults", function () {
    it("default state is closed with no selections", function () {
      var ws = createDefaultWizardState();
      expect(ws.open).to.equal(false);
      expect(ws.selectedEngine).to.equal(null);
      expect(ws.selectedExport).to.equal(null);
    });

    it("Godot target sets preferred export to split-by-animation", function () {
      var ws = createDefaultWizardState();
      ws.selectedEngine = "godot";
      ws.selectedExport = getEngineGuidance("godot").preferredExport;
      expect(ws.selectedExport).to.equal("zip-split-animation");
    });

    it("Generic target sets preferred export to individual-frames", function () {
      var ws = createDefaultWizardState();
      ws.selectedEngine = "generic";
      ws.selectedExport = getEngineGuidance("generic").preferredExport;
      expect(ws.selectedExport).to.equal("zip-individual-frames");
    });
  });

  // ── Export run handlers ─────────────────────────────────────────────────

  describe("Export routing", function () {
    it("gif-preview target maps to GIF export", function () {
      var opt = EXPORT_OPTIONS.find(function (o) {
        return o.id === "gif-preview";
      });
      expect(opt.kind).to.equal("animation");
    });

    it("webp-preview target maps to WebP export", function () {
      var opt = EXPORT_OPTIONS.find(function (o) {
        return o.id === "webp-preview";
      });
      expect(opt.kind).to.equal("animation");
    });

    it("ZIP exports have isZip=true", function () {
      var zipIds = [
        "zip-split-animation",
        "zip-split-item",
        "zip-split-animation-item",
        "zip-individual-frames",
      ];
      zipIds.forEach(function (id) {
        var opt = EXPORT_OPTIONS.find(function (o) {
          return o.id === id;
        });
        expect(opt.isZip).to.equal(true);
      });
    });
  });
});
