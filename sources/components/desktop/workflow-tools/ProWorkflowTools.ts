import m from "mithril";
import { downloadFile } from "../../../canvas/download.ts";
import type { WorkflowToolsState } from "./types.ts";
import { state } from "../../../state/state.ts";
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
      m("div.pro-layer-inspector", [
        m("div.pro-layer-header", [
          m("strong", "Layer Inspector"),
          m("label.checkbox.is-small", [
            m("input[type=checkbox]", {
              checked: state.excludeHiddenLayersFromExports,
              onchange: (e: Event) => {
                state.excludeHiddenLayersFromExports = (
                  e.target as HTMLInputElement
                ).checked;
              },
            }),
            " Exclude hidden layers from exports",
          ]),
        ]),
        m(
          "div.pro-layer-list",
          {
            style: {
              maxHeight: "180px",
              overflowY: "auto",
              border: "1px solid #ddd",
              padding: "4px",
              borderRadius: "4px",
              backgroundColor: "#fff",
            },
          },
          [
            Object.entries(state.selections).map(([slotKey, selection]) => {
              const isHidden = state.hiddenLayerIds.has(selection.itemId);
              return m(
                "div.pro-layer-row",
                {
                  key: selection.itemId,
                  style: {
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "2px 4px",
                    fontSize: "12px",
                    borderBottom: "1px solid #eee",
                  },
                },
                [
                  m("span", `${selection.name} (${slotKey})`),
                  m(
                    "button.button.is-small.is-light",
                    {
                      type: "button",
                      style: { padding: "0 6px", height: "20px" },
                      onclick: async () => {
                        if (isHidden) {
                          state.hiddenLayerIds.delete(selection.itemId);
                        } else {
                          state.hiddenLayerIds.add(selection.itemId);
                        }
                        const { triggerRender } =
                          await import("../../render-effect.ts");
                        await triggerRender();
                        m.redraw();
                      },
                    },
                    isHidden ? "👁‍🗨" : "👁",
                  ),
                ],
              );
            }),
          ],
        ),
      ]),
    ]);
  },
};
