import m from "mithril";
import type { PartEditorState } from "../types.ts";

export function renderReferenceUnderlaySection(stateObj: PartEditorState): m.Children {
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
