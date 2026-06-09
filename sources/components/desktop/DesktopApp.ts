// Main desktop app layout component
import m from "mithril";
import { state } from "../../state/state.ts";
import type { CatalogReader } from "../../state/catalog.ts";
import { SlotSelector } from "./SlotSelector.ts";
import { DesktopPreview } from "./DesktopPreview.ts";
import { ActionBar } from "./ActionBar.ts";
import { SLOT_CONFIG } from "./slot-config.ts";
import { PartEditor } from "./PartEditor.ts";
import { PlanSelector } from "./PlanSelector.ts";
import { StudioPanel } from "./StudioPanel.ts";
import { WorkflowToolsPanel } from "./WorkflowToolsPanel.ts";
import { OnboardingModal } from "./OnboardingModal.ts";
import { AboutModal } from "./AboutModal.ts";
import { shouldShowOnboarding } from "../../state/onboarding.ts";
import {
  executeCommand,
  getCommandTitle,
  initDefaultCommands,
  setupGlobalShortcutListener,
  teardownGlobalShortcutListener,
} from "../../state/commands.ts";
import { CommandPaletteModal } from "./CommandPaletteModal.ts";
import { ShortcutHelpModal } from "./ShortcutHelpModal.ts";
import { ConfirmDialogModal } from "../notifications/ConfirmDialogModal.ts";
import { NotificationCenter } from "../notifications/NotificationCenter.ts";
import { buildRenderKey, triggerRender } from "../render-effect.ts";

type DesktopAppAttrs = { catalog: CatalogReader };

type DesktopAppState = {
  prevKey: string;
  slotSearch: string;
};

export const DesktopApp: m.Component<DesktopAppAttrs, DesktopAppState> = {
  oninit(vnode) {
    initDefaultCommands();
    setupGlobalShortcutListener();

    vnode.state.prevKey = buildRenderKey();
    vnode.state.slotSearch = "";
    state.showOnboarding = shouldShowOnboarding();
  },

  onremove() {
    teardownGlobalShortcutListener();
  },

  onupdate(vnode) {
    const key = buildRenderKey();
    if (key !== vnode.state.prevKey) {
      vnode.state.prevKey = key;
      triggerRender();
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
        m(PlanSelector),
        m("div.desktop-palette-spacer"),
        m(
          "button.desktop-title-btn",
          {
            type: "button",
            title: "Open command palette (Ctrl+K)",
            onclick: () => {
              executeCommand("app.commandPalette.toggle");
            },
          },
          "⌕",
        ),
        m(
          "button.desktop-title-btn",
          {
            type: "button",
            title: "Keyboard shortcuts (Ctrl+/)",
            onclick: () => {
              executeCommand("app.shortcuts.toggle");
            },
          },
          "?",
        ),
        m(
          "button.desktop-title-btn",
          {
            type: "button",
            title: "Getting started",
            onclick: () => {
              state.showOnboarding = true;
            },
          },
          "i",
        ),
        m(
          "button.desktop-title-btn",
          {
            type: "button",
            title: "About this app",
            onclick: () => {
              executeCommand("app.about.toggle");
            },
          },
          "ⓘ",
        ),
        m(
          "button.desktop-title-btn.desktop-title-btn-close",
          {
            title: getCommandTitle("app.reset", "Reset all selections"),
            onclick: () => {
              executeCommand("app.reset");
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
          m(StudioPanel),
          m(WorkflowToolsPanel, { catalog }),
        ]),
      ]),

      // Bottom action bar
      m(ActionBar, { catalog }),

      // Global Modals / Overlays
      m(CommandPaletteModal),
      m(ShortcutHelpModal),
      m(OnboardingModal, { catalog }),
      m(AboutModal),
      m(ConfirmDialogModal),
      m(NotificationCenter),
    ]);
  },
};
