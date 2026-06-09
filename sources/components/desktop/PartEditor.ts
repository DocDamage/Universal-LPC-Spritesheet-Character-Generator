// Interactive Pixel Editor for character parts and accessories
import m from "mithril";
import { state } from "../../state/state.ts";
import {
  registerEditorContext,
  unregisterEditorContext,
} from "../../state/commands.ts";
import { get2DContext } from "../../canvas/canvas-utils.ts";
import { FRAME_SIZE } from "../../state/constants.ts";

import type { PartEditorState } from "./part-editor/types.ts";

import { MIN_EDITOR_ZOOM, MAX_EDITOR_ZOOM } from "./part-editor/types.ts";
import {
  clampEditorZoom,
  initializePartEditorState,
} from "./part-editor/state.ts";

export { createPartEditorStateForTests } from "./part-editor/state.ts";

import {
  createDirectionCanvases,
  drawMainGrid,
  cloneDirectionCanvases,
  composeLayersIntoCanvases,
} from "./part-editor/canvas.ts";
import { recomposeCanvases } from "./part-editor/canvas.ts";
import { getActiveLayer, resetEditLayers } from "./part-editor/layers.ts";
import {
  copySelection,
  pasteClipboard,
  getCanvasPoint,
} from "./part-editor/selection.ts";
import { isShapeTool } from "./part-editor/shapes.ts";
import { transformActivePixels } from "./part-editor/transform.ts";
import {
  getAnimationLabel,
  switchEditorContext,
  stopPlayback,
  applyGlobalToFrame,
} from "./part-editor/animation.ts";
import {
  undo,
  redo,
  createEditorContextSnapshot,
  resetCanvases,
} from "./part-editor/history.ts";
import {
  handleTouchStart,
  handleTouchMove,
  handleTouchEnd,
} from "./part-editor/touch.ts";
import { handleEditorShortcut } from "./part-editor/keyboard.ts";
import { loadPartEditorItemIfNeeded } from "./part-editor/load-item.ts";
import {
  renderProPanel,
  renderStatusBar,
  renderRecoveryPrompt,
} from "./part-editor/panels.ts";
import { canUseFeature } from "../../state/feature-gates.ts";
import { saveCustomPartFromEditor } from "./part-editor/save-custom-part.ts";
import { createCanvasInteractionHandlers } from "./part-editor/canvas-interactions.ts";

import {
  addEditLayer,
  duplicateActiveLayer,
  moveActiveLayer,
  deleteActiveLayer,
  mergeActiveLayerDown,
  flattenVisibleLayers,
  getActiveLayerIndex,
} from "./part-editor/layers.ts";
import { isFrameDirty } from "./part-editor/animation.ts";
import { nudgeSelection } from "./part-editor/selection.ts";
import { QUICK_COLORS, getFrameContextKey } from "./part-editor/types.ts";

export type {
  PartEditorState,
  EditorLayer,
  EditorSnapshot,
  EditorContextSnapshot,
  OnionCanvases,
  SelectionRect,
  SelectionMoveState,
  SelectionClipboard,
  FrameOverride,
  ShapeTool,
  TransformOperation,
  RgbColor,
  EditorWheelZoomInput,
  EditorWheelZoomUpdate,
} from "./part-editor/types.ts";

export { getEditorWheelZoomUpdate } from "./part-editor/state.ts";

export const PartEditor: m.Component<Record<string, never>, PartEditorState> = {
  oninit(vnode) {
    initializePartEditorState(vnode.state);
  },

  oncreate(vnode) {
    registerEditorContext(vnode.state);
    vnode.state.keyboardHandler = (e: KeyboardEvent) => {
      handleEditorShortcut(e, vnode.state);
    };
    window.addEventListener("keydown", vnode.state.keyboardHandler);

    // Task 1: beforeunload warning
    vnode.state.beforeunloadHandler = (e: BeforeUnloadEvent) => {
      if (vnode.state.unsavedChanges && vnode.state.baseItemId) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", vnode.state.beforeunloadHandler);
  },

  onremove(vnode) {
    unregisterEditorContext();
    if (vnode.state.keyboardHandler) {
      window.removeEventListener("keydown", vnode.state.keyboardHandler);
    }
    if (vnode.state.beforeunloadHandler) {
      window.removeEventListener(
        "beforeunload",
        vnode.state.beforeunloadHandler,
      );
    }
    // Task 6: stop playback
    stopPlayback(vnode.state);
    // Task 1 & 9: clear timers
    if (vnode.state.autosaveDebounceTimer) {
      window.clearTimeout(vnode.state.autosaveDebounceTimer);
    }
    if (vnode.state.recomposeDebounceTimer) {
      window.clearTimeout(vnode.state.recomposeDebounceTimer);
    }
  },

  view(vnode) {
    const editing = state.editingPart;
    if (!editing) {
      return m("div.part-editor-empty", [
        m("span.part-editor-empty-icon", "✏️"),
        m("p", "No part selected"),
      ]);
    }

    if (!canUseFeature("advanced-editor")) {
      return m("div.part-editor-empty", [
        m("span.part-editor-empty-icon", "Pro"),
        m("p", "Advanced part editing is available in Pro."),
      ]);
    }

    loadPartEditorItemIfNeeded(vnode.state, editing);

    if (vnode.state.loading) {
      return m("div.part-editor-loading", [
        m("div.spinner"),
        m("p.mt-2", "Loading spritesheet..."),
      ]);
    }

    const activeCanvas = vnode.state.canvases[vnode.state.activeDirection];
    const canvasDisplaySize = `${FRAME_SIZE * vnode.state.zoom}px`;
    const editorModeLabel = vnode.state.frameMode
      ? `${getAnimationLabel(vnode.state.frameAnimation)} F${vnode.state.frameIndex + 1}`
      : "GLOBAL";

    const setZoom = (zoom: number) => {
      vnode.state.zoom = clampEditorZoom(zoom);
    };

    const canvasHandlers = createCanvasInteractionHandlers({
      editorState: vnode.state,
      setZoom,
    });

    const handleSave = async () => {
      await saveCustomPartFromEditor(vnode.state, editing.slotLabel);
    };

    return m(
      "div.part-editor",
      {
        class: [
          vnode.state.isFullscreen ? "part-editor-fullscreen" : "",
          vnode.state.isTouchDevice ? "part-editor-mobile" : "",
        ]
          .filter(Boolean)
          .join(" "),
      },
      [
        vnode.state.showRecoveryPrompt
          ? renderRecoveryPrompt(vnode.state)
          : null,
        m("div.part-editor-header", [
          m("h3", `Sprite Part Editor`),
          m("div.part-editor-header-actions", [
            m(
              "button.part-editor-header-button",
              {
                type: "button",
                title: vnode.state.isFullscreen
                  ? "Exit fullscreen editor (F or Esc)"
                  : "Fullscreen editor (F)",
                onclick: () => {
                  vnode.state.isFullscreen = !vnode.state.isFullscreen;
                },
              },
              vnode.state.isFullscreen ? "⤢" : "⛶",
            ),
            m(
              "button.part-editor-close",
              {
                type: "button",
                title: "Close editor",
                onclick: () => {
                  if (vnode.state.unsavedChanges && vnode.state.baseItemId) {
                    const confirmed = window.confirm(
                      "You have unsaved changes. Discard them?",
                    );
                    if (!confirmed) return;
                  }
                  state.editingPart = null;
                },
              },
              "✕",
            ),
          ]),
        ]),

        m("div.part-editor-body", [
          m("div.part-editor-main-tools", [
            // Item info
            m("div.field.mb-2", [
              m("label.label.is-small", "Custom Part Name"),
              m("input.input.is-small", {
                type: "text",
                title: "Custom part name",
                placeholder: "Enter a name for this custom part...",
                value: vnode.state.name,
                oninput: (e: Event) => {
                  vnode.state.name = (e.target as HTMLInputElement).value;
                },
              }),
            ]),

            // Tool bar
            m("div.part-editor-toolbar.mb-2", [
              m(
                "span",
                {
                  style: {
                    fontSize: "9px",
                    color: "var(--text-muted)",
                    marginRight: "2px",
                    textTransform: "uppercase",
                    letterSpacing: "0.8px",
                    fontWeight: "600",
                  },
                },
                "Tools:",
              ),
              m(
                "button.button.is-small",
                {
                  class: vnode.state.tool === "pen" ? "is-active" : "",
                  onclick: () => (vnode.state.tool = "pen"),
                  title:
                    "Pencil tool (B or P). Hold Shift for a straight line.",
                },
                "✏️",
              ),
              m(
                "button.button.is-small",
                {
                  class: vnode.state.tool === "eraser" ? "is-active" : "",
                  onclick: () => (vnode.state.tool = "eraser"),
                  title: "Eraser tool (E)",
                },
                "🧹",
              ),
              m(
                "button.button.is-small",
                {
                  class: vnode.state.tool === "picker" ? "is-active" : "",
                  onclick: () => (vnode.state.tool = "picker"),
                  title:
                    "Eyedropper tool (I). Hold Alt while drawing to sample.",
                },
                "💉",
              ),
              vnode.state.isFullscreen
                ? m(
                    "button.button.is-small",
                    {
                      class: vnode.state.tool === "select" ? "is-active" : "",
                      onclick: () => (vnode.state.tool = "select"),
                      title:
                        "Rectangular selection (M). Drag to select; drag inside to move.",
                    },
                    "▧",
                  )
                : null,
              vnode.state.isFullscreen
                ? m(
                    "button.button.is-small",
                    {
                      class: vnode.state.tool === "line" ? "is-active" : "",
                      onclick: () => (vnode.state.tool = "line"),
                      title: "Line tool (L). Drag to draw a straight segment.",
                    },
                    "╱",
                  )
                : null,
              vnode.state.isFullscreen
                ? m(
                    "button.button.is-small",
                    {
                      class: vnode.state.tool === "rect" ? "is-active" : "",
                      onclick: () => (vnode.state.tool = "rect"),
                      title: "Rectangle tool (R). Toggle Fill in pro tools.",
                    },
                    "□",
                  )
                : null,
              vnode.state.isFullscreen
                ? m(
                    "button.button.is-small",
                    {
                      class: vnode.state.tool === "ellipse" ? "is-active" : "",
                      onclick: () => (vnode.state.tool = "ellipse"),
                      title: "Ellipse tool (O). Toggle Fill in pro tools.",
                    },
                    "○",
                  )
                : null,
              vnode.state.isFullscreen
                ? m(
                    "button.button.is-small",
                    {
                      class: vnode.state.tool === "fill" ? "is-active" : "",
                      onclick: () => (vnode.state.tool = "fill"),
                      title: "Flood fill tool (G)",
                    },
                    "▣",
                  )
                : null,
              m("input.part-editor-color-picker", {
                type: "color",
                value: vnode.state.activeColor,
                title: "Active color",
                oninput: (e: Event) => {
                  vnode.state.activeColor = (
                    e.target as HTMLInputElement
                  ).value;
                },
              }),
              m("div", { style: { flex: "1" } }),
              m(
                "button.button.is-small",
                {
                  onclick: () => undo(vnode.state),
                  disabled: vnode.state.historyIndex <= 0,
                  title: "Undo last stroke (Ctrl+Z)",
                },
                "↩",
              ),
              m(
                "button.button.is-small",
                {
                  onclick: () => redo(vnode.state),
                  disabled:
                    vnode.state.historyIndex >= vnode.state.history.length - 1,
                  title: "Redo edit (Ctrl+Y or Ctrl+Shift+Z)",
                },
                "↪",
              ),
              m(
                "button.button.is-small",
                {
                  onclick: () => resetCanvases(vnode.state),
                  title: "Reset all directions to original sprite",
                },
                "🗑",
              ),
            ]),

            // Quick Palette colors
            m(
              "div.part-editor-palette.mb-2",
              QUICK_COLORS.map((color) =>
                m("div.part-editor-swatch", {
                  key: color,
                  style: { backgroundColor: color },
                  class: vnode.state.activeColor === color ? "active" : "",
                  title: `Use ${color}`,
                  onclick: () => {
                    vnode.state.activeColor = color;
                    vnode.state.tool = "pen";
                  },
                }),
              ),
            ),

            // Auto propagate check
            m("div.part-editor-propagate-container.mb-2", [
              m(
                "label.checkbox.is-small.part-editor-propagate-label",
                {
                  title: "Copy front-view edits to side and back views",
                },
                [
                  m("input", {
                    type: "checkbox",
                    checked: vnode.state.autoPropagate,
                    onchange: (e: Event) => {
                      vnode.state.autoPropagate = (
                        e.target as HTMLInputElement
                      ).checked;
                    },
                  }),
                  " Auto-propagate front view to sides & back",
                ],
              ),
            ]),

            // Main Drawing Area
            m("div.part-editor-canvas-container.mb-2", [
              m("div.part-editor-canvas-header", [
                m(
                  "span",
                  `${vnode.state.activeDirection.toUpperCase()} VIEW  ·  ${vnode.state.tool.toUpperCase()} MODE  ·  ${editorModeLabel}  ·  64×64`,
                ),
                m("div.part-editor-zoom-controls", [
                  m(
                    "button.part-editor-zoom-button",
                    {
                      type: "button",
                      title: "Zoom out",
                      disabled: vnode.state.zoom <= MIN_EDITOR_ZOOM,
                      onclick: () => setZoom(vnode.state.zoom - 1),
                    },
                    "−",
                  ),
                  m("input.part-editor-zoom-slider", {
                    type: "range",
                    min: String(MIN_EDITOR_ZOOM),
                    max: String(MAX_EDITOR_ZOOM),
                    step: "1",
                    value: String(vnode.state.zoom),
                    title: "Editor zoom",
                    oninput: (e: Event) => {
                      setZoom(Number((e.target as HTMLInputElement).value));
                    },
                  }),
                  m("span.part-editor-zoom-value", `${vnode.state.zoom}x`),
                  m(
                    "button.part-editor-zoom-button",
                    {
                      type: "button",
                      title: "Zoom in",
                      disabled: vnode.state.zoom >= MAX_EDITOR_ZOOM,
                      onclick: () => setZoom(vnode.state.zoom + 1),
                    },
                    "+",
                  ),
                ]),
              ]),
              m(
                "div.part-editor-canvas-stage",
                {
                  title:
                    "Scroll over the canvas to zoom. Two-finger drag to pan, pinch to zoom.",
                  onwheel: canvasHandlers.handleCanvasWheel,
                  ontouchstart: (e: TouchEvent) => {
                    handleTouchStart(e, vnode.state);
                  },
                  ontouchmove: (e: TouchEvent) => {
                    handleTouchMove(e, vnode.state);
                    if (e.touches.length === 2 && vnode.state.lastTouchCenter) {
                      const currentCenter = {
                        x: (e.touches[0]!.clientX + e.touches[1]!.clientX) / 2,
                        y: (e.touches[0]!.clientY + e.touches[1]!.clientY) / 2,
                      };
                      const dx =
                        currentCenter.x - vnode.state.lastTouchCenter.x;
                      const dy =
                        currentCenter.y - vnode.state.lastTouchCenter.y;
                      const stage = e.currentTarget as HTMLElement;
                      stage.scrollLeft -= dx;
                      stage.scrollTop -= dy;
                      vnode.state.lastTouchCenter = currentCenter;
                    }
                  },
                  ontouchend: () => {
                    handleTouchEnd(vnode.state);
                  },
                },
                [
                  m(
                    "div",
                    {
                      style: {
                        position: "relative",
                        width: canvasDisplaySize,
                        height: canvasDisplaySize,
                        margin: "0 auto",
                      },
                    },
                    [
                      vnode.state.referenceImageUrl
                        ? m("img", {
                            src: vnode.state.referenceImageUrl,
                            style: {
                              position: "absolute",
                              top: "0",
                              left: "0",
                              width: "100%",
                              height: "100%",
                              opacity: String(vnode.state.referenceOpacity),
                              pointerEvents: "none",
                              imageRendering: "pixelated",
                            },
                          })
                        : null,
                      m("canvas.editor-pixel-canvas", {
                        width: 64,
                        height: 64,
                        style: {
                          position: "absolute",
                          top: "0",
                          left: "0",
                          width: "100%",
                          height: "100%",
                          imageRendering: "pixelated",
                          backgroundImage: vnode.state.showGrid
                            ? undefined
                            : "none",
                          backgroundColor: vnode.state.referenceImageUrl
                            ? "transparent"
                            : undefined,
                          cursor:
                            vnode.state.tool === "picker"
                              ? "crosshair"
                              : vnode.state.tool === "select"
                                ? "crosshair"
                                : isShapeTool(vnode.state.tool)
                                  ? "crosshair"
                                  : vnode.state.tool === "eraser"
                                    ? "cell"
                                    : "crosshair",
                        },
                        oncreate: (vnodeDOM) => {
                          const el = vnodeDOM.dom as HTMLCanvasElement;
                          const ctx = get2DContext(el);
                          ctx.imageSmoothingEnabled = false;
                          drawMainGrid(ctx, activeCanvas, vnode.state);
                        },
                        onupdate: (vnodeDOM) => {
                          const el = vnodeDOM.dom as HTMLCanvasElement;
                          const ctx = get2DContext(el);
                          ctx.imageSmoothingEnabled = false;
                          drawMainGrid(ctx, activeCanvas, vnode.state);
                        },
                        onmousedown: (e: MouseEvent) => {
                          canvasHandlers.handleCanvasDown(
                            e,
                            e.target as HTMLCanvasElement,
                          );
                        },
                        onmousemove: (e: MouseEvent) => {
                          const canvasEl = e.target as HTMLCanvasElement;
                          const point = getCanvasPoint(e, canvasEl);
                          vnode.state.cursorPosition = point;
                          canvasHandlers.handleCanvasMove(e, canvasEl);
                        },
                        onmouseup: (e: MouseEvent) => {
                          canvasHandlers.handleCanvasUp(
                            e.target as HTMLCanvasElement,
                          );
                        },
                        onmouseleave: (e: MouseEvent) => {
                          vnode.state.cursorPosition = null;
                          canvasHandlers.handleCanvasLeave(
                            e.target as HTMLCanvasElement,
                          );
                        },
                      }),
                    ],
                  ),
                ],
              ),
            ]),

            // 4 directions thumbnail previews / selectors
            m("div.part-editor-directions-row.mb-3", [
              (["front", "back", "left", "right"] as const).map((dir) =>
                m(
                  "div.part-editor-dir-thumb",
                  {
                    key: dir,
                    class: vnode.state.activeDirection === dir ? "active" : "",
                    title: `Edit ${dir} view`,
                    onclick: () => {
                      vnode.state.activeDirection = dir;
                    },
                  },
                  [
                    m("canvas", {
                      width: 64,
                      height: 64,
                      style: {
                        width: "52px",
                        height: "52px",
                        imageRendering: "pixelated",
                      },
                      oncreate: (vnodeDOM) => {
                        const el = vnodeDOM.dom as HTMLCanvasElement;
                        const ctx = get2DContext(el);
                        ctx.clearRect(0, 0, 64, 64);
                        ctx.drawImage(vnode.state.canvases[dir], 0, 0);
                      },
                      onupdate: (vnodeDOM) => {
                        const el = vnodeDOM.dom as HTMLCanvasElement;
                        const ctx = get2DContext(el);
                        const cache = vnode.state.thumbnailCache?.[dir];
                        if (cache) {
                          ctx.clearRect(0, 0, 64, 64);
                          ctx.drawImage(cache, 0, 0);
                        } else {
                          ctx.clearRect(0, 0, 64, 64);
                          ctx.drawImage(vnode.state.canvases[dir], 0, 0);
                        }
                      },
                    }),
                    m("span.part-editor-dir-label", dir.toUpperCase()),
                  ],
                ),
              ),
            ]),

            // Save button
            m(
              "button.button.is-primary.is-fullwidth",
              {
                onclick: handleSave,
                title:
                  "Save your edits as a brand new custom part and add it to the character",
              },
              "💾 Save as New Custom Part",
            ),
          ]),
          vnode.state.isFullscreen ? renderProPanel(vnode.state) : null,
          renderStatusBar(vnode.state),
        ]),
      ],
    );
  },
};

export const partEditorTestApi = {
  addEditLayer,
  applyGlobalToFrame,
  cloneDirectionCanvases,
  composeLayersIntoCanvases,
  copySelection,
  createDirectionCanvases,
  createEditorContextSnapshot,
  deleteActiveLayer,
  duplicateActiveLayer,
  flattenVisibleLayers,
  getActiveLayer,
  getActiveLayerIndex,
  getFrameContextKey,
  isFrameDirty,
  mergeActiveLayerDown,
  moveActiveLayer,
  nudgeSelection,
  pasteClipboard,
  recomposeCanvases,
  resetEditLayers,
  switchEditorContext,
  transformActivePixels,
};
