import m from "mithril";
import { state } from "../../state/state.ts";
import {
  APP_ASSET_POLICY,
  APP_CHANGELOG,
  APP_NAME,
  APP_PACKAGING_NOTES,
  APP_VERSION,
} from "../../state/app-metadata.ts";

export const AboutModal: m.Component = {
  view() {
    if (!state.showAbout) return null;

    const close = () => {
      state.showAbout = false;
    };

    return m("div.about-overlay", { onclick: close }, [
      m(
        "div.about-modal",
        {
          role: "dialog",
          "aria-modal": "true",
          "aria-label": "About LPC Character Generator",
          onclick: (event: MouseEvent) => event.stopPropagation(),
        },
        [
          m("div.about-header", [
            m("div", [
              m("span.studio-panel-pill", `Version ${APP_VERSION}`),
              m("h2", APP_NAME),
            ]),
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
            "A desktop-style LPC sprite creator for building, editing, validating, and exporting game-ready character spritesheets.",
          ),
          m("div.about-grid", [
            renderSection("What Changed", APP_CHANGELOG),
            renderSection("Asset Policy", APP_ASSET_POLICY),
            renderSection("Packaging Notes", APP_PACKAGING_NOTES),
            renderSection("Product Modes", [
              "Free: full asset library, basic creator, credits, JSON, and PNG export.",
              "Pro: advanced editor, imports, ZIP/batch exports, animation exports, and engine presets.",
              "Studio: project libraries, thumbnails, reports, contact sheets, and production handoff workflows.",
            ]),
          ]),
          m("div.about-footer", [
            m(
              "span",
              "Credits and license information are part of the app workflow so exported characters can be attributed correctly.",
            ),
            m(
              "button.button.is-small.is-light",
              {
                type: "button",
                onclick: close,
              },
              "Close",
            ),
          ]),
        ],
      ),
    ]);
  },
};

function renderSection(title: string, items: readonly string[]): m.Children {
  return m("article.about-section", [
    m("h3", title),
    m(
      "ul",
      items.map((item) => m("li", item)),
    ),
  ]);
}
