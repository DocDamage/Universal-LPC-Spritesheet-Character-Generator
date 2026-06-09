import m from "mithril";
import type { PartEditorState } from "../types.ts";
import {
  clampBrushSize,
  MAX_BRUSH_SIZE,
  MIN_BRUSH_SIZE,
} from "../../pixel-editor-tools.ts";
import { getActiveLayer } from "../layers.ts";
import {
  getVisiblePaletteColors,
  replaceColorOnActiveLayer,
  parsePaletteFile,
} from "../color.ts";
import { transformActivePixels } from "../transform.ts";
import { DEFAULT_EDITOR_ZOOM } from "../types.ts";
import { renderLayersSection } from "./layers-section.ts";

/* ------------------------------------------------------------------ */
/*  Brush section – size slider + fill toggle                         */
/* ------------------------------------------------------------------ */
function renderBrushSection(stateObj: PartEditorState): m.Children {
  return m("div.part-editor-pro-section", [
    m("h4", "Brush"),
    m("label.part-editor-pro-field", [
      m("span", "Size"),
      m("input", {
        type: "range",
        min: String(MIN_BRUSH_SIZE),
        max: String(MAX_BRUSH_SIZE),
        step: "1",
        value: String(stateObj.brushSize),
        title: "Brush size ([ or ])",
        oninput: (e: Event) => {
          stateObj.brushSize = clampBrushSize(
            Number((e.target as HTMLInputElement).value),
          );
        },
      }),
      m("b", `${stateObj.brushSize}px`),
    ]),
    m(
      "label.part-editor-pro-toggle",
      {
        title: "Fill rectangle and ellipse tools",
      },
      [
        m("input", {
          type: "checkbox",
          checked: stateObj.shapeFilled,
          onchange: (e: Event) => {
            stateObj.shapeFilled = (e.target as HTMLInputElement).checked;
          },
        }),
        "Fill shapes",
      ],
    ),
  ]);
}

/* ------------------------------------------------------------------ */
/*  Color section – swatches, palette upload, replace                  */
/* ------------------------------------------------------------------ */
function renderColorSection(stateObj: PartEditorState): m.Children {
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

/* ------------------------------------------------------------------ */
/*  Uploaded / custom swatches (sub‑section of the color panel)       */
/* ------------------------------------------------------------------ */
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

/* ------------------------------------------------------------------ */
/*  Transform section – flip / rotate / clear                         */
/* ------------------------------------------------------------------ */
function renderTransformSection(stateObj: PartEditorState): m.Children {
  const activeLayer = getActiveLayer(stateObj);
  const activeLayerLocked = activeLayer?.locked ?? false;

  return m("div.part-editor-pro-section.part-editor-transform-section", [
    m("h4", "Transform"),

    m(
      "label.part-editor-pro-toggle",
      {
        title: "Apply transforms to every direction",
      },
      [
        m("input", {
          type: "checkbox",
          checked: stateObj.transformAllDirections,
          onchange: (e: Event) => {
            stateObj.transformAllDirections = (
              e.target as HTMLInputElement
            ).checked;
          },
        }),
        "All dirs",
      ],
    ),

    m("div.part-editor-transform-actions", [
      m(
        "button.part-editor-pro-button",
        {
          type: "button",
          title: "Flip selection or active layer horizontally (H)",
          disabled: activeLayerLocked,
          onclick: () => transformActivePixels(stateObj, "flipHorizontal"),
        },
        "Flip H",
      ),

      m(
        "button.part-editor-pro-button",
        {
          type: "button",
          title: "Flip selection or active layer vertically (V)",
          disabled: activeLayerLocked,
          onclick: () => transformActivePixels(stateObj, "flipVertical"),
        },
        "Flip V",
      ),

      m(
        "button.part-editor-pro-button",
        {
          type: "button",
          title: "Rotate selection or active layer clockwise (T)",
          disabled: activeLayerLocked,
          onclick: () => transformActivePixels(stateObj, "rotateClockwise"),
        },
        "Rot CW",
      ),

      m(
        "button.part-editor-pro-button",
        {
          type: "button",
          title: "Rotate selection or active layer counterclockwise (Shift+T)",
          disabled: activeLayerLocked,
          onclick: () =>
            transformActivePixels(stateObj, "rotateCounterClockwise"),
        },
        "Rot CCW",
      ),

      m(
        "button.part-editor-pro-button.part-editor-transform-clear",
        {
          type: "button",
          title: "Clear selection or active layer",
          disabled: activeLayerLocked,
          onclick: () => transformActivePixels(stateObj, "clear"),
        },
        "Clear",
      ),
    ]),
  ]);
}

/* ------------------------------------------------------------------ */
/*  Symmetry section – Mirror X / Mirror Y                            */
/* ------------------------------------------------------------------ */
function renderSymmetrySection(stateObj: PartEditorState): m.Children {
  return m("div.part-editor-pro-section", [
    m("h4", "Symmetry"),

    m(
      "label.part-editor-pro-toggle",
      {
        title: "Mirror strokes across the horizontal axis (X)",
      },
      [
        m("input", {
          type: "checkbox",
          checked: stateObj.mirrorX,
          onchange: (e: Event) => {
            stateObj.mirrorX = (e.target as HTMLInputElement).checked;
          },
        }),
        "Mirror X",
      ],
    ),

    m(
      "label.part-editor-pro-toggle",
      {
        title: "Mirror strokes across the vertical axis (Y)",
      },
      [
        m("input", {
          type: "checkbox",
          checked: stateObj.mirrorY,
          onchange: (e: Event) => {
            stateObj.mirrorY = (e.target as HTMLInputElement).checked;
          },
        }),
        "Mirror Y",
      ],
    ),
  ]);
}

/* ------------------------------------------------------------------ */
/*  View section – pixel grid, zoom reset                             */
/* ------------------------------------------------------------------ */
function renderViewSection(stateObj: PartEditorState): m.Children {
  return m("div.part-editor-pro-section", [
    m("h4", "View"),

    m(
      "label.part-editor-pro-toggle",
      {
        title: "Toggle pixel grid",
      },
      [
        m("input", {
          type: "checkbox",
          checked: stateObj.showGrid,
          onchange: (e: Event) => {
            stateObj.showGrid = (e.target as HTMLInputElement).checked;
          },
        }),
        "Pixel Grid",
      ],
    ),

    m(
      "button.part-editor-pro-button",
      {
        type: "button",
        title: "Reset editor zoom (Ctrl+0)",
        onclick: () => {
          stateObj.zoom = DEFAULT_EDITOR_ZOOM;
        },
      },
      "Reset Zoom",
    ),
  ]);
}

/* ------------------------------------------------------------------ */
/*  Reference Underlay section – image upload & opacity               */
/* ------------------------------------------------------------------ */
function renderReferenceUnderlaySection(stateObj: PartEditorState): m.Children {
  return m("div.part-editor-pro-section", [
    m("h4", "Reference Underlay"),

    m(
      "div",
      { style: { display: "flex", flexDirection: "column", gap: "8px" } },
      [
        m(
          "label",
          { style: { display: "flex", gap: "8px", alignItems: "center" } },
          [
            m(
              "span",
              { style: { fontSize: "11px", color: "var(--text-muted)" } },
              "Opacity",
            ),
            m("input", {
              style: { flex: "1" },
              type: "range",
              min: "0",
              max: "100",
              step: "5",
              value: String(Math.round(stateObj.referenceOpacity * 100)),
              oninput: (e: Event) => {
                stateObj.referenceOpacity =
                  Number((e.target as HTMLInputElement).value) / 100;
              },
            }),
            m(
              "span",
              {
                style: {
                  fontSize: "11px",
                  color: "var(--text-muted)",
                  width: "30px",
                  textAlign: "right",
                },
              },
              `${Math.round(stateObj.referenceOpacity * 100)}%`,
            ),
          ],
        ),

        m("div", { style: { display: "flex", gap: "8px" } }, [
          renderReferenceUploadButton(stateObj),
          stateObj.referenceImageUrl
            ? m(
                "button.part-editor-pro-button",
                {
                  type: "button",
                  style: { padding: "0 10px" },
                  onclick: () => {
                    stateObj.referenceImageUrl = null;
                  },
                },
                "Clear",
              )
            : null,
        ]),
      ],
    ),
  ]);
}

/* ------------------------------------------------------------------ */
/*  Reference upload button                                           */
/* ------------------------------------------------------------------ */
function renderReferenceUploadButton(stateObj: PartEditorState): m.Children {
  return m(
    "label.part-editor-pro-button",
    {
      style: {
        flex: "1",
        textAlign: "center",
        lineHeight: "22px",
        cursor: "pointer",
        display: "block",
        background: "var(--bg-darkest)",
        border: "1px solid var(--border-subtle)",
        borderRadius: "var(--radius-sm)",
        fontSize: "11px",
        padding: "0 6px",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        overflow: "hidden",
      },
    },
    [
      "Upload Image",
      m("input", {
        type: "file",
        accept: "image/*",
        style: { display: "none" },
        onchange: (e: Event) => {
          const target = e.target as HTMLInputElement;
          if (target.files && target.files[0]) {
            const file = target.files[0];
            const reader = new FileReader();
            reader.onload = () => {
              stateObj.referenceImageUrl = reader.result as string;
              m.redraw();
            };
            reader.readAsDataURL(file);
          }
        },
      }),
    ],
  );
}

/* ================================================================== */
/*  Public entry point                                                */
/* ================================================================== */
export function renderSpriteEditorPanel(stateObj: PartEditorState): m.Children {
  return [
    renderBrushSection(stateObj),
    renderColorSection(stateObj),
    renderTransformSection(stateObj),
    renderLayersSection(stateObj),
    renderSymmetrySection(stateObj),
    renderViewSection(stateObj),
    renderReferenceUnderlaySection(stateObj),
  ];
}
