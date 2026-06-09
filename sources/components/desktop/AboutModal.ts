import m from "mithril";
import { state } from "../../state/state.ts";
import {
  APP_ASSET_POLICY,
  APP_CHANGELOG,
  APP_NAME,
  APP_PACKAGING_NOTES,
  APP_VERSION,
} from "../../state/app-metadata.ts";
import { BUILD_REQUIRES_LICENSE } from "../../state/build-config.ts";
import { getLicenseState, clearLicense } from "../../state/license-state.ts";

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
            BUILD_REQUIRES_LICENSE ? renderLicenseSection() : null,
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

function renderLicenseSection(): m.Children {
  const license = getLicenseState();
  let statusText = "No active license";
  let details: string[] = [];
  let showDeactivate = false;

  if (license.kind === "valid") {
    statusText = "Licensed (Active)";
    details = [
      `Edition: ${license.edition.toUpperCase()}`,
      `Expires: ${new Date(license.expiresAt).toLocaleDateString()}`,
      `Key Hash: ${license.downloadKeyHash.substring(0, 10)}...`,
    ];
    showDeactivate = true;
  } else if (license.kind === "offline-grace") {
    statusText = "Offline Grace Period";
    details = [
      `Edition: ${license.edition.toUpperCase()}`,
      `Expires: ${new Date(license.expiresAt).toLocaleDateString()} (Grace active)`,
    ];
    showDeactivate = true;
  } else if (license.kind === "invalid") {
    statusText = "Invalid License Key";
    details = [`Reason: ${license.reason}`];
  } else if (license.kind === "checking") {
    statusText = "Checking License...";
  } else if (license.kind === "required") {
    statusText = "Key Required";
    details = ["Please enter your itch.io key in the startup gate."];
  }

  return m("article.about-section", [
    m("h3", "License Information"),
    m("p", [
      m("strong", "Status: "),
      m("span.tag.is-info.is-small", statusText),
    ]),
    details.length > 0
      ? m(
          "ul.mt-2",
          details.map((item) => m("li", item)),
        )
      : null,
    showDeactivate
      ? m(
          "button.button.is-danger.is-small.mt-2",
          {
            type: "button",
            onclick: () => {
              clearLicense();
            },
          },
          "Deactivate License",
        )
      : null,
  ]);
}
