// Main desktop app layout component
import m from "mithril";
import { state } from "../../state/state.ts";
import { ANIMATIONS } from "../../state/constants.ts";
import type { CatalogReader } from "../../state/catalog.ts";
import { SlotSelector } from "./SlotSelector.ts";
import { DesktopPreview } from "./DesktopPreview.ts";
import { ActionBar } from "./ActionBar.ts";
import { SLOT_CONFIG, randomizeSlot } from "./slot-config.ts";
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
  initDefaultCommands,
  setupGlobalShortcutListener,
  teardownGlobalShortcutListener,
} from "../../state/commands.ts";
import { CommandPaletteModal } from "./CommandPaletteModal.ts";
import { CreditsPreviewModal } from "./CreditsPreviewModal.ts";
import { ShortcutHelpModal } from "./ShortcutHelpModal.ts";
import { ConfirmDialogModal } from "../notifications/ConfirmDialogModal.ts";
import { NotificationCenter } from "../notifications/NotificationCenter.ts";
import { buildRenderKey, triggerRender } from "../render-effect.ts";
import { showToast } from "../../state/notifications.ts";
import {
  clampDesktopPanelWidth,
  getDesktopPanelLabel,
  loadDesktopLayout,
  moveDesktopPanel,
  saveDesktopLayout,
  type DesktopPanelId,
  type DesktopPanelLayout,
} from "./desktop-layout.ts";
import type { TweenMode } from "../../canvas/tween.ts";

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

// Retained for the legacy draggable panel shell; the active book layout renders pages directly.
void renderPanelShell;

function triggerPageFlip(
  newPage: "creator" | "pixel" | "animation" | "settings",
) {
  if (state.isFlipping) return;
  if (state.bookPage === newPage) return;

  state.isFlipping = true;
  state.flipFrame = 1;
  state.targetBookPage = newPage;
  m.redraw();

  const interval = window.setInterval(() => {
    state.flipFrame++;
    // Swaps content behind the page at frame 5 (halfway fold)
    if (state.flipFrame === 5) {
      state.bookPage = newPage;
    }
    if (state.flipFrame > 9) {
      window.clearInterval(interval);
      state.isFlipping = false;
      state.targetBookPage = null;
    }
    m.redraw();
  }, 45); // ~360ms total flip animation
}

const BOOK_PAGES = [
  {
    id: "creator",
    label: "Creator",
    title: "Character Creator",
    icon: "📖",
    tabClass: "tab-book",
  },
  {
    id: "pixel",
    label: "Pixel",
    title: "Pixel Editor",
    icon: "⚔️",
    tabClass: "tab-swords",
  },
  {
    id: "animation",
    label: "Anim",
    title: "Animation Editor",
    icon: "💾",
    tabClass: "tab-floppy",
  },
  {
    id: "settings",
    label: "Tools",
    title: "Settings",
    icon: "⚙️",
    tabClass: "tab-gear",
  },
] as const;

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
    if (!state.activeSlotLabel) {
      state.activeSlotLabel = "Gender";
    }
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
    const bodySlots = SLOT_CONFIG.filter((s) => s.panel === "left");
    const gearSlots = SLOT_CONFIG.filter((s) => s.panel === "right");

    const activePage = state.isFlipping ? state.targetBookPage : state.bookPage;
    const activeSlot = SLOT_CONFIG.find(
      (slot) => slot.label === state.activeSlotLabel,
    );
    const topActions = [
      {
        label: "Body",
        title: "Show body part slots",
        icon: "👤",
        tabClass: "tab-book",
        actionClass: "action-body",
        active: state.bookPage === "creator" && state.activeTab === "character",
        onclick: () => {
          state.activeTab = "character";
          vnode.state.slotSearch = "";
          if (state.bookPage !== "creator") triggerPageFlip("creator");
        },
      },
      {
        label: "Gear",
        title: "Show equipment slots",
        icon: "🛡️",
        tabClass: "tab-swords",
        actionClass: "action-gear",
        active:
          state.bookPage === "creator" && state.activeTab === "accessories",
        onclick: () => {
          state.activeTab = "accessories";
          vnode.state.slotSearch = "";
          if (state.bookPage !== "creator") triggerPageFlip("creator");
        },
      },
      {
        label: "Roll",
        title: activeSlot?.canRandomize
          ? `Randomize ${activeSlot.label}`
          : "Current slot cannot be randomized",
        icon: "🎲",
        tabClass: "tab-floppy",
        actionClass: "action-random",
        active: false,
        disabled: !activeSlot?.canRandomize,
        onclick: () => {
          if (activeSlot?.canRandomize) {
            randomizeSlot(activeSlot, catalog);
          }
        },
      },
      {
        label: "PNG",
        title: "Export full spritesheet as PNG",
        icon: "📤",
        tabClass: "tab-gear",
        actionClass: "action-export",
        active: false,
        onclick: () => {
          executeCommand("app.export.png");
        },
      },
    ];

    // Helper to render Left Page contents based on current bookPage
    const renderLeftPage = () => {
      switch (state.bookPage) {
        case "pixel":
          return m(
            "div.book-frame.frame-inset",
            {
              style: {
                height: "100%",
                display: "flex",
                flexDirection: "column",
              },
            },
            [
              m("div.book-frame-title", "Pixel Editor Canvas"),
              m(
                "div",
                {
                  style: {
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    minHeight: 0,
                  },
                },
                [m(PartEditor)],
              ),
            ],
          );

        case "animation":
          return m("div.book-frame.frame-inset.animation-options-frame", [
            m("div.book-frame-title", "Animation Options"),
            m("div.desktop-slot", [
              m("label.desktop-slot-label", "Animation"),
              m(
                "select.desktop-slot-select",
                {
                  value: state.selectedAnimation,
                  onchange: (e: Event) => {
                    const anim = (e.target as HTMLSelectElement).value;
                    state.selectedAnimation = anim;
                  },
                },
                ANIMATIONS.map((anim) =>
                  m("option", { value: anim.value }, anim.label),
                ),
              ),
            ]),
            m("div.desktop-slot", [
              m("label.desktop-slot-label", "Tween Mode"),
              m(
                "select.desktop-slot-select",
                {
                  value: state.previewTweenMode,
                  onchange: (e: Event) => {
                    state.previewTweenMode = (e.target as HTMLSelectElement)
                      .value as TweenMode;
                  },
                },
                [
                  m("option", { value: "off" }, "Off"),
                  m("option", { value: "tween" }, "Tween"),
                ],
              ),
            ]),
            m("div.desktop-slot", [
              m("label.desktop-slot-label", "In-betweens"),
              m("input", {
                class: "desktop-range",
                type: "range",
                min: 1,
                max: 10,
                value: state.previewTweenInbetweens,
                oninput: (e: Event) => {
                  state.previewTweenInbetweens = parseInt(
                    (e.target as HTMLInputElement).value,
                  );
                },
              }),
              m("span.animation-range-value", state.previewTweenInbetweens),
            ]),
            m("div.desktop-slot", [
              m("label.desktop-slot-label", "FPS"),
              m("input", {
                class: "desktop-range",
                type: "range",
                min: 1,
                max: 60,
                value: state.previewTweenFps,
                oninput: (e: Event) => {
                  state.previewTweenFps = parseInt(
                    (e.target as HTMLInputElement).value,
                  );
                },
              }),
              m("span.animation-range-value", state.previewTweenFps),
            ]),
          ]);

        case "settings":
          return m("div.book-frame.frame-inset.app-preferences-frame", [
            m("div.book-frame-title", "App Preferences"),
            m(
              "label.desktop-slot",
              {
                style: {
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  cursor: "pointer",
                  padding: "6px",
                },
              },
              [
                m("input", {
                  type: "checkbox",
                  checked: state.showTransparencyGrid,
                  onchange: (e: Event) => {
                    state.showTransparencyGrid = (
                      e.target as HTMLInputElement
                    ).checked;
                  },
                }),
                m("span", "Show Transparency Grid"),
              ],
            ),
            m(
              "label.desktop-slot",
              {
                style: {
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  cursor: "pointer",
                  padding: "6px",
                },
              },
              [
                m("input", {
                  type: "checkbox",
                  checked: state.applyTransparencyMask,
                  onchange: (e: Event) => {
                    state.applyTransparencyMask = (
                      e.target as HTMLInputElement
                    ).checked;
                  },
                }),
                m("span", "Apply Transparency Mask"),
              ],
            ),
            m(
              "label.desktop-slot",
              {
                style: {
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  cursor: "pointer",
                  padding: "6px",
                },
              },
              [
                m("input", {
                  type: "checkbox",
                  checked: state.matchBodyColorEnabled,
                  onchange: (e: Event) => {
                    state.matchBodyColorEnabled = (
                      e.target as HTMLInputElement
                    ).checked;
                  },
                }),
                m("span", "Match Body Color"),
              ],
            ),
            m(
              "label.desktop-slot",
              {
                style: {
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  cursor: "pointer",
                  padding: "6px",
                },
              },
              [
                m("input", {
                  type: "checkbox",
                  checked: state.compactDisplay,
                  onchange: (e: Event) => {
                    state.compactDisplay = (
                      e.target as HTMLInputElement
                    ).checked;
                  },
                }),
                m("span", "Compact Display"),
              ],
            ),
          ]);

        case "creator":
        default:
          return [
            m(
              "div.book-frame.frame-inset.creator-selector-panel.creator-selector-panel--body",
              { key: "body-selectors" },
              [
                m("div.book-frame-title", "Body Parts"),
                m(
                  "div.creator-selector-list",
                  bodySlots.map((slot) =>
                    m(SlotSelector, {
                      key: slot.label,
                      slot,
                      catalog,
                    }),
                  ),
                ),
              ],
            ),
          ];
      }
    };

    // Helper to render Right Page contents based on current bookPage
    const renderRightPage = () => {
      switch (state.bookPage) {
        case "pixel":
          return [
            m("div.book-frame.frame-inset.pixel-settings-frame", [
              m("div.book-frame-title", "Pixel Settings & Layers"),
              m(StudioPanel),
            ]),
            m("div.book-frame.frame-inset.workflow-frame", [
              m("div.book-frame-title", "Workflow & Actions"),
              m(WorkflowToolsPanel, { catalog }),
            ]),
          ];

        case "animation":
          return [
            m(
              "div.book-frame.frame-inset.animation-preview-frame",
              {
                style: {
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                },
              },
              [
                m("div.book-frame-title", "Animation Live Preview"),
                m(DesktopPreview),
              ],
            ),
          ];

        case "settings":
          return [
            m("div.book-frame.frame-inset.onboarding-info-frame", [
              m("div.book-frame-title", "Onboarding & Info"),
              m(
                "p.settings-info-copy",
                "Welcome to the pixel-art Character Generator! Configure your character spritesheets using the creator page, design custom parts using the pixel editor, play animations in the animation tab, and tweak global options here.",
              ),
              m(
                "button.desktop-title-btn",
                {
                  onclick: () => {
                    state.showOnboarding = true;
                  },
                },
                "Show Getting Started Guide",
              ),
              m(
                "button.desktop-title-btn",
                {
                  onclick: () => {
                    executeCommand("app.shortcuts.toggle");
                  },
                },
                "Keyboard Shortcuts",
              ),
              m(
                "button.desktop-title-btn",
                {
                  onclick: () => {
                    executeCommand("app.about.toggle");
                  },
                },
                "About Application",
              ),
              m(
                "button.desktop-title-btn",
                {
                  onclick: () => {
                    executeCommand("app.reset");
                  },
                },
                "Reset All Selections",
              ),
            ]),
          ];

        case "creator":
        default:
          return [
            m(
              "div.book-frame.frame-inset.creator-selector-panel.creator-selector-panel--gear",
              { key: "gear-selectors" },
              [
                m("div.book-frame-title", "Equipment"),
                m(
                  "div.creator-selector-list",
                  gearSlots.map((slot) =>
                    m(SlotSelector, {
                      key: slot.label,
                      slot,
                      catalog,
                    }),
                  ),
                ),
              ],
            ),
          ];
      }
    };

    return m("div.desktop-book-wrapper", [
      m(
        "div.book-ui",
        {
          class: state.isFlipping
            ? `book-bg-frame-${state.flipFrame}`
            : "book-bg-frame-1",
        },
        [
          // Top tags: quick creator commands. Side bookmarks handle page navigation.
          m(
            "div.book-tabs",
            topActions.map((action) =>
              m(
                `button.book-tab.${action.tabClass}.${action.actionClass}`,
                {
                  class: action.active ? "active" : "",
                  disabled: action.disabled,
                  title: action.title,
                  onclick: action.onclick,
                },
                [
                  m("span.tab-icon", action.icon),
                  m("span.tab-label", action.label),
                ],
              ),
            ),
          ),

          m(
            "div.book-bookmarks",
            BOOK_PAGES.map((page) =>
              m(
                "button.book-bookmark",
                {
                  class: activePage === page.id ? "active" : "",
                  title: page.title,
                  onclick: () => {
                    triggerPageFlip(page.id);
                  },
                },
                m("span.bookmark-icon", page.icon),
              ),
            ),
          ),

          // Left and Right Pages
          m(
            "div.book-pages-container",
            {
              class: state.isFlipping ? "page-flipping-fade" : "",
            },
            [
              // Render Left Page
              m("div.book-page-left", renderLeftPage()),
              // Render Right Page
              m("div.book-page-right", renderRightPage()),
              state.bookPage === "creator"
                ? m("div.creator-center-stage", [
                    m("div.book-frame-title", "Character"),
                    m(DesktopPreview),
                  ])
                : null,
              state.bookPage === "creator"
                ? m("div.creator-bottom-actions", [
                    m(ActionBar, { catalog }),
                    m(PlanSelector),
                  ])
                : null,
            ],
          ),
        ],
      ),

      // Global Modals / Overlays
      m(CommandPaletteModal),
      m(ShortcutHelpModal),
      m(OnboardingModal, { catalog }),
      m(AboutModal),
      m(CreditsPreviewModal),
      m(LicenseGateModal),
      m(ConfirmDialogModal),
      m(NotificationCenter),
    ]);
  },
};
