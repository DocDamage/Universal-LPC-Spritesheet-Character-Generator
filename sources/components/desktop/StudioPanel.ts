import m from "mithril";
import { canUseFeature } from "../../state/feature-gates.ts";
import { listStudioProjects } from "../../state/studio-projects.ts";
import { StudioProjectActions } from "./studio-panel/StudioProjectActions.ts";
import { StudioProjectForm } from "./studio-panel/StudioProjectForm.ts";
import { StudioProjectList } from "./studio-panel/StudioProjectList.ts";
import type { StudioPanelState } from "./studio-panel/types.ts";
import { selectedProjects } from "./studio-panel/studio-utils.ts";
import { ITCH_GAME_ID, BUILD_PRICE } from "../../state/build-config.ts";

const STUDIO_FEATURES = [
  "Save and restore named character projects",
  "Thumbnail previews for every project",
  "Collections, tags, notes, role, and status tracking",
  "Version snapshots — save and restore any prior state",
  "Bulk lock/approve/export actions across your library",
  "Studio handoff ZIP with combined credits and JSON",
  "Contact-sheet batch PNG exports",
] as const;

export const StudioPanel: m.Component<unknown, StudioPanelState> = {
  oninit(vnode) {
    vnode.state.projects = listStudioProjects();
    vnode.state.projectName = "";
    vnode.state.collection = "";
    vnode.state.role = "";
    vnode.state.tags = "";
    vnode.state.notes = "";
    vnode.state.activeCollection = "";
    vnode.state.selectedProjectId = null;
    vnode.state.isExporting = false;
  },

  view(vnode) {
    const hasStudio = canUseFeature("studio-tools");
    const projects = vnode.state.projects ?? [];
    const visibleProjects = selectedProjects(
      projects,
      vnode.state.activeCollection,
    );

    if (!hasStudio) {
      const purchaseUrl = ITCH_GAME_ID
        ? `https://itch.io/s/${ITCH_GAME_ID}`
        : "https://docroshi.itch.io/custom_LPC_character_creation_studio";

      // BUILD_PRICE is baked per-tier, so show $19.99 as the Studio default
      const displayPrice =
        BUILD_PRICE !== "0" && BUILD_PRICE !== ""
          ? `$${BUILD_PRICE}`
          : "$19.99";

      return m("section.studio-panel.studio-panel-locked", [
        m("div.studio-panel-header", [
          m("h3", "Studio"),
          m("span.studio-panel-pill", "Studio Edition"),
        ]),
        m("div.studio-upsell-card", [
          m("div.studio-upsell-price", [
            m("span.studio-upsell-amount", displayPrice),
            m("span.studio-upsell-label", " one-time"),
          ]),
          m(
            "p.studio-upsell-tagline",
            "Everything in Pro, plus production-grade project management:",
          ),
          m(
            "ul.studio-upsell-features",
            STUDIO_FEATURES.map((f) =>
              m("li", [m("span.studio-check", "✓"), " ", f]),
            ),
          ),
          m("div.studio-upsell-actions", [
            m(
              "a.button.is-info.is-fullwidth",
              {
                href: purchaseUrl,
                target: "_blank",
                rel: "noopener noreferrer",
                title: "Get Studio Edition on itch.io",
              },
              `Get Studio Edition — ${displayPrice}`,
            ),
          ]),
        ]),
      ]);
    }

    return m("section.studio-panel", [
      m("div.studio-panel-header", [
        m("h3", "Studio Projects"),
        m("span.studio-panel-pill", `${projects.length} saved`),
      ]),
      m(StudioProjectForm, { panelState: vnode.state }),
      m(StudioProjectActions, {
        panelState: vnode.state,
        visibleProjects,
      }),
      m(StudioProjectList, {
        panelState: vnode.state,
        visibleProjects,
      }),
    ]);
  },
};
