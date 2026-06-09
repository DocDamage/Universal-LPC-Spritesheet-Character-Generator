/* eslint-disable @typescript-eslint/no-explicit-any */
import m from "mithril";
import { BUILD_TIER, ITCH_GAME_ID } from "../../state/build-config.ts";
import {
  getLicenseState,
  verifyLicenseKey,
  isLicenseValid,
} from "../../state/license-state.ts";

export const LicenseGateModal: m.Component = {
  oninit(vnode: any) {
    vnode.state.downloadKey = "";
    vnode.state.error = "";
    vnode.state.isVerifying = false;
    vnode.state.showGraceOverride = false;
  },

  view(vnode: any) {
    const state = getLicenseState();

    // If no license is required, or a valid license is held, and the user hasn't asked to view/override offline grace, don't show the gate
    if (
      isLicenseValid() &&
      (state.kind !== "offline-grace" || vnode.state.showGraceOverride)
    ) {
      return null;
    }

    const handleVerify = async () => {
      let key = vnode.state.downloadKey.trim();
      if (!key) {
        vnode.state.error = "Please enter a license key or download URL.";
        return;
      }

      // Parse itch.io URL if pasted: extract key from url segment
      // e.g. https://creator.itch.io/app/download/download_key
      const urlMatch = key.match(/\/download\/([a-zA-Z0-9_-]+)/);
      if (urlMatch && urlMatch[1]) {
        key = urlMatch[1];
      }

      vnode.state.isVerifying = true;
      vnode.state.error = "";
      m.redraw();

      const success = await verifyLicenseKey(key);
      vnode.state.isVerifying = false;
      if (!success) {
        const currentState = getLicenseState();
        vnode.state.error =
          currentState.kind === "invalid"
            ? currentState.reason
            : "Verification failed. Please check your network and download key.";
      } else {
        vnode.state.downloadKey = "";
      }
      m.redraw();
    };

    const editionName =
      BUILD_TIER.charAt(0).toUpperCase() + BUILD_TIER.slice(1);
    const purchaseUrl = ITCH_GAME_ID
      ? `https://itch.io/s/${ITCH_GAME_ID}`
      : "https://docroshi.itch.io/custom_LPC_character_creation_studio";

    return m("div.onboarding-overlay", { style: { zIndex: 1000 } }, [
      m(
        "div.onboarding-modal",
        {
          role: "dialog",
          "aria-modal": "true",
          "aria-label": "License Verification",
          style: { maxWidth: "480px" },
          onclick: (e: MouseEvent) => e.stopPropagation(),
        },
        [
          m("div.onboarding-header", [
            m("div", [
              m("span.studio-panel-pill", "Verification Required"),
              m("h2", `LPC Character Generator - ${editionName} Edition`),
            ]),
          ]),

          m("div.onboarding-body", { style: { padding: "20px 0" } }, [
            m(
              "p.onboarding-copy",
              "Thank you for supporting development! This paid edition requires a valid itch.io download key to unlock features.",
            ),

            state.kind === "offline-grace" && !vnode.state.showGraceOverride
              ? m("div.notification.is-warning.is-light", [
                  m("strong", "Offline Grace Period Active"),
                  m(
                    "p",
                    `Your license check expired on ${new Date(state.expiresAt).toLocaleDateString()}. You are within the 7-day offline grace period.`,
                  ),
                  m(
                    "button.button.is-small.is-warning.mt-2",
                    {
                      onclick: () => {
                        vnode.state.showGraceOverride = true;
                      },
                    },
                    "Continue using App",
                  ),
                ])
              : null,

            vnode.state.error
              ? m("div.notification.is-danger.is-light", vnode.state.error)
              : null,

            state.kind === "invalid" && !vnode.state.error
              ? m("div.notification.is-danger.is-light", state.reason)
              : null,

            m("div.field", [
              m("label.label", "Enter itch.io Download Key or URL"),
              m("div.control", [
                m("input.input", {
                  type: "text",
                  placeholder:
                    "e.g. https://creator.itch.io/app/download/CLAIM-XXXXX",
                  value: vnode.state.downloadKey,
                  disabled: vnode.state.isVerifying,
                  oninput: (e: Event) => {
                    vnode.state.downloadKey = (
                      e.target as HTMLInputElement
                    ).value;
                  },
                  onkeydown: (e: KeyboardEvent) => {
                    if (e.key === "Enter") {
                      handleVerify();
                    }
                  },
                }),
              ]),
              m(
                "p.help",
                "Paste the full download URL from your itch.io purchase receipt or enter the key directly.",
              ),
            ]),
          ]),

          m(
            "div.onboarding-footer.is-flex.is-justify-content-space-between.is-align-items-center",
            [
              m(
                "a.button.is-light.is-small",
                {
                  href: purchaseUrl,
                  target: "_blank",
                  rel: "noopener noreferrer",
                },
                "Get License Key on itch.io",
              ),
              m("div.buttons", [
                m(
                  "button.button.is-info.is-small",
                  {
                    class: vnode.state.isVerifying ? "is-loading" : "",
                    disabled: vnode.state.isVerifying,
                    onclick: handleVerify,
                  },
                  "Verify & Unlock",
                ),
              ]),
            ],
          ),
        ],
      ),
    ]);
  },
};
