/**
 * Export Wizard — a compact modal that guides users through choosing a target
 * workflow (Godot, Phaser, RPG Maker, Generic) and an export format, then
 * calls the existing export functions.
 *
 * The wizard replaces separate button-knowledge with presets so users don't
 * need to understand ZIP paths and engine-manifest details up front.
 */

import m from "mithril";
import {
  EXPORT_OPTIONS,
  buildExportSummary,
  getEngineGuidance,
  ENGINE_GUIDANCE,
  createDefaultWizardState,
  type ExportTargetId,
  type ExportWizardState,
  type EngineGuidance,
  type ExportSummary,
} from "../../state/export-options.ts";
import { downloadPreviewAnimationGif } from "../../canvas/preview-gif.ts";
import { downloadPreviewAnimationWebp } from "../../canvas/preview-webp.ts";
import { state } from "../../state/state.ts";
import {
  exportSplitAnimations,
  exportSplitItemSheets,
  exportSplitItemAnimations,
  exportIndividualFrames,
} from "../../state/zip.ts";
import { showToast, requestConfirmation } from "../../state/notifications.ts";
import { estimateTweenExportFrames } from "../../state/tween-settings.ts";
import { requireFeature } from "../../state/feature-gates.ts";

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

type WizardAttrs = {
  close: () => void;
};

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function zipFileExtension(summary: ExportSummary): string {
  const ext = summary.enginePreset ? summary.enginePreset : "character";
  return `${ext}_animations.zip`;
}

async function runExport(targetId: ExportTargetId): Promise<void> {
  if (targetId === "gif-preview" || targetId === "webp-preview") {
    if (!requireFeature("animation-export")) return;
  } else if (targetId.startsWith("zip-")) {
    if (!requireFeature("zip-export")) return;
  } else if (!requireFeature("engine-presets")) {
    return;
  }

  if (!window.canvasRenderer) {
    showToast("Canvas renderer is not ready yet.", { kind: "warning" });
    return;
  }

  // Estimate and warn for large exports
  const estimate = estimateTweenExportFrames();
  if (estimate.enabled && estimate.generatedTweenFrames >= 400) {
    const ok = await requestConfirmation({
      title: "Large tween export",
      message: `Current tween settings generate ~${estimate.generatedTweenFrames} tween frames (${estimate.totalFrames} total). Continue?`,
      confirmLabel: "Export",
    });
    if (!ok) return;
  }

  try {
    switch (targetId) {
      case "gif-preview":
        await downloadPreviewAnimationGif(
          state.selectedAnimation,
          state.bodyType,
        );
        showToast("Animated GIF exported.", { kind: "success" });
        break;

      case "webp-preview":
        await downloadPreviewAnimationWebp(
          state.selectedAnimation,
          state.bodyType,
        );
        showToast("Animated WebP exported.", { kind: "success" });
        break;

      case "zip-split-animation":
        await exportSplitAnimations();
        showToast("ZIP: Split by animation exported.", { kind: "success" });
        break;

      case "zip-split-item":
        await exportSplitItemSheets();
        showToast("ZIP: Split by item exported.", { kind: "success" });
        break;

      case "zip-split-animation-item":
        await exportSplitItemAnimations();
        showToast("ZIP: Split by animation and item exported.", {
          kind: "success",
        });
        break;

      case "zip-individual-frames":
        await exportIndividualFrames();
        showToast("ZIP: Individual frames exported.", { kind: "success" });
        break;

      default:
        showToast(`Export "${targetId}" not handled by wizard.`, {
          kind: "warning",
        });
    }
  } catch (err) {
    console.error("Export failed:", err);
    showToast(`Export failed: ${(err as Error).message}`, { kind: "error" });
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Wizard component
// ────────────────────────────────────────────────────────────────────────────

type WizardState = {
  wizardState: ExportWizardState;
};

export const ExportWizard: m.Component<WizardAttrs, WizardState> = {
  oninit(vnode) {
    vnode.state.wizardState = createDefaultWizardState();
  },
  view(vnode) {
    const close = vnode.attrs.close;

    // Local wizard state stored in vnode.state
    const wizardState: ExportWizardState =
      vnode.state.wizardState || createDefaultWizardState();

    // ── Step 1: Choose engine / target workflow ──────────────────────────

    const engineStep = m("div.field", [
      m("label.label", "Target workflow"),
      m("div.buttons", [
        ...ENGINE_GUIDANCE.map((guidance: EngineGuidance) =>
          m(
            "button.button.is-small",
            {
              class:
                wizardState.selectedEngine === guidance.engine
                  ? "is-info is-selected"
                  : "",
              onclick: () => {
                wizardState.selectedEngine = guidance.engine;
                wizardState.selectedExport = guidance.preferredExport;
              },
            },
            guidance.label,
          ),
        ),
        m(
          "button.button.is-small",
          {
            class:
              wizardState.selectedEngine === null && !wizardState.selectedExport
                ? "is-info is-selected"
                : "",
            onclick: () => {
              wizardState.selectedEngine = null;
              wizardState.selectedExport = null;
            },
          },
          "Custom",
        ),
      ]),
    ]);

    // Engine guidance description
    const engineGuidanceInfo = wizardState.selectedEngine
      ? getEngineGuidance(wizardState.selectedEngine)
      : null;

    const engineHint = engineGuidanceInfo
      ? m("div.message.is-info.is-small", [
          m("div.message-body", [
            m("p", engineGuidanceInfo.description),
            m(
              "ul.mt-1",
              engineGuidanceInfo.notes.map((note: string) =>
                m("li.is-size-7", note),
              ),
            ),
          ]),
        ])
      : null;

    // ── Step 2: Choose export format ────────────────────────────────────

    const formatStep = m("div.field", [
      m("label.label", "Export format"),
      m("div.buttons", [
        ...EXPORT_OPTIONS.filter(
          (opt) =>
            opt.kind === "animation" ||
            opt.kind === "image" ||
            opt.kind === "zip",
        ).map((opt) =>
          m(
            "button.button.is-small",
            {
              class:
                wizardState.selectedExport === opt.id
                  ? "is-primary is-selected"
                  : "",
              onclick: () => {
                wizardState.selectedExport = opt.id;
              },
            },
            opt.label,
          ),
        ),
      ]),
    ]);

    // ── Step 3: Export summary ──────────────────────────────────────────

    let summary: ExportSummary | null = null;
    if (wizardState.selectedExport) {
      summary = buildExportSummary(
        wizardState.selectedExport,
        wizardState.selectedEngine || undefined,
      );
    }

    const summarySection = summary
      ? m("div.box.is-small", [
          m("h6.title.is-6", summary.title),
          m(
            "p.is-size-7",
            [
              `Format: ${summary.format}`,
              summary.includesTweenFrames ? " (includes tween frames)" : "",
            ]
              .filter(Boolean)
              .join(" "),
          ),
          m(
            "p.is-size-7",
            [
              `~${summary.sourceFrames} source frames`,
              summary.generatedTweenFrames > 0
                ? `, ~${summary.generatedTweenFrames} tween frames`
                : "",
              `, ~${summary.totalFrames} total`,
              ` @ ${summary.fps} FPS`,
            ]
              .filter(Boolean)
              .join(""),
          ),

          // File tree preview
          summary.fileTree.length > 0
            ? m(
                "div.file-tree.mt-2",
                {
                  style: {
                    fontFamily: "monospace",
                    fontSize: "0.75rem",
                    lineHeight: "1.4",
                    background: "var(--bulma-scheme-main-bis, #f5f5f5)",
                    padding: "0.5rem",
                    borderRadius: "4px",
                    overflowX: "auto",
                  },
                },
                summary.fileTree.map((item) =>
                  m(
                    "div",
                    {
                      style: {
                        paddingLeft: `${(item.indent || 0) * 1.2}rem`,
                        whiteSpace: "nowrap",
                      },
                    },
                    item.label,
                  ),
                ),
              )
            : null,

          // Warnings
          summary.warnings.length > 0
            ? m(
                "div.mt-2",
                summary.warnings.map((w: string) =>
                  m("p.is-size-7.has-text-warning-dark", [
                    m("span.is-size-7", "⚠ "),
                    w,
                  ]),
                ),
              )
            : null,

          // Export button
          m("div.mt-3", [
            m(
              "button.button.is-primary",
              {
                disabled: !wizardState.selectedExport,
                onclick: async () => {
                  if (wizardState.selectedExport) {
                    await runExport(wizardState.selectedExport);
                    close();
                  }
                },
              },
              "Export",
            ),
            m(
              "span.is-size-7.ml-2",
              {
                style: { color: "var(--bulma-text-light, #999)" },
              },
              zipFileExtension(summary),
            ),
          ]),
        ])
      : null;

    // ── Modal shell ─────────────────────────────────────────────────────

    return m("div.modal.is-active", [
      m("div.modal-background", { onclick: close }),
      m("div.modal-content", { style: { maxWidth: "520px" } }, [
        m("div.box", [
          m("h4.title.is-4", "Export Wizard"),
          engineStep,
          engineHint,
          formatStep,
          summarySection,
          m("div.mt-3", [
            m("button.button.is-small", { onclick: close }, "Cancel"),
          ]),
        ]),
      ]),
      m("button.modal-close.is-large", {
        "aria-label": "close",
        onclick: close,
      }),
    ]);
  },
};
