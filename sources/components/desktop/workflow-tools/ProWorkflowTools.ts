import m from "mithril";
import { downloadFile } from "../../../canvas/download.ts";
import type { WorkflowToolsState } from "./types.ts";
import {
  buildExportReadinessChecks,
  characterPresets,
  persistProSettings,
  readinessScore,
} from "./workflow-helpers.ts";

type ProWorkflowToolsAttrs = {
  enabled: boolean;
  panelState: WorkflowToolsState;
  warnings: string[];
  layers: string[];
};

export const ProWorkflowTools: m.Component<ProWorkflowToolsAttrs> = {
  view(vnode) {
    const panelState = vnode.attrs.panelState;
    if (!vnode.attrs.enabled) {
      return m("div.workflow-tier", [
        m("h4", "Pro"),
        m(
          "p.studio-empty",
          "Palette presets, naming templates, alignment presets, layer inspection, and animation checks unlock in Pro.",
        ),
      ]);
    }

    const readinessChecks = buildExportReadinessChecks();
    const score = readinessScore(readinessChecks);

    return m("div.workflow-tier", [
      m("h4", "Pro"),
      m("div.workflow-readiness", [
        m("div.workflow-readiness-header", [
          m("strong", "Export Readiness"),
          m("span.studio-panel-pill", `${score}%`),
        ]),
        readinessChecks.map((check) =>
          m("div.workflow-check", { class: `workflow-check-${check.status}` }, [
            m("span.workflow-check-dot"),
            m("div", [m("strong", check.label), m("p", check.detail)]),
          ]),
        ),
      ]),
      m("div.workflow-card-grid", [
        characterPresets
          .filter((preset) => preset.plan === "Pro")
          .map((preset) =>
            m("article.workflow-mini-card", { key: preset.name }, [
              m("strong", preset.name),
              m("span", preset.role),
              m("p", preset.description),
              m("div.workflow-chip-row", [
                preset.tags.map((tag) => m("span.workflow-chip", tag)),
              ]),
            ]),
          ),
      ]),
      m("div.studio-field-grid", [
        m("input.input.is-small", {
          value: panelState.paletteName,
          title: "Palette preset name",
          oninput: (event: Event) => {
            panelState.paletteName = (event.target as HTMLInputElement).value;
            persistProSettings(panelState);
          },
        }),
        m("input.input.is-small", {
          value: panelState.alignmentPreset,
          title: "Custom import alignment preset",
          oninput: (event: Event) => {
            panelState.alignmentPreset = (
              event.target as HTMLInputElement
            ).value;
            persistProSettings(panelState);
          },
        }),
      ]),
      m("input.input.is-small", {
        value: panelState.namingTemplate,
        title: "Export naming template",
        oninput: (event: Event) => {
          panelState.namingTemplate = (event.target as HTMLInputElement).value;
          persistProSettings(panelState);
        },
      }),
      m("textarea.textarea.is-small", {
        rows: 2,
        value: panelState.styleGuide,
        title: "Shared style guide",
        oninput: (event: Event) => {
          panelState.styleGuide = (event.target as HTMLTextAreaElement).value;
          persistProSettings(panelState);
        },
      }),
      m("div.studio-project-actions", [
        m(
          "button.button.is-small",
          {
            type: "button",
            onclick: () => {
              downloadFile(
                [
                  "# Pro Workflow Presets",
                  `Palette: ${panelState.paletteName}`,
                  `Alignment: ${panelState.alignmentPreset}`,
                  `Naming: ${panelState.namingTemplate}`,
                  `Style guide: ${panelState.styleGuide}`,
                ].join("\n"),
                "pro-workflow-presets.md",
                "text/markdown",
              );
            },
          },
          "Export Presets",
        ),
      ]),
      m("p.studio-empty", [
        `Animation warnings: ${vnode.attrs.warnings.length}`,
        vnode.attrs.warnings.length > 0
          ? ` - ${vnode.attrs.warnings.slice(0, 2).join("; ")}`
          : "",
      ]),
      m(
        "p.studio-empty",
        `Layer inspector: ${vnode.attrs.layers.slice(0, 5).join(" | ")}`,
      ),
    ]);
  },
};
