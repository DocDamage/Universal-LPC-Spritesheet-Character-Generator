import m from "mithril";
import { state } from "../../state/state.ts";
import { dismissOnboarding } from "../../state/onboarding.ts";
import { executeCommand } from "../../state/commands.ts";
import { showToast } from "../../state/notifications.ts";
import type { CatalogReader } from "../../state/catalog.ts";
import { randomizeAll } from "./slot-config.ts";
import { triggerRender } from "../render-effect.ts";
import { canUseFeature } from "../../state/feature-gates.ts";
import { ITCH_GAME_ID } from "../../state/build-config.ts";

type OnboardingModalAttrs = {
  catalog: CatalogReader;
};

type StarterAction = {
  title: string;
  label: string;
  detail: string;
  action: (catalog: CatalogReader) => void | Promise<void>;
};

const starterActions: StarterAction[] = [
  {
    title: "Start Simple",
    label: "Use Defaults",
    detail: "Keep the clean default character and begin choosing parts.",
    action: () => {
      state.activeTab = "character";
    },
  },
  {
    title: "Make A Character",
    label: "Randomize",
    detail: "Generate a quick starter build, then adjust the slots you like.",
    action: async (catalog) => {
      randomizeAll(catalog);
      await triggerRender();
      showToast("Starter character generated.", { kind: "success" });
    },
  },
  {
    title: "Production Mode",
    label: "Open Studio",
    detail: "Use project saves, thumbnails, reports, and batch workflows.",
    action: () => {
      if (canUseFeature("studio-tools")) {
        state.appPlan = "studio";
      } else {
        const purchaseUrl = ITCH_GAME_ID
          ? `https://itch.io/s/${ITCH_GAME_ID}`
          : "https://docroshi.itch.io/custom_LPC_character_creation_studio";
        showToast(
          `Studio features require the Studio edition. Get it at ${purchaseUrl}`,
          { kind: "warning", timeoutMs: 8000 },
        );
      }
    },
  },
  {
    title: "Find Anything",
    label: "Commands",
    detail: "Open the command palette and discover shortcuts and exports.",
    action: () => {
      executeCommand("app.commandPalette.toggle");
    },
  },
];

export const OnboardingModal: m.Component<OnboardingModalAttrs> = {
  view(vnode) {
    if (!state.showOnboarding) return null;

    const close = () => {
      dismissOnboarding();
      state.showOnboarding = false;
    };

    return m("div.onboarding-overlay", { onclick: close }, [
      m(
        "div.onboarding-modal",
        {
          role: "dialog",
          "aria-modal": "true",
          "aria-label": "Getting started",
          onclick: (event: MouseEvent) => event.stopPropagation(),
        },
        [
          m("div.onboarding-header", [
            m("div", [
              m("span.studio-panel-pill", "Getting Started"),
              m("h2", "Build, verify, and export LPC characters"),
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
          m("p.onboarding-copy", [
            "Included assets stay free/open. Paid modes unlock workflow tools only, like project libraries, batch exports, and reports.",
          ]),
          m(
            "div.onboarding-step-grid",
            starterActions.map((item) =>
              m("article.onboarding-step", { key: item.title }, [
                m("strong", item.title),
                m("p", item.detail),
                m(
                  "button.button.is-small",
                  {
                    type: "button",
                    onclick: async () => {
                      await item.action(vnode.attrs.catalog);
                      close();
                    },
                  },
                  item.label,
                ),
              ]),
            ),
          ),
          m("div.onboarding-footer", [
            m(
              "span",
              "Suggested flow: choose body, add gear, preview animations, run export readiness, save a Studio project.",
            ),
            m(
              "button.button.is-small.is-light",
              {
                type: "button",
                onclick: close,
              },
              "Skip",
            ),
          ]),
        ],
      ),
    ]);
  },
};
