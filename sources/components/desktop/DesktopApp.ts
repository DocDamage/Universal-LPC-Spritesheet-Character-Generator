// Main desktop app layout component
import m from "mithril";
import { state, resetAll } from "../../state/state.ts";
import { syncSelectionsToHash } from "../../state/hash.ts";
import { renderCharacter } from "../../canvas/renderer.ts";
import type { CatalogReader } from "../../state/catalog.ts";
import { SlotSelector } from "./SlotSelector.ts";
import { DesktopPreview } from "./DesktopPreview.ts";
import { ActionBar } from "./ActionBar.ts";
import { SLOT_CONFIG } from "./slot-config.ts";
import { PartEditor } from "./PartEditor.ts";

type DesktopAppAttrs = { catalog: CatalogReader };

type DesktopAppState = {
  prevSelectionsKey: string;
  slotSearch: string;
};

export const DesktopApp: m.Component<DesktopAppAttrs, DesktopAppState> = {
  oninit(vnode) {
    vnode.state.prevSelectionsKey =
      JSON.stringify(state.selections) +
      "|" +
      state.bodyType +
      "|" +
      state.customImageZPos;
    vnode.state.slotSearch = "";
  },

  onupdate(vnode) {
    // Build a single key covering all render-relevant state
    const key =
      JSON.stringify(state.selections) +
      "|" +
      state.bodyType +
      "|" +
      state.customImageZPos;
    if (key !== vnode.state.prevSelectionsKey) {
      vnode.state.prevSelectionsKey = key;
      syncSelectionsToHash();
      if (window.canvasRenderer) {
        renderCharacter(state.selections, state.bodyType)
          .then(() => m.redraw())
          .catch((err) =>
            console.error("[DesktopApp] renderCharacter failed:", err),
          );
      }
    }
  },

  view(vnode) {
    const { catalog } = vnode.attrs;
    const search = (vnode.state.slotSearch || "").toLowerCase().trim();
    const allSlots = SLOT_CONFIG.filter((s) =>
      state.activeTab === "character"
        ? s.panel === "left"
        : s.panel === "right",
    );
    const slots = search
      ? allSlots.filter((s) => s.label.toLowerCase().includes(search))
      : allSlots;

    const leftCount = SLOT_CONFIG.filter((s) => s.panel === "left").length;
    const rightCount = SLOT_CONFIG.filter((s) => s.panel === "right").length;

    return m("div.desktop-app", [
      // Title bar
      m("div.desktop-title-bar", [
        m("div.desktop-title", [
          m("span.desktop-title-icon", "🎨"),
          "LPC Character Generator",
        ]),
        m("div.desktop-title-controls", [
          m("button.desktop-title-btn", { title: "Minimize" }, "−"),
          m("button.desktop-title-btn", { title: "Maximize" }, "□"),
          m(
            "button.desktop-title-btn.desktop-title-btn-close",
            { title: "Close" },
            "×",
          ),
        ]),
      ]),

      // Palette selector (top bar)
      m("div.desktop-palette-bar", [
        m("label.desktop-palette-label", "Palette"),
        m("select.desktop-palette-select", [
          m("option", { value: "default" }, "Default"),
        ]),
        m("div.desktop-palette-spacer"),
        m("button.desktop-title-btn", { title: "Info" }, "ℹ"),
        m(
          "button.desktop-title-btn.desktop-title-btn-close",
          {
            title: "Reset all selections",
            onclick: () => {
              if (confirm("Reset all selections to defaults?")) {
                void resetAll();
              }
            },
          },
          "✕",
        ),
      ]),

      // Main content area
      m("div.desktop-content", [
        // Left panel
        m("div.desktop-panel.desktop-panel-left", [
          m("div.desktop-tabs-bar", [
            m(
              "button.desktop-tab-btn",
              {
                class: state.activeTab === "character" ? "active" : "",
                onclick: () => {
                  state.activeTab = "character";
                  vnode.state.slotSearch = "";
                },
              },
              `Body (${leftCount})`,
            ),
            m(
              "button.desktop-tab-btn",
              {
                class: state.activeTab === "accessories" ? "active" : "",
                onclick: () => {
                  state.activeTab = "accessories";
                  vnode.state.slotSearch = "";
                },
              },
              `Gear (${rightCount})`,
            ),
          ]),
          // Search within slots
          m("input.desktop-slot-search", {
            type: "text",
            placeholder: `Search ${state.activeTab === "character" ? "body" : "gear"} slots...`,
            value: vnode.state.slotSearch,
            oninput: (e: Event) => {
              vnode.state.slotSearch = (e.target as HTMLInputElement).value;
            },
          }),
          m("div.desktop-slots-scroll", [
            slots.length === 0
              ? m(
                  "div.desktop-no-results",
                  `No slots match "${vnode.state.slotSearch}"`,
                )
              : slots.map((slot) => m(SlotSelector, { slot, catalog })),
          ]),
        ]),

        // Center preview
        m("div.desktop-panel.desktop-panel-center", [m(DesktopPreview)]),

        // Right panel
        m("div.desktop-panel.desktop-panel-right.part-editor-panel", [
          m(PartEditor),
        ]),
      ]),

      // Bottom action bar
      m(ActionBar, { catalog }),
    ]);
  },
};
