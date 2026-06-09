// Part editor toolbar: custom part name, tool buttons, palette, undo/redo, auto-propagate
import m from "mithril";
import { state } from "../../../../state/state.ts";
import type { PartEditorState } from "../types.ts";
import { QUICK_COLORS } from "../types.ts";
import { undo, redo, resetCanvases } from "../history.ts";
import { saveCustomPartFromEditor } from "../save-custom-part.ts";
import { showToast } from "../../../../state/notifications.ts";

export function renderNameField(stateObj: PartEditorState): m.Children {
  return m("div.field.mb-2", [
    m("label.label.is-small", "Custom Part Name"),
    m("input.input.is-small", {
      type: "text",
      title: "Custom part name",
      placeholder: "Enter a name for this custom part...",
      value: stateObj.name,
      oninput: (e: Event) => {
        stateObj.name = (e.target as HTMLInputElement).value;
      },
    }),
  ]);
}

export function renderToolButtons(stateObj: PartEditorState): m.Children {
  return m("div.part-editor-toolbar.mb-2", [
    m(
      "span",
      {
        style: {
          fontSize: "9px",
          color: "var(--text-muted)",
          marginRight: "2px",
          textTransform: "uppercase",
          letterSpacing: "0.8px",
          fontWeight: "600",
        },
      },
      "Tools:",
    ),
    m(
      "button.button.is-small",
      {
        class: stateObj.tool === "pen" ? "is-active" : "",
        onclick: () => (stateObj.tool = "pen"),
        title: "Pencil tool (B or P). Hold Shift for a straight line.",
      },
      "✏️",
    ),
    m(
      "button.button.is-small",
      {
        class: stateObj.tool === "eraser" ? "is-active" : "",
        onclick: () => (stateObj.tool = "eraser"),
        title: "Eraser tool (E)",
      },
      "🧹",
    ),
    m(
      "button.button.is-small",
      {
        class: stateObj.tool === "picker" ? "is-active" : "",
        onclick: () => (stateObj.tool = "picker"),
        title: "Eyedropper tool (I). Hold Alt while drawing to sample.",
      },
      "💉",
    ),
    stateObj.isFullscreen
      ? m(
          "button.button.is-small",
          {
            class: stateObj.tool === "select" ? "is-active" : "",
            onclick: () => (stateObj.tool = "select"),
            title:
              "Rectangular selection (M). Drag to select; drag inside to move.",
          },
          "▧",
        )
      : null,
    stateObj.isFullscreen
      ? m(
          "button.button.is-small",
          {
            class: stateObj.tool === "line" ? "is-active" : "",
            onclick: () => (stateObj.tool = "line"),
            title: "Line tool (L). Drag to draw a straight segment.",
          },
          "╱",
        )
      : null,
    stateObj.isFullscreen
      ? m(
          "button.button.is-small",
          {
            class: stateObj.tool === "rect" ? "is-active" : "",
            onclick: () => (stateObj.tool = "rect"),
            title: "Rectangle tool (R). Toggle Fill in pro tools.",
          },
          "□",
        )
      : null,
    stateObj.isFullscreen
      ? m(
          "button.button.is-small",
          {
            class: stateObj.tool === "ellipse" ? "is-active" : "",
            onclick: () => (stateObj.tool = "ellipse"),
            title: "Ellipse tool (O). Toggle Fill in pro tools.",
          },
          "○",
        )
      : null,
    stateObj.isFullscreen
      ? m(
          "button.button.is-small",
          {
            class: stateObj.tool === "fill" ? "is-active" : "",
            onclick: () => (stateObj.tool = "fill"),
            title: "Flood fill tool (G)",
          },
          "▣",
        )
      : null,
    m("input.part-editor-color-picker", {
      type: "color",
      value: stateObj.activeColor,
      title: "Active color",
      oninput: (e: Event) => {
        stateObj.activeColor = (e.target as HTMLInputElement).value;
      },
    }),
    m("div", { style: { flex: "1" } }),
    m(
      "button.button.is-small",
      {
        onclick: () => {
          undo(stateObj);
          showToast("Undid editor change.", { kind: "info" });
        },
        disabled: stateObj.historyIndex <= 0,
        title: "Undo last stroke (Ctrl+Z)",
      },
      "↩",
    ),
    m(
      "button.button.is-small",
      {
        onclick: () => {
          redo(stateObj);
          showToast("Redid editor change.", { kind: "info" });
        },
        disabled: stateObj.historyIndex >= stateObj.history.length - 1,
        title: "Redo edit (Ctrl+Y or Ctrl+Shift+Z)",
      },
      "↪",
    ),
    m(
      "button.button.is-small",
      {
        onclick: () => {
          resetCanvases(stateObj);
          showToast("Editor canvas reset.", { kind: "warning" });
        },
        title: "Reset all directions to original sprite",
      },
      "🗑",
    ),
  ]);
}

export function renderQuickPalette(stateObj: PartEditorState): m.Children {
  return m(
    "div.part-editor-palette.mb-2",
    QUICK_COLORS.map((color) =>
      m("div.part-editor-swatch", {
        key: color,
        style: { backgroundColor: color },
        class: stateObj.activeColor === color ? "active" : "",
        title: `Use ${color}`,
        onclick: () => {
          stateObj.activeColor = color;
          stateObj.tool = "pen";
        },
      }),
    ),
  );
}

export function renderAutoPropagate(stateObj: PartEditorState): m.Children {
  return m("div.part-editor-propagate-container.mb-2", [
    m(
      "label.checkbox.is-small.part-editor-propagate-label",
      {
        title: "Copy front-view edits to side and back views",
      },
      [
        m("input", {
          type: "checkbox",
          checked: stateObj.autoPropagate,
          onchange: (e: Event) => {
            stateObj.autoPropagate = (e.target as HTMLInputElement).checked;
            showToast(
              stateObj.autoPropagate
                ? "Auto-propagate enabled."
                : "Auto-propagate disabled.",
              { kind: "success" },
            );
          },
        }),
        " Auto-propagate front view to sides & back",
      ],
    ),
  ]);
}

export function renderSaveButton(stateObj: PartEditorState): m.Children {
  return m(
    "button.button.is-primary.is-fullwidth",
    {
      onclick: async () => {
        const slotLabel = state.editingPart?.slotLabel ?? "custom-part";
        await saveCustomPartFromEditor(stateObj, slotLabel);
      },
      title:
        "Save your edits as a brand new custom part and add it to the character",
    },
    "💾 Save as New Custom Part",
  );
}

export function renderMainTools(stateObj: PartEditorState): m.Children {
  return m("div.part-editor-main-tools", [
    renderNameField(stateObj),
    renderToolButtons(stateObj),
    renderQuickPalette(stateObj),
    renderAutoPropagate(stateObj),
    renderSaveButton(stateObj),
  ]);
}
