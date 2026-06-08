// Download component
import m from "mithril";
import { state } from "../../state/state.ts";
import { drawCalls } from "../../canvas/renderer.ts";
import {
  getAllCredits,
  creditsToCsv,
  creditsToTxt,
} from "../../utils/credits.ts";
import { CollapsibleSection } from "../CollapsibleSection.ts";
import { downloadFile, downloadAsPNG } from "../../canvas/download.ts";
import { downloadPreviewAnimationGif } from "../../canvas/preview-gif.ts";
import { downloadPreviewAnimationWebp } from "../../canvas/preview-webp.ts";
import {
  importStateFromJSON,
  exportStateAsJSON,
  serializeLayersForJson,
} from "../../state/json.ts";
import {
  exportSplitAnimations,
  exportSplitItemSheets,
  exportSplitItemAnimations,
  exportIndividualFrames,
} from "../../state/zip.ts";
import { debugLog } from "../../utils/debug.ts";
import type { CatalogReader } from "../../state/catalog.ts";
import { requestConfirmation, showToast } from "../../state/notifications.ts";
import { estimateTweenExportFrames } from "../../state/tween-settings.ts";
import { ExportWizard } from "./ExportWizard.ts";

const zipExportTitle = "Wait for layer data to finish loading";

type DownloadAttrs = {
  catalog: Pick<CatalogReader, "isLayersReady">;
};

type DownloadState = {
  showWizard: boolean;
};

function getTweenExportHint(): string | null {
  if (state.previewTweenMode === "off") {
    return null;
  }

  const inbetweenLabel =
    state.previewTweenInbetweens === 1 ? "in-between" : "in-betweens";
  return `Tween exports include ${state.previewTweenInbetweens} ${inbetweenLabel} per source frame at ${state.previewTweenFps} FPS. Split-by-animation ZIPs add tweened spritesheets under tweened/. Individual-frame ZIPs add tween PNGs beside source frames.`;
}

async function confirmLargeTweenExport(): Promise<boolean> {
  const estimate = estimateTweenExportFrames();
  if (!estimate.enabled || estimate.generatedTweenFrames < 400) {
    return true;
  }

  return requestConfirmation({
    title: "Large tween export",
    message: `Current tween settings will generate about ${estimate.generatedTweenFrames} tween frames (${estimate.totalFrames} total frame PNGs for individual-frame export). Continue?`,
    confirmLabel: "Export",
  });
}

export const Download: m.Component<DownloadAttrs, DownloadState> = {
  oninit(vnode) {
    vnode.state.showWizard = false;
  },
  view(vnode) {
    const zipDisabled = !vnode.attrs.catalog.isLayersReady();
    const tweenExportHint = getTweenExportHint();

    const exportToClipboard = async (): Promise<void> => {
      if (!window.canvasRenderer) {
        showToast("Canvas renderer is not ready yet.", { kind: "warning" });
        return;
      }
      try {
        const json = exportStateAsJSON(
          state,
          serializeLayersForJson(drawCalls),
        );
        debugLog(json);
        await navigator.clipboard.writeText(json);
        showToast("Exported to clipboard!", { kind: "success" });
      } catch (err) {
        console.error("Failed to copy to clipboard:", err);
        showToast(
          "Failed to copy to clipboard. Please check browser permissions.",
          {
            kind: "error",
          },
        );
      }
    };

    const importFromClipboard = async (): Promise<void> => {
      if (!window.canvasRenderer) {
        showToast("Canvas renderer is not ready yet.", { kind: "warning" });
        return;
      }
      try {
        const json = await navigator.clipboard.readText();
        debugLog(json);
        const imported = importStateFromJSON(json);
        Object.assign(state, imported);

        m.redraw();
        showToast("Imported successfully!", { kind: "success" });
      } catch (err) {
        console.error("Failed to import from clipboard:", err);
        showToast(
          "Failed to import. Please check clipboard content and browser permissions.",
          { kind: "error" },
        );
      }
    };

    const saveAsPNG = () => {
      if (!window.canvasRenderer) {
        showToast("Canvas renderer is not ready yet.", { kind: "warning" });
        return;
      }
      downloadAsPNG("character-spritesheet.png");
    };

    const savePreviewGif = async () => {
      if (!window.canvasRenderer) {
        showToast("Canvas renderer is not ready yet.", { kind: "warning" });
        return;
      }
      try {
        await downloadPreviewAnimationGif();
        showToast("Animated GIF exported.", { kind: "success" });
      } catch (err) {
        console.error("Failed to export GIF:", err);
        showToast("Failed to export animated GIF.", { kind: "error" });
      }
    };

    const savePreviewWebp = async () => {
      if (!window.canvasRenderer) {
        showToast("Canvas renderer is not ready yet.", { kind: "warning" });
        return;
      }
      try {
        await downloadPreviewAnimationWebp();
        showToast("Animated WebP exported.", { kind: "success" });
      } catch (err) {
        console.error("Failed to export WebP:", err);
        showToast("Failed to export animated WebP.", { kind: "error" });
      }
    };

    return m(
      CollapsibleSection,
      {
        title: "Download",
        defaultOpen: true,
      },
      [
        vnode.state.showWizard
          ? m(ExportWizard, {
              close: () => {
                vnode.state.showWizard = false;
              },
            })
          : null,
        m("div.buttons.is-flex.is-flex-wrap-wrap", { id: "download-buttons" }, [
          m(
            "button.button.is-small.is-primary",
            { onclick: saveAsPNG },
            "Spritesheet (PNG)",
          ),
          m(
            "button.button.is-small.is-primary",
            { onclick: savePreviewGif },
            "Animation Preview (GIF)",
          ),
          m(
            "button.button.is-small.is-primary",
            { onclick: savePreviewWebp },
            "Animation Preview (WebP)",
          ),
          m(
            "button.button.is-small",
            {
              onclick: () => {
                const allCredits = getAllCredits(
                  state.selections,
                  state.bodyType,
                );
                const txtContent = creditsToTxt(allCredits);
                downloadFile(txtContent, "credits.txt", "text/plain");
              },
            },
            "Credits (TXT)",
          ),
          m(
            "button.button.is-small",
            {
              onclick: () => {
                const allCredits = getAllCredits(
                  state.selections,
                  state.bodyType,
                );
                const csvContent = creditsToCsv(allCredits);
                downloadFile(csvContent, "credits.csv", "text/csv");
              },
            },
            "Credits (CSV)",
          ),
          m(
            "button.button.is-small.is-info",
            {
              disabled: zipDisabled,
              title: zipDisabled ? zipExportTitle : undefined,
              onclick: async () => {
                if (await confirmLargeTweenExport()) {
                  await exportSplitAnimations();
                }
              },
            },
            "ZIP: Split by animation",
          ),
          state.zipByAnimation.isRunning ? m("span.loading") : null,
          m(
            "button.button.is-small.is-info",
            {
              disabled: zipDisabled,
              title: zipDisabled ? zipExportTitle : undefined,
              onclick: exportSplitItemSheets,
            },
            "ZIP: Split by item",
          ),
          state.zipByItem.isRunning ? m("span.loading") : null,
          m(
            "button.button.is-small.is-info",
            {
              disabled: zipDisabled,
              title: zipDisabled ? zipExportTitle : undefined,
              onclick: exportSplitItemAnimations,
            },
            "ZIP: Split by animation and item",
          ),
          state.zipByAnimationAndItem.isRunning ? m("span.loading") : null,
          m(
            "button.button.is-small.is-info",
            {
              disabled: zipDisabled,
              title: zipDisabled ? zipExportTitle : undefined,
              onclick: async () => {
                if (await confirmLargeTweenExport()) {
                  await exportIndividualFrames();
                }
              },
            },
            "ZIP: Split by animation and frame",
          ),
          state.zipIndividualFrames && state.zipIndividualFrames.isRunning
            ? m("span.loading")
            : null,
          tweenExportHint
            ? m(
                "span.tag.is-info.is-light",
                {
                  title: tweenExportHint,
                },
                "Tween frames enabled",
              )
            : null,
          m(
            "button.button.is-small.is-link",
            { onclick: exportToClipboard },
            "Export to Clipboard (JSON)",
          ),
          m(
            "button.button.is-small.is-link",
            { onclick: importFromClipboard },
            "Import from Clipboard (JSON)",
          ),
        ]),
        m("hr"),
        m(
          "button.button.is-medium.is-warning",
          {
            onclick: () => {
              vnode.state.showWizard = true;
            },
            style: { width: "100%" },
          },
          "Export Wizard",
        ),
      ],
    );
  },
};
