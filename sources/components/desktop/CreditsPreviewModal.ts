import m from "mithril";
import { state } from "../../state/state.ts";
import { getAllCredits, creditsToTxt, creditsToCsv } from "../../utils/credits.ts";
import { downloadFile } from "../../canvas/download.ts";
import { showToast } from "../../state/notifications.ts";

export const CreditsPreviewModal: m.Component = {
  view() {
    if (!state.showCreditsPreview) return null;

    const close = () => {
      state.showCreditsPreview = false;
    };

    const credits = getAllCredits(state.selections, state.bodyType);
    const textCredits = creditsToTxt(credits);

    return m("div.about-overlay", { onclick: close }, [
      m(
        "div.about-modal",
        {
          role: "dialog",
          "aria-modal": "true",
          "aria-label": "Asset Credits Preview",
          onclick: (event: MouseEvent) => event.stopPropagation(),
          style: { maxWidth: "600px", width: "90%" }
        },
        [
          m("div.about-header", [
            m("h2", "Asset Credits Preview"),
            m(
              "button.desktop-title-btn",
              {
                type: "button",
                title: "Close",
                onclick: close,
              },
              "x",
            ),
          ]),
          m(
            "p.about-copy",
            "These credits represent the selected artwork layers and their respective authors and licenses."
          ),
          m(
            "textarea.textarea.is-small",
            {
              rows: 15,
              readOnly: true,
              style: { fontFamily: "monospace", whiteSpace: "pre", backgroundColor: "#f8fafc", color: "#334155" }
            },
            textCredits || "No credits available for current selections."
          ),
          m("div.about-footer", { style: { marginTop: "12px", display: "flex", justifyContent: "space-between" } }, [
            m("div.buttons", [
              m(
                "button.button.is-small.is-primary",
                {
                  type: "button",
                  disabled: credits.length === 0,
                  onclick: () => {
                    navigator.clipboard.writeText(textCredits)
                      .then(() => showToast("Credits copied to clipboard.", { kind: "success" }))
                      .catch(() => showToast("Failed to copy credits.", { kind: "error" }));
                  }
                },
                "Copy to Clipboard"
              ),
              m(
                "button.button.is-small.is-info",
                {
                  type: "button",
                  disabled: credits.length === 0,
                  onclick: () => {
                    downloadFile(textCredits, "credits.txt", "text/plain");
                  }
                },
                "Download TXT"
              ),
              m(
                "button.button.is-small.is-info",
                {
                  type: "button",
                  disabled: credits.length === 0,
                  onclick: () => {
                    downloadFile(creditsToCsv(credits), "credits.csv", "text/csv");
                  }
                },
                "Download CSV"
              )
            ]),
            m(
              "button.button.is-small.is-light",
              {
                type: "button",
                onclick: close,
              },
              "Close"
            )
          ])
        ]
      )
    ]);
  }
};
