import m from "mithril";
import { state } from "../../state/state.ts";
import { PLAN_LABELS } from "../../state/feature-gates.ts";
import type { AppPlan } from "../../state/app-state.ts";
import { BUILD_CHANNEL, BUILD_TIER } from "../../state/build-config.ts";

const plans: AppPlan[] = ["free", "pro", "studio"];

const planDescriptions: Record<AppPlan, string> = {
  free: "Full assets, basic creator, single PNG export",
  pro: "Advanced editor, custom imports, ZIP/batch exports, engine presets",
  studio: "Project libraries, saved builds, batch project ZIPs",
};

export const PlanSelector: m.Component = {
  view() {
    if (BUILD_CHANNEL !== "dev") {
      return m("div.desktop-plan-selector", [
        m("span.desktop-palette-label", "Edition"),
        m("span.tag.is-info", PLAN_LABELS[BUILD_TIER]),
      ]);
    }

    return m("div.desktop-plan-selector", [
      m("span.desktop-palette-label", "Mode"),
      m(
        "div.buttons.has-addons",
        plans.map((plan) =>
          m(
            "button.button.is-small",
            {
              type: "button",
              class: state.appPlan === plan ? "is-info is-selected" : "",
              title: planDescriptions[plan],
              onclick: () => {
                state.appPlan = plan;
              },
            },
            PLAN_LABELS[plan],
          ),
        ),
      ),
    ]);
  },
};
