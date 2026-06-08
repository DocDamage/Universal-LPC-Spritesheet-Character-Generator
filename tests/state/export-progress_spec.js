/**
 * Export progress tests — covers progress creation, phase updates,
 * ticking, cancellation, completion, and failure.
 */

import { expect } from "chai";
import { describe, it, beforeEach } from "mocha-globals";
import {
  createExportProgress,
  getExportProgress,
  setExportPhase,
  tickExportProgress,
  setExportTotal,
  checkExportAborted,
  completeExportProgress,
  failExportProgress,
  cancelExport,
  getExportPercent,
} from "../../sources/state/export-progress.ts";

describe("state/export-progress.ts", () => {
  beforeEach(() => {
    // Cancel any lingering progress
    cancelExport();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // createExportProgress
  // ──────────────────────────────────────────────────────────────────────────

  describe("createExportProgress", () => {
    it("creates a new progress tracker", () => {
      var progress = createExportProgress("test-1", "Testing", 10);
      expect(progress.id).to.equal("test-1");
      expect(progress.label).to.equal("Testing");
      expect(progress.total).to.equal(10);
      expect(progress.current).to.equal(0);
      expect(progress.phase).to.equal("preparing");
      expect(progress.cancellable).to.equal(true);
      expect(progress.controller).to.be.instanceOf(AbortController);
    });

    it("returns the progress and sets it as current", () => {
      var progress = createExportProgress("test-2", "Test", 5, false);
      expect(getExportProgress()).to.equal(progress);
      expect(progress.cancellable).to.equal(false);
    });

    it("aborts previous progress when a new one is created", () => {
      var p1 = createExportProgress("first", "First", 10);
      var p2 = createExportProgress("second", "Second", 10);
      expect(p1.controller.signal.aborted).to.equal(true);
      expect(p2.controller.signal.aborted).to.equal(false);
      expect(getExportProgress()).to.equal(p2);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // getExportProgress
  // ──────────────────────────────────────────────────────────────────────────

  describe("getExportProgress", () => {
    it("returns null when no export is active", () => {
      expect(getExportProgress()).to.equal(null);
    });

    it("returns the current progress when one is active", () => {
      var p = createExportProgress("test", "Test", 10);
      expect(getExportProgress()).to.equal(p);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // setExportPhase
  // ──────────────────────────────────────────────────────────────────────────

  describe("setExportPhase", () => {
    it("updates the phase and label", () => {
      createExportProgress("test", "Starting", 10);
      setExportPhase("rendering", "Rendering frames...");
      var p = getExportProgress();
      expect(p.phase).to.equal("rendering");
      expect(p.label).to.equal("Rendering frames...");
    });

    it("updates only the phase when no label is given", () => {
      createExportProgress("test", "Starting", 10);
      setExportPhase("encoding");
      expect(getExportProgress().phase).to.equal("encoding");
    });

    it("is a no-op when there is no active progress", () => {
      // Should not throw
      setExportPhase("complete");
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // tickExportProgress
  // ──────────────────────────────────────────────────────────────────────────

  describe("tickExportProgress", () => {
    it("increments current by 1", () => {
      createExportProgress("test", "Processing", 5);
      tickExportProgress();
      expect(getExportProgress().current).to.equal(1);
      tickExportProgress();
      expect(getExportProgress().current).to.equal(2);
    });

    it("updates the label when provided", () => {
      createExportProgress("test", "Processing", 5);
      tickExportProgress("Frame 1");
      expect(getExportProgress().label).to.equal("Frame 1");
    });

    it("is a no-op when there is no active progress", () => {
      tickExportProgress();
      // Should not throw
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // setExportTotal
  // ──────────────────────────────────────────────────────────────────────────

  describe("setExportTotal", () => {
    it("updates the total count", () => {
      createExportProgress("test", "Unknown total", 0);
      setExportTotal(42);
      expect(getExportProgress().total).to.equal(42);
    });

    it("is a no-op when there is no active progress", () => {
      setExportTotal(10);
      // Should not throw
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // checkExportAborted
  // ──────────────────────────────────────────────────────────────────────────

  describe("checkExportAborted", () => {
    it("does not throw when not aborted", () => {
      createExportProgress("test", "Running", 10);
      expect(function () {
        checkExportAborted();
      }).to.not.throw();
    });

    it("throws when the export has been cancelled", function () {
      createExportProgress("test", "Running", 10);
      cancelExport();
      expect(function () {
        checkExportAborted();
      }).to.throw("Export cancelled");
    });

    it("is a no-op when there is no active progress", () => {
      expect(function () {
        checkExportAborted();
      }).to.not.throw();
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // completeExportProgress
  // ──────────────────────────────────────────────────────────────────────────

  describe("completeExportProgress", () => {
    it("marks the export as complete and sets current to total", () => {
      createExportProgress("test", "Exporting", 10);
      tickExportProgress();
      completeExportProgress("Done!");
      var p = getExportProgress();
      // After complete, _currentProgress is null
      expect(p).to.equal(null);
    });

    it("is a no-op when there is no active progress", () => {
      completeExportProgress();
      // Should not throw
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // failExportProgress
  // ──────────────────────────────────────────────────────────────────────────

  describe("failExportProgress", () => {
    it("marks the export as failed and clears current", () => {
      createExportProgress("test", "Exporting", 10);
      failExportProgress("Something went wrong");
      expect(getExportProgress()).to.equal(null);
    });

    it("is a no-op when there is no active progress", () => {
      failExportProgress("Error");
      // Should not throw
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // cancelExport
  // ──────────────────────────────────────────────────────────────────────────

  describe("cancelExport", () => {
    it("aborts the controller and clears current progress", () => {
      var p = createExportProgress("test", "Running", 10);
      cancelExport();
      expect(p.controller.signal.aborted).to.equal(true);
      expect(getExportProgress()).to.equal(null);
    });

    it("is a no-op when there is no active export", () => {
      cancelExport();
      // Should not throw
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // getExportPercent
  // ──────────────────────────────────────────────────────────────────────────

  describe("getExportPercent", () => {
    it("returns 0 when no export is active", () => {
      expect(getExportPercent()).to.equal(0);
    });

    it("returns 0 when total is 0", () => {
      createExportProgress("test", "Unknown", 0);
      expect(getExportPercent()).to.equal(0);
    });

    it("calculates the correct percentage", () => {
      createExportProgress("test", "Progress", 10);
      tickExportProgress(); // 1/10
      expect(getExportPercent()).to.equal(10);
      tickExportProgress(); // 2/10
      expect(getExportPercent()).to.equal(20);
      tickExportProgress(); // 3/10
      expect(getExportPercent()).to.equal(30);
    });
  });
});
