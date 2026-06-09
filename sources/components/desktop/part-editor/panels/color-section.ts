import m from "mithril";
import type { PartEditorState } from "../types.ts";
import { getActiveLayer } from "../layers.ts";
import {
  getVisiblePaletteColors,
  replaceColorOnActiveLayer,
  parsePaletteFile,
} from "../color.ts";

export function renderColorSection(stateObj: PartEditorState): m.Children {
  const paletteColors = getVisiblePaletteColors(stateObj);
  const activeLayer = getActiveLayer(stateObj);
  const activeLayerLocked = activeLayer?.locked ?? false;

  return m("div.part-editor-pro-section.part-editor-color-section", [
    /* ----- header row ----- */
    m(
      "div",
      {
        style: {
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "8px",
        },
      },
      [
        m("h4", { style: { margin: "0" } }, "Color"),
        m(
          "label",
          {
            style: {
              fontSize: "10px",
              color: "var(--accent-primary)",
              cursor: "pointer",
              background: "rgba(124, 109, 240, 0.15)",
              padding: "2px 6px",
              borderRadius: "var(--radius-sm)",
              border: "1px solid rgba(124, 109, 240, 0.3)",
            },
          },
          [
            "+ Palette",
            m("input", {
              type: "file",
              accept: ".gpl,.hex,.txt",
              style: { display: "none" },
              onchange: (e: Event) => {
                const target = e.target as HTMLInputElement;
                if (target.files && target.files[0]) {
                  const file = target.files[0];
                  const reader = new FileReader();
                  reader.onload = () => {
                    stateObj.uploadedPaletteColors = parsePaletteFile(
                      file.name,
                      reader.result as string,
                    );
                    m.redraw();
                  };
                  reader.readAsText(file);
                }
              },
            }),
          ],
        ),
      ],
    ),

    /* ----- extracted swatches ----- */
    m(
      "div",
      {
        style: {
          fontSize: "10px",
          color: "var(--text-muted)",
          marginBottom: "4px",
        },
      },
      "Extracted Swatches",
    ),

    m(
      "div.part-editor-extracted-palette",
      paletteColors.map((color) =>
        m("button.part-editor-palette-chip", {
          key: color,
          type: "button",
          style: { backgroundColor: color },
          class: stateObj.activeColor === color ? "active" : "",
          title: `Use ${color}`,
          onclick: () => {
            stateObj.activeColor = color;
          },
          ondblclick: () => {
            stateObj.replaceFromColor = color;
          },
        }),
      ),
    ),

    /* ----- uploaded / custom swatches ----- */
    renderUploadedPalette(stateObj),

    /* ----- replace-color controls ----- */
    m("div.part-editor-replace-grid", [
      m("label.part-editor-color-field", [
        m("span", "From"),
        m("input", {
          type: "color",
          value: stateObj.replaceFromColor,
          title: "Color to replace",
          oninput: (e: Event) => {
            stateObj.replaceFromColor = (e.target as HTMLInputElement).value;
          },
        }),
      ]),
      m("label.part-editor-color-field", [
        m("span", "To"),
        m("input", {
          type: "color",
          value: stateObj.replaceToColor,
          title: "Replacement color",
          oninput: (e: Event) => {
            stateObj.replaceToColor = (e.target as HTMLInputElement).value;
          },
        }),
      ]),
    ]),

    m("label.part-editor-pro-field", [
      m("span", "Tol"),
      m("input", {
        type: "range",
        min: "0",
        max: "96",
        step: "1",
        value: String(stateObj.replaceTolerance),
        title: "Color match tolerance",
        oninput: (e: Event) => {
          stateObj.replaceTolerance = Number(
            (e.target as HTMLInputElement).value,
          );
        },
      }),
      m("b", String(stateObj.replaceTolerance)),
    ]),

    m(
      "label.part-editor-pro-toggle",
      {
        title: "Replace matching colors in every direction",
      },
      [
        m("input", {
          type: "checkbox",
          checked: stateObj.replaceAllDirections,
          onchange: (e: Event) => {
            stateObj.replaceAllDirections = (
              e.target as HTMLInputElement
            ).checked;
          },
        }),
        "All dirs",
      ],
    ),

    m("div.part-editor-color-actions", [
      m(
        "button.part-editor-pro-button",
        {
          type: "button",
          title: "Use active brush color as replacement",
          onclick: () => {
            stateObj.replaceToColor = stateObj.activeColor;
          },
        },
        "Use",
      ),

      m(
        "button.part-editor-pro-button",
        {
          type: "button",
          title: "Swap source and replacement colors",
          onclick: () => {
            const from = stateObj.replaceFromColor;
            stateObj.replaceFromColor = stateObj.replaceToColor;
            stateObj.replaceToColor = from;
          },
        },
        "Swap",
      ),

      m(
        "button.part-editor-pro-button",
        {
          type: "button",
          title: "Replace color on active layer (Ctrl+Shift+R)",
          disabled: activeLayerLocked,
          onclick: () => replaceColorOnActiveLayer(stateObj),
        },
        "Apply",
      ),
    ]),
  ]);
}

function renderUploadedPalette(stateObj: PartEditorState): m.Children {
  if (!stateObj.uploadedPaletteColors) return null;

  return [
    m(
      "div",
      {
        style: {
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginTop: "12px",
          marginBottom: "4px",
        },
      },
      [
        m(
          "span",
          { style: { fontSize: "10px", color: "var(--text-muted)" } },
          "Custom Swatches",
        ),
        m(
          "button",
          {
            type: "button",
            style: {
              background: "transparent",
              border: "none",
              color: "#fb7185",
              fontSize: "10px",
              cursor: "pointer",
              padding: "0",
            },
            onclick: () => {
              stateObj.uploadedPaletteColors = null;
            },
          },
          "Clear",
        ),
      ],
    ),

    m(
      "div.part-editor-extracted-palette",
      {
        style: {
          maxHeight: "96px",
          overflowY: "auto",
          border: "1px solid var(--border-subtle)",
          padding: "4px",
          borderRadius: "var(--radius-sm)",
          display: "flex",
          flexWrap: "wrap",
          gap: "3px",
        },
      },
      stateObj.uploadedPaletteColors.map((color) =>
        m("button.part-editor-palette-chip", {
          key: `uploaded-${color}`,
          type: "button",
          style: {
            backgroundColor: color,
            flex: "0 0 16px",
            height: "16px",
            padding: "0",
          },
          class: stateObj.activeColor === color ? "active" : "",
          title: `Use ${color}`,
          onclick: () => {
            stateObj.activeColor = color;
          },
          ondblclick: () => {
            stateObj.replaceFromColor = color;
          },
        }),
      ),
    ),
  ];
}
