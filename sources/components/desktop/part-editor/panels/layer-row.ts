import m from "mithril";
import type { PartEditorState, EditorLayer } from "../types.ts";
import { recomposeCanvases, debouncedRecomposeCanvases } from "../canvas.ts";
import { saveHistory } from "../history.ts";
import { toggleLayerPixelLock, toggleLayerAlphaLock } from "../layers.ts";

export function renderLayerRowItem(
  stateObj: PartEditorState,
  layer: EditorLayer,
  displayCleanName: string,
  indent: boolean,
): m.Children {
  const layerNamePrefix =
    indent && layer.name.includes(":")
      ? `${layer.name.split(":").slice(0, -1).join(":")}: `
      : "";

  return m(
    "div.part-editor-layer-row",
    {
      key: layer.id,
      class: layer.id === stateObj.activeLayerId ? "active" : "",
      style: indent
        ? {
            marginLeft: "12px",
            borderLeft: "2px dashed var(--border-subtle)",
            paddingLeft: "8px",
          }
        : {},
      onclick: () => {
        stateObj.activeLayerId = layer.id;
      },
    },
    [
      m("div.part-editor-layer-main", [
        m(
          "button.part-editor-layer-control",
          {
            type: "button",
            title: layer.visible ? "Hide layer" : "Show layer",
            onclick: (e: MouseEvent) => {
              e.stopPropagation();
              layer.visible = !layer.visible;
              recomposeCanvases(stateObj);
              saveHistory(stateObj);
            },
          },
          layer.visible ? "On" : "Off",
        ),
        m(
          "button.part-editor-layer-control",
          {
            type: "button",
            title: layer.locked
              ? "Unlock layer pixels (/)"
              : "Lock layer pixels (/)",
            class: layer.locked ? "active" : "",
            onclick: (e: MouseEvent) => {
              e.stopPropagation();
              toggleLayerPixelLock(stateObj, layer);
            },
          },
          layer.locked ? "Lock" : "Edit",
        ),
        m(
          "button.part-editor-layer-control",
          {
            type: "button",
            title: layer.alphaLocked
              ? "Unlock transparent pixels (Shift+/)"
              : "Lock transparent pixels for recoloring (Shift+/)",
            class: layer.alphaLocked ? "active" : "",
            disabled: layer.locked,
            onclick: (e: MouseEvent) => {
              e.stopPropagation();
              toggleLayerAlphaLock(stateObj, layer);
            },
          },
          "A",
        ),
        m("input.part-editor-layer-name", {
          type: "text",
          value: displayCleanName,
          title:
            "Layer name (Format: 'Group: LayerName' to auto-nest in folders)",
          onclick: (e: MouseEvent) => e.stopPropagation(),
          oninput: (e: Event) => {
            const nextName = (e.target as HTMLInputElement).value || "Layer";
            layer.name = `${layerNamePrefix}${nextName}`;
          },
          onchange: () => saveHistory(stateObj),
        }),
        m(
          "span.part-editor-layer-opacity-value",
          `${Math.round(layer.opacity * 100)}%`,
        ),
      ]),
      m(
        "div.part-editor-layer-sub",
        { style: { display: "flex", gap: "8px", alignItems: "center" } },
        [
          m(
            "select.part-editor-layer-blend",
            {
              style: {
                flex: "0 0 100px",
                background: "var(--bg-darkest)",
                border: "1px solid var(--border-subtle)",
                borderRadius: "var(--radius-sm)",
                color: "var(--text-primary)",
                fontSize: "10px",
                padding: "2px 4px",
                height: "22px",
                cursor: "pointer",
              },
              value: layer.blendMode || "source-over",
              title: "Layer blend mode",
              onclick: (e: MouseEvent) => e.stopPropagation(),
              onchange: (e: Event) => {
                layer.blendMode = (e.target as HTMLSelectElement)
                  .value as GlobalCompositeOperation;
                recomposeCanvases(stateObj);
                saveHistory(stateObj);
              },
            },
            [
              m("option", { value: "source-over" }, "Normal"),
              m("option", { value: "multiply" }, "Multiply"),
              m("option", { value: "screen" }, "Screen"),
              m("option", { value: "overlay" }, "Overlay"),
              m("option", { value: "darken" }, "Darken"),
              m("option", { value: "lighten" }, "Lighten"),
              m("option", { value: "color-dodge" }, "Dodge"),
              m("option", { value: "color-burn" }, "Burn"),
              m("option", { value: "hard-light" }, "Hard Light"),
              m("option", { value: "soft-light" }, "Soft Light"),
              m("option", { value: "difference" }, "Difference"),
              m("option", { value: "exclusion" }, "Exclusion"),
            ],
          ),
          m("input.part-editor-layer-opacity", {
            style: { flex: "1", margin: "0" },
            type: "range",
            min: "0",
            max: "100",
            step: "1",
            value: String(Math.round(layer.opacity * 100)),
            title: "Layer opacity",
            onclick: (e: MouseEvent) => e.stopPropagation(),
            oninput: (e: Event) => {
              layer.opacity =
                Number((e.target as HTMLInputElement).value) / 100;
              debouncedRecomposeCanvases(stateObj);
            },
            onchange: () => saveHistory(stateObj),
          }),
        ],
      ),
    ],
  );
}
