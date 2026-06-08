/**
 * Export Progress — lightweight progress reporting and cancellation for exports.
 */

import { showToast } from "./notifications.ts";

// ── Types ─────────────────────────────────────────────────────────────────

export type ProgressPhase =
  | "preparing"
  | "rendering"
  | "tweening"
  | "encoding"
  | "archiving"
  | "complete"
  | "error";

export type ExportProgress = {
  /** Unique ID for this export run */
  id: string;
  /** Current phase of the export */
  phase: ProgressPhase;
  /** Description shown in the UI */
  label: string;
  /** Current item being processed (0-indexed) */
  current: number;
  /** Total items to process */
  total: number;
  /** Whether the export is cancellable */
  cancellable: boolean;
  /** AbortController signal to cancel */
  controller: AbortController;
};

// ── State ─────────────────────────────────────────────────────────────────

let _currentProgress: ExportProgress | null = null;

// ── Public API ────────────────────────────────────────────────────────────

/** Create a new progress tracker for an export operation. */
export function createExportProgress(
  id: string,
  label: string,
  total: number,
  cancellable = true,
): ExportProgress {
  if (_currentProgress) {
    _currentProgress.controller.abort();
  }
  _currentProgress = {
    id,
    phase: "preparing",
    label,
    current: 0,
    total,
    cancellable,
    controller: new AbortController(),
  };
  return _currentProgress;
}

/** Get the current progress tracker, if any. */
export function getExportProgress(): ExportProgress | null {
  return _currentProgress;
}

/** Update the current phase of the export. */
export function setExportPhase(phase: ProgressPhase, label?: string): void {
  if (!_currentProgress) return;
  _currentProgress.phase = phase;
  if (label) _currentProgress.label = label;
}

/** Advance the progress counter by one and optionally update the label. */
export function tickExportProgress(label?: string): void {
  if (!_currentProgress) return;
  _currentProgress.current += 1;
  if (label) _currentProgress.label = label;
}

/** Set the total count (useful when the total is unknown at the start). */
export function setExportTotal(total: number): void {
  if (!_currentProgress) return;
  _currentProgress.total = total;
}

/** Check if the export should abort. Throws if cancelled. */
export function checkExportAborted(): void {
  if (!_currentProgress) return;
  if (_currentProgress.controller.signal.aborted) {
    const id = _currentProgress.id;
    _currentProgress = null;
    showToast("Export cancelled.", { kind: "warning" });
    throw new Error("Export cancelled: " + id);
  }
}

/** Complete the export successfully. */
export function completeExportProgress(label?: string): void {
  if (!_currentProgress) return;
  _currentProgress.phase = "complete";
  _currentProgress.current = _currentProgress.total;
  if (label) _currentProgress.label = label;
  _currentProgress = null;
}

/** Mark the export as failed. */
export function failExportProgress(errorMessage: string): void {
  if (!_currentProgress) return;
  _currentProgress.phase = "error";
  _currentProgress.label = errorMessage;
  _currentProgress = null;
}

/** Cancel the current export. */
export function cancelExport(): void {
  if (!_currentProgress) return;
  _currentProgress.controller.abort();
  _currentProgress = null;
  showToast("Export cancelled.", { kind: "warning" });
}

/** Get a progress percentage (0-100), or 0 if there's no active export. */
export function getExportPercent(): number {
  if (!_currentProgress || _currentProgress.total === 0) return 0;
  return Math.round((_currentProgress.current / _currentProgress.total) * 100);
}
