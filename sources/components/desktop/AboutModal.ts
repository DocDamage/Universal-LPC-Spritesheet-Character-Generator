import m from "mithril";
import { state } from "../../state/state.ts";
import {
  APP_ASSET_POLICY,
  APP_CHANGELOG,
  APP_NAME,
  APP_PACKAGING_NOTES,
  APP_VERSION,
} from "../../state/app-metadata.ts";
import {
  BUILD_REQUIRES_LICENSE,
  ITCH_GAME_ID,
} from "../../state/build-config.ts";
import {
  getLicenseState,
  clearLicense,
  isLicenseValid,
} from "../../state/license-state.ts";
import { showToast } from "../../state/notifications.ts";

export const AboutModal: m.Component = {
  view() {
    if (!state.showAbout) return null;

    const close = () => {
      state.showAbout = false;
    };

    const purchaseUrl = ITCH_GAME_ID
      ? `https://itch.io/s/${ITCH_GAME_ID}`
      : "https://docroshi.itch.io/custom_LPC_character_creation_studio";

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
            BUILD_REQUIRES_LICENSE ? renderLicenseSection(purchaseUrl) : null,
          ]),
          m("div.about-footer", [
            m("div.about-footer-links", [
              m(
                "a.button.is-small.is-light",
                {
                  href: purchaseUrl,
                  target: "_blank",
                  rel: "noopener noreferrer",
                  title: "Check for updates and purchase on itch.io",
                },
                "🔄 Check for Updates on itch.io",
              ),
            ]),
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

function renderLicenseSection(purchaseUrl: string): m.Children {
  const license = getLicenseState();
  let statusText = "No active license";
  let details: string[] = [];
  let showDeactivate = false;
  let showReverify = false;

  if (license.kind === "valid") {
    statusText = "Licensed (Active)";
    details = [
      `Edition: ${license.edition.toUpperCase()}`,
      `Expires: ${new Date(license.expiresAt).toLocaleDateString()}`,
      `Key Hash: ${license.downloadKeyHash.substring(0, 10)}...`,
    ];
    showDeactivate = true;
    showReverify = true;
  } else if (license.kind === "offline-grace") {
    statusText = "Offline Grace Period (Re-verify to refresh)";
    details = [
      `Edition: ${license.edition.toUpperCase()}`,
      `Expires: ${new Date(license.expiresAt).toLocaleDateString()} (Grace active)`,
    ];
    showDeactivate = true;
    showReverify = true;
  } else if (license.kind === "invalid") {
    statusText = "Invalid License Key";
    details = [`Reason: ${license.reason}`];
    showReverify = true;
  } else if (license.kind === "checking") {
    statusText = "Checking License...";
  } else if (license.kind === "required") {
    statusText = "Key Required";
    details = ["Please enter your itch.io key in the startup gate."];
    showReverify = true;
  }

  const handleCopyDiagnostics = () => {
    const info = [
      `App: LPC Character Generator v${APP_VERSION}`,
      `License status: ${statusText}`,
      ...details,
      `Valid: ${isLicenseValid()}`,
    ].join("\n");
    navigator.clipboard
      .writeText(info)
      .then(() =>
        showToast("Diagnostics copied to clipboard.", { kind: "success" }),
      )
      .catch(() =>
        showToast("Could not copy to clipboard.", { kind: "warning" }),
      );
  };

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
    m("div.buttons.mt-2", [
      showReverify
        ? m(
            "button.button.is-info.is-small",
            {
              type: "button",
              title: "Clear cached license and re-enter your key",
              onclick: () => {
                clearLicense();
                state.showAbout = false;
                // The LicenseGateModal will reappear on next render
              },
            },
            "Re-verify License",
          )
        : null,
      showDeactivate
        ? m(
            "button.button.is-danger.is-small",
            {
              type: "button",
              onclick: () => {
                clearLicense();
              },
            },
            "Deactivate License",
          )
        : null,
      m(
        "button.button.is-light.is-small",
        {
          type: "button",
          title: "Copy license and app info for support",
          onclick: handleCopyDiagnostics,
        },
        "Copy Diagnostics",
      ),
      m(
        "a.button.is-light.is-small",
        {
          href: purchaseUrl,
          target: "_blank",
          rel: "noopener noreferrer",
          title: "Purchase or manage your license on itch.io",
        },
        "itch.io Page",
      ),
    ]),
  ]);
}
