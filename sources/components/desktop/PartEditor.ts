// Interactive Pixel Editor for character parts and accessories
import m from "mithril";
import { state } from "../../state/state.ts";
import { getSpritePath } from "../../state/path.ts";
import {
  getItemMerged,
  registerCustomPart,
  defaultCatalog,
} from "../../state/catalog.ts";
import {
  registerEditorContext,
  unregisterEditorContext,
} from "../../state/commands.ts";
import { loadImage } from "../../canvas/load-image.ts";
import { get2DContext } from "../../canvas/canvas-utils.ts";
import { SLOT_CONFIG, clearSlotSelections } from "./slot-config.ts";
import { customAnimations } from "../../custom-animations.ts";
import { clamp, variantToFilename } from "../../utils/helpers.ts";
import { debugWarn } from "../../utils/debug.ts";
import { getMultiRecolors } from "../../state/palettes.ts";
import { FRAME_SIZE } from "../../state/constants.ts";
import { clearDraft } from "../../state/editor-autosave.ts";
import {
  applyBrush,
  applyFill,
  DIRECTIONS,
  getLinePoints,
  sampleColor,
} from "./pixel-editor-tools.ts";

import type { PartEditorState } from "./part-editor/types.ts";

import {
  MIN_EDITOR_ZOOM,
  MAX_EDITOR_ZOOM,
  DEFAULT_EDITOR_ZOOM,
} from "./part-editor/types.ts";
import {
  clampEditorZoom,
  getEditorWheelZoomUpdate,
} from "./part-editor/state.ts";

export { createPartEditorStateForTests } from "./part-editor/state.ts";

import {
  createDirectionCanvases,
  cropFrame,
  drawMainGrid,
  cloneDirectionCanvases,
  composeLayersIntoCanvases,
} from "./part-editor/canvas.ts";
import {
  recomposeCanvases,
  refreshVisibleCanvas,
} from "./part-editor/canvas.ts";
import {
  getActiveLayer,
  getActiveLayerToolState,
  resetEditLayers,
} from "./part-editor/layers.ts";
import {
  startSelectionInteraction,
  updateSelectionInteraction,
  finishSelectionInteraction,
  clearSelectionState,
  copySelection,
  pasteClipboard,
  getCanvasPoint,
} from "./part-editor/selection.ts";
import {
  isShapeTool,
  startShapeInteraction,
  finishShapeInteraction,
} from "./part-editor/shapes.ts";
import { transformActivePixels } from "./part-editor/transform.ts";
import {
  getAnimationLabel,
  getAvailableFrameAnimations,
  switchEditorContext,
  stopPlayback,
  applyGlobalToFrame,
  saveActiveEditorContext,
} from "./part-editor/animation.ts";
import {
  buildEditedAnimationSheets,
  createFrameOverrides,
  createCanvasesFromContext,
} from "./part-editor/save.ts";
import {
  undo,
  redo,
  saveHistory,
  createEditorContextSnapshot,
  resetCanvases,
} from "./part-editor/history.ts";
import { checkForDraftRecovery } from "./part-editor/autosave.ts";
import {
  handleTouchStart,
  handleTouchMove,
  handleTouchEnd,
} from "./part-editor/touch.ts";
import { handleEditorShortcut } from "./part-editor/keyboard.ts";
import {
  renderProPanel,
  renderStatusBar,
  renderRecoveryPrompt,
} from "./part-editor/panels.ts";

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
    vnode.state.loading = false;
    vnode.state.baseItemId = null;
    vnode.state.name = "";
    vnode.state.activeEditorTab = "edit";
    vnode.state.activeDirection = "front";
    vnode.state.tool = "pen";
    vnode.state.activeColor = "#ff0000";
    vnode.state.autoPropagate = true;
    vnode.state.isDrawing = false;
    vnode.state.zoom = DEFAULT_EDITOR_ZOOM;
    vnode.state.brushSize = 1;
    vnode.state.mirrorX = false;
    vnode.state.mirrorY = false;
    vnode.state.showGrid = true;
    vnode.state.isFullscreen = false;
    vnode.state.shapeStart = null;
    vnode.state.shapeEnd = null;
    vnode.state.shapeFilled = false;
    vnode.state.lastPoint = null;
    vnode.state.selectionRect = null;
    vnode.state.selectionDraftStart = null;
    vnode.state.selectionMove = null;
    vnode.state.clipboard = null;
    vnode.state.keyboardHandler = null;
    vnode.state.history = [];
    vnode.state.historyIndex = -1;

    vnode.state.canvases = createDirectionCanvases();
    vnode.state.originalCanvases = createDirectionCanvases();
    vnode.state.editLayers = [];
    vnode.state.activeLayerId = null;
    vnode.state.nextLayerNumber = 1;
    vnode.state.globalEditorContext = null;
    vnode.state.frameEditorContexts = {};
    vnode.state.availableFrameAnimations = ["walk"];
    vnode.state.frameMode = false;
    vnode.state.frameAnimation = "walk";
    vnode.state.frameIndex = 0;
    vnode.state.onionSkin = false;
    vnode.state.onionOpacity = 0.28;
    vnode.state.onionCanvases = null;
    vnode.state.referenceImageUrl = null;
    vnode.state.referenceOpacity = 0.3;
    vnode.state.replaceFromColor = "#000000";
    vnode.state.replaceToColor = "#ff0000";
    vnode.state.replaceTolerance = 0;
    vnode.state.replaceAllDirections = false;
    vnode.state.transformAllDirections = false;
    vnode.state.alphaLocked = false;

    // Task 1: Autosave
    vnode.state.showRecoveryPrompt = false;
    vnode.state.autosaveDebounceTimer = null;
    vnode.state.unsavedChanges = false;
    vnode.state.beforeunloadHandler = null;

    // Task 2: Status bar
    vnode.state.cursorPosition = null;

    // Task 6: Animation playback
    vnode.state.isPlaying = false;
    vnode.state.playbackTimer = null;

    // Task 8: Mobile/touch
    vnode.state.isTouchDevice =
      window.matchMedia("(hover: none)").matches ||
      window.matchMedia("(max-width: 768px)").matches ||
      "ontouchstart" in window;
    vnode.state.touchStartDist = 0;
    vnode.state.touchStartZoom = DEFAULT_EDITOR_ZOOM;
    vnode.state.lastTouchCenter = null;

    // Task 9: Performance
    vnode.state.thumbnailCache = null;
    vnode.state.recomposeDebounceTimer = null;

    resetEditLayers(vnode.state);
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

    // Load new item if selection changed
    if (vnode.state.baseItemId !== editing.itemId) {
      vnode.state.baseItemId = editing.itemId;
      vnode.state.loading = true;
      vnode.state.history = [];
      vnode.state.historyIndex = -1;
      vnode.state.frameMode = false;
      vnode.state.frameIndex = 0;
      vnode.state.frameEditorContexts = {};
      vnode.state.globalEditorContext = null;
      vnode.state.onionCanvases = null;
      clearSelectionState(vnode.state, false);

      const meta = getItemMerged(editing.itemId).unwrapOr(null);
      if (meta) {
        vnode.state.name = `Custom ${meta.name}`;
        vnode.state.availableFrameAnimations =
          getAvailableFrameAnimations(meta);
        vnode.state.frameAnimation =
          vnode.state.availableFrameAnimations[0] ?? "walk";

        // Standard animation sheets already contain four direction rows.
        const firstAnim = meta.animations?.[0] ?? "walk";
        const isCustomOnly = !!(
          firstAnim &&
          customAnimations &&
          (customAnimations as Record<string, unknown>)[firstAnim]
        );

        let imagePromise: Promise<HTMLImageElement> | null = null;
        const selection = state.selections[meta.type_name];
        const itemVariant = selection?.variant ?? "";
        const recolors = getMultiRecolors(editing.itemId, state.selections);

        if (isCustomOnly) {
          // Custom animation: load directly from the layer path
          const layerKey = "layer_1";
          const layer = meta.layers?.[layerKey];
          if (layer) {
            const basePath = layer[state.bodyType] as string | undefined;
            if (basePath) {
              const spritePath = `spritesheets/${basePath}${variantToFilename(itemVariant || (meta.variants?.[0] ?? ""))}.png`;
              imagePromise = loadImage(spritePath);
            }
          }
        }

        if (!imagePromise) {
          // Standard: use walk animation path
          const pathResult = getSpritePath(
            editing.itemId,
            itemVariant || null,
            recolors,
            state.bodyType,
            "walk",
            1,
            state.selections,
            meta,
          );
          if (pathResult.isOk()) {
            imagePromise = loadImage(pathResult.value);
          }
        }

        if (imagePromise) {
          imagePromise
            .then((img) => {
              const frames = {
                back: cropFrame(img, 0, 0),
                left: cropFrame(img, 1, 0),
                front: cropFrame(img, 2, 0),
                right: cropFrame(img, 3, 0),
              };
              for (const key of DIRECTIONS) {
                const originalCtx = get2DContext(
                  vnode.state.originalCanvases[key],
                );
                originalCtx.clearRect(0, 0, 64, 64);
                originalCtx.drawImage(frames[key], 0, 0);
              }
              resetEditLayers(vnode.state);
              recomposeCanvases(vnode.state);
              vnode.state.loading = false;
              saveHistory(vnode.state);
              vnode.state.globalEditorContext = createEditorContextSnapshot(
                vnode.state,
              );
              void checkForDraftRecovery(vnode.state, editing.itemId);
              m.redraw();
            })
            .catch((err) => {
              debugWarn(
                "Failed to load spritesheet for editing, starting with blank canvas:",
                err,
              );
              // Start with blank canvases instead of failing
              for (const key of DIRECTIONS) {
                get2DContext(vnode.state.originalCanvases[key]).clearRect(
                  0,
                  0,
                  64,
                  64,
                );
              }
              resetEditLayers(vnode.state);
              recomposeCanvases(vnode.state);
              vnode.state.loading = false;
              saveHistory(vnode.state);
              vnode.state.globalEditorContext = createEditorContextSnapshot(
                vnode.state,
              );
              void checkForDraftRecovery(vnode.state, editing.itemId);
              m.redraw();
            });
        } else {
          // No image could be loaded - start with blank canvases
          for (const key of DIRECTIONS) {
            get2DContext(vnode.state.originalCanvases[key]).clearRect(
              0,
              0,
              64,
              64,
            );
          }
          resetEditLayers(vnode.state);
          recomposeCanvases(vnode.state);
          vnode.state.loading = false;
          saveHistory(vnode.state);
          vnode.state.globalEditorContext = createEditorContextSnapshot(
            vnode.state,
          );
          void checkForDraftRecovery(vnode.state, editing.itemId);
        }
      } else {
        vnode.state.loading = false;
      }
    }

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

    const handleCanvasWheel = (e: WheelEvent) => {
      e.preventDefault();
      const stageEl = e.currentTarget as HTMLElement;
      const canvasEl = stageEl.querySelector(
        ".editor-pixel-canvas",
      ) as HTMLCanvasElement | null;
      const rect = canvasEl?.getBoundingClientRect();
      const pointerRatioX = rect
        ? clamp((e.clientX - rect.left) / rect.width, 0, 1)
        : 0.5;
      const pointerRatioY = rect
        ? clamp((e.clientY - rect.top) / rect.height, 0, 1)
        : 0.5;
      const zoomUpdate = getEditorWheelZoomUpdate({
        zoom: vnode.state.zoom,
        deltaY: e.deltaY,
        pointerRatioX,
        pointerRatioY,
      });
      if (!zoomUpdate.changed) return;

      setZoom(zoomUpdate.nextZoom);
      requestAnimationFrame(() => {
        stageEl.scrollLeft += zoomUpdate.scrollLeftDelta;
        stageEl.scrollTop += zoomUpdate.scrollTopDelta;
      });
    };

    const drawOnMain = (e: MouseEvent, canvasEl: HTMLCanvasElement) => {
      const point = getCanvasPoint(e, canvasEl);
      if (point) {
        const tool = e.altKey ? "picker" : vnode.state.tool;
        if (tool === "select" || isShapeTool(tool)) return;

        if (tool === "picker") {
          const sampledColor = sampleColor(vnode.state, point);
          if (sampledColor) {
            vnode.state.activeColor = sampledColor;
          }
          vnode.state.tool = "pen";
          vnode.state.lastPoint = point;
          return;
        }

        const layerState = getActiveLayerToolState(vnode.state);
        if (!layerState) return;

        if (tool === "fill") {
          applyFill(layerState, point);
          recomposeCanvases(vnode.state);
          refreshVisibleCanvas(canvasEl, vnode.state);
          vnode.state.lastPoint = point;
          return;
        }

        const points =
          e.shiftKey && vnode.state.lastPoint
            ? getLinePoints(vnode.state.lastPoint, point)
            : [point];

        for (const p of points) {
          applyBrush(layerState, p, tool === "eraser" ? "erase" : "paint");
        }
        recomposeCanvases(vnode.state);
        refreshVisibleCanvas(canvasEl, vnode.state);
        vnode.state.lastPoint = point;
      }
    };

    const handleCanvasDown = (e: MouseEvent, canvasEl: HTMLCanvasElement) => {
      const point = getCanvasPoint(e, canvasEl);
      if (!point) return;

      if (vnode.state.tool === "select" && !e.altKey) {
        vnode.state.isDrawing = false;
        startSelectionInteraction(vnode.state, point);
        recomposeCanvases(vnode.state);
        refreshVisibleCanvas(canvasEl, vnode.state);
        return;
      }

      if (isShapeTool(vnode.state.tool) && !e.altKey) {
        vnode.state.isDrawing = false;
        startShapeInteraction(vnode.state, point);
        refreshVisibleCanvas(canvasEl, vnode.state);
        return;
      }

      vnode.state.isDrawing = true;
      drawOnMain(e, canvasEl);
    };

    const handleCanvasMove = (e: MouseEvent, canvasEl: HTMLCanvasElement) => {
      const point = getCanvasPoint(e, canvasEl);
      if (!point) return;

      if (vnode.state.selectionDraftStart || vnode.state.selectionMove) {
        updateSelectionInteraction(vnode.state, point);
        recomposeCanvases(vnode.state);
        refreshVisibleCanvas(canvasEl, vnode.state);
        return;
      }

      if (vnode.state.shapeStart) {
        vnode.state.shapeEnd = point;
        refreshVisibleCanvas(canvasEl, vnode.state);
        return;
      }

      if (vnode.state.isDrawing) {
        drawOnMain(e, canvasEl);
      }
    };

    const handleCanvasUp = (canvasEl: HTMLCanvasElement) => {
      const movedSelection = finishSelectionInteraction(vnode.state);
      if (movedSelection) {
        saveHistory(vnode.state);
      }

      const drewShape = finishShapeInteraction(vnode.state);
      if (drewShape) {
        saveHistory(vnode.state);
      }

      if (vnode.state.isDrawing) {
        vnode.state.isDrawing = false;
        saveHistory(vnode.state);
      }

      recomposeCanvases(vnode.state);
      refreshVisibleCanvas(canvasEl, vnode.state);
      m.redraw();
    };

    const handleCanvasLeave = (canvasEl: HTMLCanvasElement) => {
      if (
        !vnode.state.isDrawing &&
        !vnode.state.selectionDraftStart &&
        !vnode.state.selectionMove &&
        !vnode.state.shapeStart
      ) {
        return;
      }

      handleCanvasUp(canvasEl);
    };

    const handleSave = async () => {
      if (!vnode.state.baseItemId) return;
      const baseId = vnode.state.baseItemId;
      const meta = getItemMerged(baseId).unwrapOr(null);
      if (!meta) return;

      vnode.state.loading = true;
      try {
        recomposeCanvases(vnode.state);
        saveActiveEditorContext(vnode.state);
        const globalContext =
          vnode.state.globalEditorContext ??
          createEditorContextSnapshot(vnode.state);
        const globalCanvases = await createCanvasesFromContext(globalContext);
        const frameOverrides = await createFrameOverrides(vnode.state);
        const sheets = await buildEditedAnimationSheets(
          baseId,
          meta,
          globalCanvases.originalCanvases,
          globalCanvases.editedCanvases,
          frameOverrides,
        );
        const firstSheet = sheets["walk"] ?? Object.values(sheets)[0];
        if (!firstSheet) {
          throw new Error("No editable animation sheets could be generated.");
        }

        const customPartId = `custom_part_${Date.now()}`;
        const currentSelection = state.selections[meta.type_name];
        const customName = vnode.state.name.trim() || `Custom ${meta.name}`;

        registerCustomPart({
          itemId: customPartId,
          name: customName,
          type_name: meta.type_name,
          baseItemId: baseId,
          sheets,
          image: firstSheet,
        });

        // Add to state and select it
        const slot = SLOT_CONFIG.find((s) => s.label === editing.slotLabel);
        if (slot) {
          clearSlotSelections(slot, defaultCatalog);
        }
        state.selections[meta.type_name] = {
          itemId: customPartId,
          variant: currentSelection?.variant ?? null,
          recolor: currentSelection?.recolor ?? null,
          name: customName,
        };

        state.editingPart = null; // Close editor
        vnode.state.baseItemId = null;
        vnode.state.unsavedChanges = false;
        if (baseId) {
          void clearDraft(baseId);
        }

        // Force character redraw
        m.redraw();
      } catch (err) {
        console.error("Failed to save custom part:", err);
      } finally {
        vnode.state.loading = false;
      }
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
                  onwheel: handleCanvasWheel,
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
                          handleCanvasDown(e, e.target as HTMLCanvasElement);
                        },
                        onmousemove: (e: MouseEvent) => {
                          const canvasEl = e.target as HTMLCanvasElement;
                          const point = getCanvasPoint(e, canvasEl);
                          vnode.state.cursorPosition = point;
                          handleCanvasMove(e, canvasEl);
                        },
                        onmouseup: (e: MouseEvent) => {
                          handleCanvasUp(e.target as HTMLCanvasElement);
                        },
                        onmouseleave: (e: MouseEvent) => {
                          vnode.state.cursorPosition = null;
                          handleCanvasLeave(e.target as HTMLCanvasElement);
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
