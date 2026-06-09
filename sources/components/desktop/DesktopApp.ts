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
import { LicenseGateModal } from "./LicenseGateModal.ts";
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
import { showToast } from "../../state/notifications.ts";
import {
  clampDesktopPanelWidth,
  getDefaultDesktopLayout,
  getDesktopPanelLabel,
  loadDesktopLayout,
  moveDesktopPanel,
  saveDesktopLayout,
  type DesktopPanelId,
  type DesktopPanelLayout,
} from "./desktop-layout.ts";

type DesktopAppAttrs = { catalog: CatalogReader };

type DesktopAppState = {
  prevKey: string;
  slotSearch: string;
  layout: DesktopPanelLayout;
  resize: {
    panelId: DesktopPanelId;
    startX: number;
    startWidth: number;
    changed: boolean;
  } | null;
  onPanelResizeMove: ((event: MouseEvent) => void) | null;
  onPanelResizeUp: (() => void) | null;
};

const PANEL_CLASSES: Record<DesktopPanelId, string> = {
  slots: "desktop-panel-left",
  preview: "desktop-panel-center",
  tools: "desktop-panel-right part-editor-panel",
};

function persistLayout(vnode: m.Vnode<DesktopAppAttrs, DesktopAppState>): void {
  vnode.state.layout = {
    ...vnode.state.layout,
    widths: { ...vnode.state.layout.widths },
    order: [...vnode.state.layout.order],
  };
  saveDesktopLayout(vnode.state.layout);
}

function startPanelResize(
  vnode: m.Vnode<DesktopAppAttrs, DesktopAppState>,
  panelId: DesktopPanelId,
  event: MouseEvent,
): void {
  event.preventDefault();
  vnode.state.resize = {
    panelId,
    startX: event.clientX,
    startWidth: vnode.state.layout.widths[panelId],
    changed: false,
  };

  const onMove = (moveEvent: MouseEvent) => {
    const resize = vnode.state.resize;
    if (!resize) return;
    const nextWidth = clampDesktopPanelWidth(
      resize.panelId,
      resize.startWidth + moveEvent.clientX - resize.startX,
    );
    resize.changed = resize.changed || nextWidth !== resize.startWidth;
    vnode.state.layout.widths[resize.panelId] = nextWidth;
    saveDesktopLayout(vnode.state.layout);
    m.redraw();
  };

  const onUp = () => {
    const resize = vnode.state.resize;
    if (resize?.changed) {
      showToast(`${getDesktopPanelLabel(resize.panelId)} panel resized.`, {
        kind: "success",
      });
    }
    vnode.state.resize = null;
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", onUp);
    vnode.state.onPanelResizeMove = null;
    vnode.state.onPanelResizeUp = null;
    m.redraw();
  };

  vnode.state.onPanelResizeMove = onMove;
  vnode.state.onPanelResizeUp = onUp;
  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onUp);
}

function renderPanelShell(
  vnode: m.Vnode<DesktopAppAttrs, DesktopAppState>,
  panelId: DesktopPanelId,
  children: m.Children,
): m.Children {
  const orderIndex = vnode.state.layout.order.indexOf(panelId);
  const width = vnode.state.layout.widths[panelId];

  return m(
    `div.desktop-panel.desktop-panel-managed.${PANEL_CLASSES[panelId]}`,
    {
      class: vnode.state.resize?.panelId === panelId ? "is-resizing" : "",
      style: {
        order: orderIndex,
        flex: `0 0 ${width}px`,
        width: `${width}px`,
      },
    },
    [
      m("div.desktop-panel-layout-bar", [
        m("span.desktop-panel-layout-title", getDesktopPanelLabel(panelId)),
        m("div.desktop-panel-layout-actions", [
          m(
            "button.desktop-panel-layout-btn",
            {
              type: "button",
              title: "Move panel left",
              disabled: orderIndex <= 0,
              onclick: () => {
                vnode.state.layout = moveDesktopPanel(
                  vnode.state.layout,
                  panelId,
                  -1,
                );
                persistLayout(vnode);
                showToast(`${getDesktopPanelLabel(panelId)} panel moved.`, {
                  kind: "success",
                });
              },
            },
            "‹",
          ),
          m(
            "button.desktop-panel-layout-btn",
            {
              type: "button",
              title: "Move panel right",
              disabled: orderIndex >= vnode.state.layout.order.length - 1,
              onclick: () => {
                vnode.state.layout = moveDesktopPanel(
                  vnode.state.layout,
                  panelId,
                  1,
                );
                persistLayout(vnode);
                showToast(`${getDesktopPanelLabel(panelId)} panel moved.`, {
                  kind: "success",
                });
              },
            },
            "›",
          ),
        ]),
      ]),
      m("div.desktop-panel-body", children),
      m("div.desktop-panel-resize-handle", {
        title: "Drag to resize panel",
        onmousedown: (event: MouseEvent) => {
          startPanelResize(vnode, panelId, event);
        },
      }),
    ],
  );
}

export const DesktopApp: m.Component<DesktopAppAttrs, DesktopAppState> = {
  oninit(vnode) {
    initDefaultCommands();
    setupGlobalShortcutListener();

    vnode.state.prevKey = buildRenderKey();
    vnode.state.slotSearch = "";
    vnode.state.layout = loadDesktopLayout();
    vnode.state.resize = null;
    vnode.state.onPanelResizeMove = null;
    vnode.state.onPanelResizeUp = null;
    state.showOnboarding = shouldShowOnboarding();
  },

  onremove(vnode) {
    if (vnode.state.onPanelResizeMove) {
      window.removeEventListener("mousemove", vnode.state.onPanelResizeMove);
    }
    if (vnode.state.onPanelResizeUp) {
      window.removeEventListener("mouseup", vnode.state.onPanelResizeUp);
    }
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
            title: "Reset panel layout",
            onclick: () => {
              vnode.state.layout = getDefaultDesktopLayout();
              persistLayout(vnode);
              showToast("Panel layout reset.", { kind: "success" });
            },
          },
          "⇤",
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
        renderPanelShell(vnode, "slots", [
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

        renderPanelShell(vnode, "preview", [m(DesktopPreview)]),

        renderPanelShell(vnode, "tools", [
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
      m(require("./CreditsPreviewModal.ts").CreditsPreviewModal),
      m(LicenseGateModal),
      m(ConfirmDialogModal),
      m(NotificationCenter),
    ]);
  },
};
