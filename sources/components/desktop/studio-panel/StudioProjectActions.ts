import m from "mithril";
import { downloadFile } from "../../../canvas/download.ts";
import { requireFeature } from "../../../state/feature-gates.ts";
import { showToast } from "../../../state/notifications.ts";
import {
  exportStudioProjectLibrary,
  importStudioProjectLibrary,
  type StudioProject,
} from "../../../state/studio-projects.ts";
import { creditsToCsv, creditsToTxt } from "../../../utils/credits.ts";
import type { StudioPanelState } from "./types.ts";
import { exportHandoffZip, exportPngZip } from "./studio-exports.ts";
import { buildCombinedCredits, buildStudioReport } from "./studio-report.ts";
import { readFile, refreshProjects } from "./studio-utils.ts";

type StudioProjectActionsAttrs = {
  panelState: StudioPanelState;
  visibleProjects: StudioProject[];
};

export const StudioProjectActions: m.Component<StudioProjectActionsAttrs> = {
  view(vnode) {
    const panelState = vnode.attrs.panelState;
    const visibleProjects = vnode.attrs.visibleProjects;
    const hasProjects = panelState.projects.length > 0;
    const hasVisibleProjects = visibleProjects.length > 0;

    return m("div.studio-project-actions", [
      m(
        "button.button.is-small",
        {
          type: "button",
          disabled: !hasProjects,
          onclick: () => {
            downloadFile(
              exportStudioProjectLibrary(),
              "lpc-studio-projects.json",
              "application/json",
            );
          },
        },
        "Export Library",
      ),
      m("label.button.is-small.studio-import-button", [
        "Import",
        m("input", {
          type: "file",
          accept: "application/json,.json",
          onchange: async (event: Event) => {
            if (!requireFeature("studio-tools")) return;
            const input = event.target as HTMLInputElement;
            const file = input.files?.[0];
            if (!file) return;

            try {
              const importedCount = importStudioProjectLibrary(
                await readFile(file),
              );
              refreshProjects(panelState);
              showToast(`Imported ${importedCount} Studio project(s).`, {
                kind: importedCount > 0 ? "success" : "warning",
              });
            } catch (err) {
              showToast(
                err instanceof Error
                  ? err.message
                  : "Studio library import failed.",
                { kind: "error" },
              );
            } finally {
              input.value = "";
            }
          },
        }),
      ]),
      m(
        "button.button.is-small",
        {
          type: "button",
          disabled: !hasVisibleProjects || panelState.isExporting,
          onclick: async () => {
            if (!requireFeature("studio-tools")) return;
            panelState.isExporting = true;
            try {
              await exportHandoffZip(visibleProjects);
              showToast("Studio handoff ZIP exported.", { kind: "success" });
            } catch (err) {
              showToast(
                err instanceof Error
                  ? err.message
                  : "Studio handoff export failed.",
                { kind: "error" },
              );
            } finally {
              panelState.isExporting = false;
              m.redraw();
            }
          },
        },
        panelState.isExporting ? "Exporting..." : "Handoff ZIP",
      ),
      m(
        "button.button.is-small",
        {
          type: "button",
          disabled: !hasVisibleProjects || panelState.isExporting,
          onclick: async () => {
            if (!requireFeature("studio-tools")) return;
            panelState.isExporting = true;
            try {
              await exportPngZip(visibleProjects);
              showToast("Studio PNG ZIP exported.", { kind: "success" });
            } catch (err) {
              showToast(
                err instanceof Error ? err.message : "PNG batch export failed.",
                { kind: "error" },
              );
            } finally {
              panelState.isExporting = false;
              m.redraw();
            }
          },
        },
        "PNG ZIP",
      ),
      m(
        "button.button.is-small",
        {
          type: "button",
          disabled: !hasVisibleProjects,
          onclick: () => {
            const credits = buildCombinedCredits(visibleProjects);
            downloadFile(creditsToTxt(credits), "studio-credits.txt");
            downloadFile(
              creditsToCsv(credits),
              "studio-credits.csv",
              "text/csv",
            );
          },
        },
        "Credits",
      ),
      m(
        "button.button.is-small",
        {
          type: "button",
          disabled: !hasVisibleProjects,
          onclick: () => {
            downloadFile(
              buildStudioReport(visibleProjects),
              "studio-qa-report.md",
              "text/markdown",
            );
          },
        },
        "QA Report",
      ),
    ]);
  },
};
