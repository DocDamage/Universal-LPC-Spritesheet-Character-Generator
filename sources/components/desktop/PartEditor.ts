// Interactive Pixel Editor for character parts and accessories
import m from "mithril";
import { state } from "../../state/state.ts";
import { getSpritePath } from "../../state/path.ts";
import {
  getItemMerged,
  registerCustomPart,
  defaultCatalog,
} from "../../state/catalog.ts";
import { loadImage } from "../../canvas/load-image.ts";
import { get2DContext } from "../../canvas/canvas-utils.ts";
import { SLOT_CONFIG, clearSlotSelections } from "./slot-config.ts";
import { customAnimations } from "../../custom-animations.ts";
import { variantToFilename } from "../../utils/helpers.ts";
import { getMultiRecolors } from "../../state/palettes.ts";
import { ANIMATION_OFFSETS, FRAME_SIZE } from "../../state/constants.ts";
import type { ItemMerged } from "../../state/catalog.ts";
import {
  applyBrush,
  applyFill,
  clampBrushSize,
  DIRECTIONS,
  getLinePoints,
  MAX_BRUSH_SIZE,
  MIN_BRUSH_SIZE,
  sampleColor,
  type Direction,
  type PixelEditorToolState,
  type Point,
} from "./pixel-editor-tools.ts";

type PartEditorState = PixelEditorToolState & {
  loading: boolean;
  baseItemId: string | null;
  name: string;
  originalCanvases: Record<Direction, HTMLCanvasElement>;
  editLayers: EditorLayer[];
  activeLayerId: string | null;
  nextLayerNumber: number;
  isDrawing: boolean;
  zoom: number;
  showGrid: boolean;
  isFullscreen: boolean;
  lastPoint: Point | null;
  selectionRect: SelectionRect | null;
  selectionDraftStart: Point | null;
  selectionMove: SelectionMoveState | null;
  clipboard: SelectionClipboard | null;
  keyboardHandler: ((e: KeyboardEvent) => void) | null;

  // Undo history
  history: string[]; // Store JSON snapshots of edit layers
  historyIndex: number;
};

type EditorLayer = {
  id: string;
  name: string;
  canvases: Record<Direction, HTMLCanvasElement>;
  visible: boolean;
  opacity: number;
};

type EditorLayerSnapshot = {
  id: string;
  name: string;
  visible: boolean;
  opacity: number;
  canvases: Record<Direction, string>;
};

type EditorSnapshot = {
  activeLayerId: string | null;
  nextLayerNumber: number;
  layers: EditorLayerSnapshot[];
};

type SelectionRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type SelectionMoveState = {
  startPoint: Point;
  sourceRect: SelectionRect;
  baseCanvas: HTMLCanvasElement;
  imageData: ImageData;
  direction: Direction;
  layerId: string;
};

type SelectionClipboard = {
  width: number;
  height: number;
  imageData: ImageData;
};

const QUICK_COLORS = [
  "#000000",
  "#ffffff",
  "#888888",
  "#e0c090",
  "#ff0000",
  "#00ff00",
  "#0000ff",
  "#ffff00",
  "#ff8800",
  "#8b4513",
  "#4b0082",
  "#00ffff",
];

const DIRECTION_ROWS: Record<Direction, number> = {
  back: 0,
  left: 1,
  front: 2,
  right: 3,
};
const MIN_EDITOR_ZOOM = 2;
const MAX_EDITOR_ZOOM = 16;
const DEFAULT_EDITOR_ZOOM = 4;

function clampEditorZoom(value: number): number {
  return Math.min(MAX_EDITOR_ZOOM, Math.max(MIN_EDITOR_ZOOM, value));
}

function createDirectionCanvases(): Record<Direction, HTMLCanvasElement> {
  const canvases = {
    front: document.createElement("canvas"),
    back: document.createElement("canvas"),
    left: document.createElement("canvas"),
    right: document.createElement("canvas"),
  };
  for (const key of DIRECTIONS) {
    canvases[key].width = FRAME_SIZE;
    canvases[key].height = FRAME_SIZE;
  }
  return canvases;
}

function cropFrame(
  spritesheetImg: HTMLImageElement,
  row: number,
  col: number,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = FRAME_SIZE;
  canvas.height = FRAME_SIZE;
  const ctx = get2DContext(canvas);
  ctx.drawImage(
    spritesheetImg,
    col * FRAME_SIZE,
    row * FRAME_SIZE,
    FRAME_SIZE,
    FRAME_SIZE,
    0,
    0,
    FRAME_SIZE,
    FRAME_SIZE,
  );
  return canvas;
}

export const PartEditor: m.Component<{}, PartEditorState> = {
  oninit(vnode) {
    vnode.state.loading = false;
    vnode.state.baseItemId = null;
    vnode.state.name = "";
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
    resetEditLayers(vnode.state);
  },

  oncreate(vnode) {
    vnode.state.keyboardHandler = (e: KeyboardEvent) => {
      handleEditorShortcut(e, vnode.state);
    };
    window.addEventListener("keydown", vnode.state.keyboardHandler);
  },

  onremove(vnode) {
    if (vnode.state.keyboardHandler) {
      window.removeEventListener("keydown", vnode.state.keyboardHandler);
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
      clearSelectionState(vnode.state, false);

      const meta = getItemMerged(editing.itemId).unwrapOr(null);
      if (meta) {
        vnode.state.name = `Custom ${meta.name}`;

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
              m.redraw();
            })
            .catch((err) => {
              console.warn(
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

    const setZoom = (zoom: number) => {
      vnode.state.zoom = clampEditorZoom(zoom);
    };

    const handleCanvasWheel = (e: WheelEvent) => {
      e.preventDefault();
      const oldZoom = vnode.state.zoom;
      const nextZoom = clampEditorZoom(oldZoom + (e.deltaY < 0 ? 1 : -1));
      if (nextZoom === oldZoom) return;

      const stageEl = e.currentTarget as HTMLElement;
      const canvasEl = stageEl.querySelector(
        ".editor-pixel-canvas",
      ) as HTMLCanvasElement | null;
      const rect = canvasEl?.getBoundingClientRect();
      const pointerRatioX = rect
        ? Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
        : 0.5;
      const pointerRatioY = rect
        ? Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height))
        : 0.5;
      const sizeDelta = FRAME_SIZE * (nextZoom - oldZoom);

      setZoom(nextZoom);
      requestAnimationFrame(() => {
        stageEl.scrollLeft += sizeDelta * pointerRatioX;
        stageEl.scrollTop += sizeDelta * pointerRatioY;
      });
    };

    const drawOnMain = (e: MouseEvent, canvasEl: HTMLCanvasElement) => {
      const point = getCanvasPoint(e, canvasEl);
      if (point) {
        const tool = e.altKey ? "picker" : vnode.state.tool;
        if (tool === "select") return;

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

      if (vnode.state.isDrawing) {
        drawOnMain(e, canvasEl);
      }
    };

    const handleCanvasUp = (canvasEl: HTMLCanvasElement) => {
      const movedSelection = finishSelectionInteraction(vnode.state);
      if (movedSelection) {
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
        !vnode.state.selectionMove
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
        const sheets = await buildEditedAnimationSheets(
          baseId,
          meta,
          vnode.state.originalCanvases,
          vnode.state.canvases,
        );
        const firstSheet = sheets.walk ?? Object.values(sheets)[0];
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
        class: vnode.state.isFullscreen ? "part-editor-fullscreen" : "",
      },
      [
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
                  `${vnode.state.activeDirection.toUpperCase()} VIEW  ·  ${vnode.state.tool.toUpperCase()} MODE  ·  64×64`,
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
                  title: "Scroll over the canvas to zoom",
                  onwheel: handleCanvasWheel,
                },
                [
                  m("canvas.editor-pixel-canvas", {
                    width: 64,
                    height: 64,
                    style: {
                      width: canvasDisplaySize,
                      height: canvasDisplaySize,
                      imageRendering: "pixelated",
                      backgroundImage: vnode.state.showGrid
                        ? undefined
                        : "none",
                      cursor:
                        vnode.state.tool === "picker"
                          ? "crosshair"
                          : vnode.state.tool === "select"
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
                      handleCanvasMove(e, e.target as HTMLCanvasElement);
                    },
                    onmouseup: (e: MouseEvent) => {
                      handleCanvasUp(e.target as HTMLCanvasElement);
                    },
                    onmouseleave: (e: MouseEvent) => {
                      handleCanvasLeave(e.target as HTMLCanvasElement);
                    },
                  }),
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
                        ctx.clearRect(0, 0, 64, 64);
                        ctx.drawImage(vnode.state.canvases[dir], 0, 0);
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
        ]),
      ],
    );
  },
};

function renderProPanel(stateObj: PartEditorState): m.Children {
  const activeLayerIndex = getActiveLayerIndex(stateObj);
  const canMoveLayerDown = activeLayerIndex > 0;
  const canMoveLayerUp =
    activeLayerIndex >= 0 && activeLayerIndex < stateObj.editLayers.length - 1;
  const canMergeLayerDown = activeLayerIndex > 0;
  const canFlattenLayers = stateObj.editLayers.length > 1;

  return m("aside.part-editor-pro-panel", [
    m("div.part-editor-pro-section", [
      m("h4", "Brush"),
      m("label.part-editor-pro-field", [
        m("span", "Size"),
        m("input", {
          type: "range",
          min: String(MIN_BRUSH_SIZE),
          max: String(MAX_BRUSH_SIZE),
          step: "1",
          value: String(stateObj.brushSize),
          title: "Brush size ([ or ])",
          oninput: (e: Event) => {
            stateObj.brushSize = clampBrushSize(
              Number((e.target as HTMLInputElement).value),
            );
          },
        }),
        m("b", `${stateObj.brushSize}px`),
      ]),
    ]),
    m("div.part-editor-pro-section.part-editor-layers-section", [
      m("h4", "Layers"),
      m("div.part-editor-layer-actions", [
        m(
          "button.part-editor-pro-button",
          {
            type: "button",
            title: "Add a new edit layer (Ctrl+Shift+N)",
            onclick: () => addEditLayer(stateObj),
          },
          "+",
        ),
        m(
          "button.part-editor-pro-button",
          {
            type: "button",
            title: "Duplicate active layer (Ctrl+J)",
            disabled: activeLayerIndex < 0,
            onclick: () => duplicateActiveLayer(stateObj),
          },
          "Copy",
        ),
        m(
          "button.part-editor-pro-button",
          {
            type: "button",
            title: "Move active layer up",
            disabled: !canMoveLayerUp,
            onclick: () => moveActiveLayer(stateObj, 1),
          },
          "Up",
        ),
        m(
          "button.part-editor-pro-button",
          {
            type: "button",
            title: "Move active layer down",
            disabled: !canMoveLayerDown,
            onclick: () => moveActiveLayer(stateObj, -1),
          },
          "Down",
        ),
        m(
          "button.part-editor-pro-button",
          {
            type: "button",
            title: "Merge active layer down (Ctrl+E)",
            disabled: !canMergeLayerDown,
            onclick: () => mergeActiveLayerDown(stateObj),
          },
          "Merge",
        ),
        m(
          "button.part-editor-pro-button",
          {
            type: "button",
            title: "Flatten visible layers (Ctrl+Shift+E)",
            disabled: !canFlattenLayers,
            onclick: () => flattenVisibleLayers(stateObj),
          },
          "Flat",
        ),
        m(
          "button.part-editor-pro-button.part-editor-layer-delete",
          {
            type: "button",
            title: "Delete active layer",
            disabled: stateObj.editLayers.length <= 1 || activeLayerIndex < 0,
            onclick: () => deleteActiveLayer(stateObj),
          },
          "Del",
        ),
      ]),
      m(
        "div.part-editor-layer-list",
        stateObj.editLayers
          .slice()
          .reverse()
          .map((layer) =>
            m(
              "div.part-editor-layer-row",
              {
                key: layer.id,
                class: layer.id === stateObj.activeLayerId ? "active" : "",
                onclick: () => {
                  stateObj.activeLayerId = layer.id;
                },
              },
              [
                m("div.part-editor-layer-main", [
                  m(
                    "button.part-editor-layer-visibility",
                    {
                      type: "button",
                      title: layer.visible ? "Hide layer" : "Show layer",
                      onclick: (e: MouseEvent) => {
                        e.stopPropagation();
                        layer.visible = !layer.visible;
                        recomposeCanvases(stateObj);
                        saveHistory(stateObj);
                      },
                    },
                    layer.visible ? "On" : "Off",
                  ),
                  m("input.part-editor-layer-name", {
                    type: "text",
                    value: layer.name,
                    title: "Layer name",
                    onclick: (e: MouseEvent) => e.stopPropagation(),
                    oninput: (e: Event) => {
                      layer.name =
                        (e.target as HTMLInputElement).value || "Layer";
                    },
                    onchange: () => saveHistory(stateObj),
                  }),
                  m(
                    "span.part-editor-layer-opacity-value",
                    `${Math.round(layer.opacity * 100)}%`,
                  ),
                ]),
                m("input.part-editor-layer-opacity", {
                  type: "range",
                  min: "0",
                  max: "100",
                  step: "1",
                  value: String(Math.round(layer.opacity * 100)),
                  title: "Layer opacity",
                  onclick: (e: MouseEvent) => e.stopPropagation(),
                  oninput: (e: Event) => {
                    layer.opacity =
                      Number((e.target as HTMLInputElement).value) / 100;
                    recomposeCanvases(stateObj);
                  },
                  onchange: () => saveHistory(stateObj),
                }),
              ],
            ),
          ),
      ),
    ]),
    m("div.part-editor-pro-section", [
      m("h4", "Symmetry"),
      m(
        "label.part-editor-pro-toggle",
        {
          title: "Mirror strokes across the horizontal axis (X)",
        },
        [
          m("input", {
            type: "checkbox",
            checked: stateObj.mirrorX,
            onchange: (e: Event) => {
              stateObj.mirrorX = (e.target as HTMLInputElement).checked;
            },
          }),
          "Mirror X",
        ],
      ),
      m(
        "label.part-editor-pro-toggle",
        {
          title: "Mirror strokes across the vertical axis (Y)",
        },
        [
          m("input", {
            type: "checkbox",
            checked: stateObj.mirrorY,
            onchange: (e: Event) => {
              stateObj.mirrorY = (e.target as HTMLInputElement).checked;
            },
          }),
          "Mirror Y",
        ],
      ),
    ]),
    m("div.part-editor-pro-section", [
      m("h4", "View"),
      m(
        "label.part-editor-pro-toggle",
        {
          title: "Toggle pixel grid",
        },
        [
          m("input", {
            type: "checkbox",
            checked: stateObj.showGrid,
            onchange: (e: Event) => {
              stateObj.showGrid = (e.target as HTMLInputElement).checked;
            },
          }),
          "Pixel Grid",
        ],
      ),
      m(
        "button.part-editor-pro-button",
        {
          type: "button",
          title: "Reset editor zoom (Ctrl+0)",
          onclick: () => {
            stateObj.zoom = DEFAULT_EDITOR_ZOOM;
          },
        },
        "Reset Zoom",
      ),
    ]),
  ]);
}

function handleEditorShortcut(
  e: KeyboardEvent,
  stateObj: PartEditorState,
): void {
  if (!state.editingPart) return;

  const key = e.key.toLowerCase();
  const isCommand = e.ctrlKey || e.metaKey;
  if (isTypingTarget(e.target)) {
    if (key === "escape" && stateObj.isFullscreen) {
      e.preventDefault();
      stateObj.isFullscreen = false;
      m.redraw();
    }
    return;
  }

  if (isCommand && key === "z" && e.shiftKey) {
    e.preventDefault();
    redo(stateObj);
    return;
  }
  if (isCommand && key === "z") {
    e.preventDefault();
    undo(stateObj);
    return;
  }
  if (isCommand && key === "y") {
    e.preventDefault();
    redo(stateObj);
    return;
  }
  if (isCommand && key === "n" && e.shiftKey && stateObj.isFullscreen) {
    e.preventDefault();
    addEditLayer(stateObj);
    m.redraw();
    return;
  }
  if (isCommand && key === "j" && stateObj.isFullscreen) {
    e.preventDefault();
    duplicateActiveLayer(stateObj);
    m.redraw();
    return;
  }
  if (isCommand && key === "e" && stateObj.isFullscreen) {
    e.preventDefault();
    if (e.shiftKey) {
      flattenVisibleLayers(stateObj);
    } else {
      mergeActiveLayerDown(stateObj);
    }
    m.redraw();
    return;
  }
  if (isCommand && key === "c") {
    if (copySelection(stateObj)) {
      e.preventDefault();
    }
    return;
  }
  if (isCommand && key === "v") {
    if (pasteClipboard(stateObj)) {
      e.preventDefault();
      m.redraw();
    }
    return;
  }
  if (isCommand && key === "d") {
    if (clearSelectionState(stateObj, true)) {
      e.preventDefault();
      m.redraw();
    }
    return;
  }
  if (isCommand && (key === "=" || key === "+")) {
    e.preventDefault();
    stateObj.zoom = clampEditorZoom(stateObj.zoom + 1);
    m.redraw();
    return;
  }
  if (isCommand && key === "-") {
    e.preventDefault();
    stateObj.zoom = clampEditorZoom(stateObj.zoom - 1);
    m.redraw();
    return;
  }
  if (isCommand && key === "0") {
    e.preventDefault();
    stateObj.zoom = DEFAULT_EDITOR_ZOOM;
    m.redraw();
    return;
  }

  if (isSelectionNudgeKey(key) && stateObj.selectionRect) {
    e.preventDefault();
    nudgeSelection(stateObj, key, e.shiftKey ? 4 : 1);
  } else if (
    (key === "backspace" || key === "delete") &&
    stateObj.selectionRect
  ) {
    e.preventDefault();
    clearSelectedPixels(stateObj);
  } else if (key === "escape" && stateObj.selectionRect) {
    e.preventDefault();
    clearSelectionState(stateObj, true);
  } else if (key === "escape" && stateObj.isFullscreen) {
    e.preventDefault();
    stateObj.isFullscreen = false;
  } else if (key === "f") {
    e.preventDefault();
    stateObj.isFullscreen = !stateObj.isFullscreen;
  } else if (key === "b" || key === "p") {
    e.preventDefault();
    stateObj.tool = "pen";
  } else if (key === "e") {
    e.preventDefault();
    stateObj.tool = "eraser";
  } else if (key === "i") {
    e.preventDefault();
    stateObj.tool = "picker";
  } else if (key === "m" && stateObj.isFullscreen) {
    e.preventDefault();
    stateObj.tool = "select";
  } else if (key === "g" && stateObj.isFullscreen) {
    e.preventDefault();
    stateObj.tool = "fill";
  } else if (key === "[") {
    e.preventDefault();
    stateObj.brushSize = clampBrushSize(stateObj.brushSize - 1);
  } else if (key === "]") {
    e.preventDefault();
    stateObj.brushSize = clampBrushSize(stateObj.brushSize + 1);
  } else if (key === "x" && stateObj.isFullscreen) {
    e.preventDefault();
    stateObj.mirrorX = !stateObj.mirrorX;
  } else if (key === "y" && stateObj.isFullscreen) {
    e.preventDefault();
    stateObj.mirrorY = !stateObj.mirrorY;
  } else {
    return;
  }

  m.redraw();
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tagName = target.tagName.toLowerCase();
  return (
    tagName === "input" ||
    tagName === "select" ||
    tagName === "textarea" ||
    target.isContentEditable
  );
}

function getCanvasPoint(
  e: MouseEvent,
  canvasEl: HTMLCanvasElement,
): Point | null {
  const rect = canvasEl.getBoundingClientRect();
  const scaleX = FRAME_SIZE / rect.width;
  const scaleY = FRAME_SIZE / rect.height;
  const x = Math.floor((e.clientX - rect.left) * scaleX);
  const y = Math.floor((e.clientY - rect.top) * scaleY);
  if (x < 0 || x >= FRAME_SIZE || y < 0 || y >= FRAME_SIZE) return null;
  return { x, y };
}

function isSelectionNudgeKey(key: string): boolean {
  return (
    key === "arrowleft" ||
    key === "arrowright" ||
    key === "arrowup" ||
    key === "arrowdown"
  );
}

function normalizeSelectionRect(start: Point, end: Point): SelectionRect {
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  return {
    x,
    y,
    width: Math.abs(end.x - start.x) + 1,
    height: Math.abs(end.y - start.y) + 1,
  };
}

function pointInSelection(point: Point, rect: SelectionRect): boolean {
  return (
    point.x >= rect.x &&
    point.x < rect.x + rect.width &&
    point.y >= rect.y &&
    point.y < rect.y + rect.height
  );
}

function clampSelectionPosition(
  rect: SelectionRect,
  x: number,
  y: number,
): Point {
  return {
    x: Math.min(FRAME_SIZE - rect.width, Math.max(0, x)),
    y: Math.min(FRAME_SIZE - rect.height, Math.max(0, y)),
  };
}

function cloneImageData(imageData: ImageData): ImageData {
  return new ImageData(
    new Uint8ClampedArray(imageData.data),
    imageData.width,
    imageData.height,
  );
}

function startSelectionInteraction(
  stateObj: PartEditorState,
  point: Point,
): void {
  const activeLayer = getActiveLayer(stateObj);
  if (
    activeLayer &&
    stateObj.selectionRect &&
    pointInSelection(point, stateObj.selectionRect)
  ) {
    const direction = stateObj.activeDirection;
    const canvas = activeLayer.canvases[direction];
    const ctx = get2DContext(canvas);
    const sourceRect = { ...stateObj.selectionRect };
    const imageData = ctx.getImageData(
      sourceRect.x,
      sourceRect.y,
      sourceRect.width,
      sourceRect.height,
    );
    ctx.clearRect(
      sourceRect.x,
      sourceRect.y,
      sourceRect.width,
      sourceRect.height,
    );
    const baseCanvas = document.createElement("canvas");
    baseCanvas.width = FRAME_SIZE;
    baseCanvas.height = FRAME_SIZE;
    get2DContext(baseCanvas).drawImage(canvas, 0, 0);

    stateObj.selectionDraftStart = null;
    stateObj.selectionMove = {
      startPoint: point,
      sourceRect,
      baseCanvas,
      imageData,
      direction,
      layerId: activeLayer.id,
    };
    applySelectionMove(stateObj, point);
    return;
  }

  stateObj.selectionDraftStart = point;
  stateObj.selectionMove = null;
  stateObj.selectionRect = { x: point.x, y: point.y, width: 1, height: 1 };
}

function updateSelectionInteraction(
  stateObj: PartEditorState,
  point: Point,
): void {
  if (stateObj.selectionMove) {
    applySelectionMove(stateObj, point);
    return;
  }

  if (stateObj.selectionDraftStart) {
    stateObj.selectionRect = normalizeSelectionRect(
      stateObj.selectionDraftStart,
      point,
    );
  }
}

function applySelectionMove(stateObj: PartEditorState, point: Point): void {
  const moveState = stateObj.selectionMove;
  const activeLayer = getActiveLayer(stateObj);
  if (
    !moveState ||
    !activeLayer ||
    activeLayer.id !== moveState.layerId ||
    stateObj.activeDirection !== moveState.direction
  ) {
    return;
  }

  const dx = point.x - moveState.startPoint.x;
  const dy = point.y - moveState.startPoint.y;
  const next = clampSelectionPosition(
    moveState.sourceRect,
    moveState.sourceRect.x + dx,
    moveState.sourceRect.y + dy,
  );
  const canvas = activeLayer.canvases[moveState.direction];
  const ctx = get2DContext(canvas);
  ctx.clearRect(0, 0, FRAME_SIZE, FRAME_SIZE);
  ctx.drawImage(moveState.baseCanvas, 0, 0);
  ctx.putImageData(moveState.imageData, next.x, next.y);
  stateObj.selectionRect = {
    x: next.x,
    y: next.y,
    width: moveState.sourceRect.width,
    height: moveState.sourceRect.height,
  };
}

function finishSelectionInteraction(stateObj: PartEditorState): boolean {
  const movedSelection = !!stateObj.selectionMove;
  stateObj.selectionDraftStart = null;
  stateObj.selectionMove = null;
  return movedSelection;
}

function clearSelectionState(
  stateObj: PartEditorState,
  keepClipboard: boolean,
): boolean {
  const hadSelection =
    !!stateObj.selectionRect ||
    !!stateObj.selectionDraftStart ||
    !!stateObj.selectionMove;
  stateObj.selectionRect = null;
  stateObj.selectionDraftStart = null;
  stateObj.selectionMove = null;
  if (!keepClipboard) {
    stateObj.clipboard = null;
  }
  return hadSelection;
}

function copySelection(stateObj: PartEditorState): boolean {
  const activeLayer = getActiveLayer(stateObj);
  const rect = stateObj.selectionRect;
  if (!activeLayer || !rect) return false;

  const ctx = get2DContext(activeLayer.canvases[stateObj.activeDirection]);
  stateObj.clipboard = {
    width: rect.width,
    height: rect.height,
    imageData: cloneImageData(
      ctx.getImageData(rect.x, rect.y, rect.width, rect.height),
    ),
  };
  return true;
}

function pasteClipboard(stateObj: PartEditorState): boolean {
  const activeLayer = getActiveLayer(stateObj);
  const clipboard = stateObj.clipboard;
  if (!activeLayer || !clipboard) return false;

  const rect = {
    x:
      stateObj.selectionRect?.x ??
      Math.floor((FRAME_SIZE - clipboard.width) / 2),
    y:
      stateObj.selectionRect?.y ??
      Math.floor((FRAME_SIZE - clipboard.height) / 2),
    width: clipboard.width,
    height: clipboard.height,
  };
  const target = clampSelectionPosition(rect, rect.x, rect.y);
  const ctx = get2DContext(activeLayer.canvases[stateObj.activeDirection]);
  ctx.putImageData(cloneImageData(clipboard.imageData), target.x, target.y);
  stateObj.selectionRect = {
    x: target.x,
    y: target.y,
    width: clipboard.width,
    height: clipboard.height,
  };
  recomposeCanvases(stateObj);
  saveHistory(stateObj);
  return true;
}

function clearSelectedPixels(stateObj: PartEditorState): boolean {
  const activeLayer = getActiveLayer(stateObj);
  const rect = stateObj.selectionRect;
  if (!activeLayer || !rect) return false;

  const ctx = get2DContext(activeLayer.canvases[stateObj.activeDirection]);
  ctx.clearRect(rect.x, rect.y, rect.width, rect.height);
  recomposeCanvases(stateObj);
  saveHistory(stateObj);
  return true;
}

function nudgeSelection(
  stateObj: PartEditorState,
  key: string,
  distance: number,
): boolean {
  const activeLayer = getActiveLayer(stateObj);
  const rect = stateObj.selectionRect;
  if (!activeLayer || !rect) return false;

  const delta = {
    arrowleft: { x: -distance, y: 0 },
    arrowright: { x: distance, y: 0 },
    arrowup: { x: 0, y: -distance },
    arrowdown: { x: 0, y: distance },
  }[key];
  if (!delta) return false;

  const target = clampSelectionPosition(
    rect,
    rect.x + delta.x,
    rect.y + delta.y,
  );
  if (target.x === rect.x && target.y === rect.y) return false;

  const ctx = get2DContext(activeLayer.canvases[stateObj.activeDirection]);
  const imageData = ctx.getImageData(rect.x, rect.y, rect.width, rect.height);
  ctx.clearRect(rect.x, rect.y, rect.width, rect.height);
  ctx.putImageData(imageData, target.x, target.y);
  stateObj.selectionRect = { ...rect, x: target.x, y: target.y };
  recomposeCanvases(stateObj);
  saveHistory(stateObj);
  return true;
}

function drawMainGrid(
  ctx: CanvasRenderingContext2D,
  offscreenCanvas: HTMLCanvasElement,
  stateObj?: PartEditorState,
) {
  ctx.clearRect(0, 0, FRAME_SIZE, FRAME_SIZE);
  ctx.drawImage(offscreenCanvas, 0, 0);

  const rect = stateObj?.selectionRect;
  if (!rect) return;

  ctx.save();
  ctx.fillStyle = "rgba(124, 109, 240, 0.14)";
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.95)";
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 2]);
  ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.width, rect.height);
  ctx.restore();
}

function refreshVisibleCanvas(
  canvasEl: HTMLCanvasElement,
  stateObj: PartEditorState,
): void {
  const ctx = get2DContext(canvasEl);
  ctx.imageSmoothingEnabled = false;
  drawMainGrid(ctx, stateObj.canvases[stateObj.activeDirection], stateObj);
}

function createEditorLayer(
  stateObj: PartEditorState,
  name?: string,
): EditorLayer {
  const layerNumber = stateObj.nextLayerNumber;
  stateObj.nextLayerNumber += 1;
  return {
    id: `layer_${layerNumber}_${Math.random().toString(36).slice(2, 9)}`,
    name: name ?? `Layer ${layerNumber}`,
    canvases: createDirectionCanvases(),
    visible: true,
    opacity: 1,
  };
}

function resetEditLayers(stateObj: PartEditorState): void {
  stateObj.nextLayerNumber = 1;
  const firstLayer = createEditorLayer(stateObj, "Base");
  firstLayer.canvases = cloneDirectionCanvases(stateObj.originalCanvases);
  stateObj.editLayers = [firstLayer];
  stateObj.activeLayerId = firstLayer.id;
}

function getActiveLayer(stateObj: PartEditorState): EditorLayer | null {
  return (
    stateObj.editLayers.find((layer) => layer.id === stateObj.activeLayerId) ??
    stateObj.editLayers[stateObj.editLayers.length - 1] ??
    null
  );
}

function getActiveLayerIndex(stateObj: PartEditorState): number {
  return stateObj.editLayers.findIndex(
    (layer) => layer.id === stateObj.activeLayerId,
  );
}

function getActiveLayerToolState(
  stateObj: PartEditorState,
): PixelEditorToolState | null {
  const activeLayer = getActiveLayer(stateObj);
  if (!activeLayer) return null;

  return {
    activeDirection: stateObj.activeDirection,
    tool: stateObj.tool,
    activeColor: stateObj.activeColor,
    autoPropagate: stateObj.autoPropagate,
    canvases: activeLayer.canvases,
    brushSize: stateObj.brushSize,
    mirrorX: stateObj.mirrorX,
    mirrorY: stateObj.mirrorY,
  };
}

function recomposeCanvases(stateObj: PartEditorState): void {
  for (const direction of DIRECTIONS) {
    const ctx = get2DContext(stateObj.canvases[direction]);
    ctx.clearRect(0, 0, FRAME_SIZE, FRAME_SIZE);
    ctx.globalAlpha = 1;

    for (const layer of stateObj.editLayers) {
      if (!layer.visible || layer.opacity <= 0) continue;
      ctx.globalAlpha = Math.min(1, Math.max(0, layer.opacity));
      ctx.drawImage(layer.canvases[direction], 0, 0);
    }
    ctx.globalAlpha = 1;
  }
}

function cloneDirectionCanvases(
  canvases: Record<Direction, HTMLCanvasElement>,
): Record<Direction, HTMLCanvasElement> {
  const clone = createDirectionCanvases();
  for (const direction of DIRECTIONS) {
    get2DContext(clone[direction]).drawImage(canvases[direction], 0, 0);
  }
  return clone;
}

function addEditLayer(stateObj: PartEditorState): void {
  const layer = createEditorLayer(stateObj);
  stateObj.editLayers.push(layer);
  stateObj.activeLayerId = layer.id;
  recomposeCanvases(stateObj);
  saveHistory(stateObj);
}

function duplicateActiveLayer(stateObj: PartEditorState): void {
  const activeIndex = getActiveLayerIndex(stateObj);
  if (activeIndex < 0) return;

  const activeLayer = stateObj.editLayers[activeIndex];
  const layer = createEditorLayer(stateObj, `${activeLayer.name} copy`);
  layer.visible = activeLayer.visible;
  layer.opacity = activeLayer.opacity;
  layer.canvases = cloneDirectionCanvases(activeLayer.canvases);

  stateObj.editLayers.splice(activeIndex + 1, 0, layer);
  stateObj.activeLayerId = layer.id;
  recomposeCanvases(stateObj);
  saveHistory(stateObj);
}

function moveActiveLayer(stateObj: PartEditorState, direction: -1 | 1): void {
  const activeIndex = getActiveLayerIndex(stateObj);
  const nextIndex = activeIndex + direction;
  if (
    activeIndex < 0 ||
    nextIndex < 0 ||
    nextIndex >= stateObj.editLayers.length
  ) {
    return;
  }

  const [layer] = stateObj.editLayers.splice(activeIndex, 1);
  stateObj.editLayers.splice(nextIndex, 0, layer);
  recomposeCanvases(stateObj);
  saveHistory(stateObj);
}

function deleteActiveLayer(stateObj: PartEditorState): void {
  const activeIndex = getActiveLayerIndex(stateObj);
  if (activeIndex < 0 || stateObj.editLayers.length <= 1) return;

  stateObj.editLayers.splice(activeIndex, 1);
  const nextActiveIndex = Math.min(activeIndex, stateObj.editLayers.length - 1);
  stateObj.activeLayerId = stateObj.editLayers[nextActiveIndex]?.id ?? null;
  recomposeCanvases(stateObj);
  saveHistory(stateObj);
}

function mergeActiveLayerDown(stateObj: PartEditorState): void {
  const activeIndex = getActiveLayerIndex(stateObj);
  if (activeIndex <= 0) return;

  const activeLayer = stateObj.editLayers[activeIndex];
  const targetLayer = stateObj.editLayers[activeIndex - 1];
  if (activeLayer.visible && activeLayer.opacity > 0) {
    for (const direction of DIRECTIONS) {
      const targetCtx = get2DContext(targetLayer.canvases[direction]);
      targetCtx.globalAlpha = Math.min(1, Math.max(0, activeLayer.opacity));
      targetCtx.drawImage(activeLayer.canvases[direction], 0, 0);
      targetCtx.globalAlpha = 1;
    }
  }

  stateObj.editLayers.splice(activeIndex, 1);
  stateObj.activeLayerId = targetLayer.id;
  clearSelectionState(stateObj, true);
  recomposeCanvases(stateObj);
  saveHistory(stateObj);
}

function flattenVisibleLayers(stateObj: PartEditorState): void {
  if (stateObj.editLayers.length <= 1) return;

  recomposeCanvases(stateObj);
  stateObj.nextLayerNumber = 1;
  const layer = createEditorLayer(stateObj, "Base");
  layer.canvases = cloneDirectionCanvases(stateObj.canvases);
  stateObj.editLayers = [layer];
  stateObj.activeLayerId = layer.id;
  clearSelectionState(stateObj, true);
  recomposeCanvases(stateObj);
  saveHistory(stateObj);
}

function supportsStandardAnimation(
  meta: ItemMerged,
  animName: string,
): boolean {
  if (!meta.animations || meta.animations.length === 0) return false;
  if (animName === "combat_idle") return meta.animations.includes("combat");
  if (animName === "backslash") {
    return (
      meta.animations.includes("1h_slash") ||
      meta.animations.includes("1h_backslash")
    );
  }
  if (animName === "halfslash") {
    return meta.animations.includes("1h_halfslash");
  }
  return meta.animations.includes(animName);
}

async function buildEditedAnimationSheets(
  baseId: string,
  meta: ItemMerged,
  originalCanvases: Record<Direction, HTMLCanvasElement>,
  editedCanvases: Record<Direction, HTMLCanvasElement>,
): Promise<Record<string, HTMLCanvasElement>> {
  const sheets: Record<string, HTMLCanvasElement> = {};
  const selection = state.selections[meta.type_name];
  const recolors = getMultiRecolors(baseId, state.selections);
  const variant = selection?.variant ?? null;

  for (const animName of Object.keys(ANIMATION_OFFSETS)) {
    if (!supportsStandardAnimation(meta, animName)) continue;
    const pathResult = getSpritePath(
      baseId,
      variant,
      recolors,
      state.bodyType,
      animName,
      1,
      state.selections,
      meta,
    );
    if (pathResult.isErr()) continue;

    const baseImg = await loadImage(pathResult.value);
    const outCanvas = document.createElement("canvas");
    outCanvas.width = baseImg.width;
    outCanvas.height = baseImg.height;
    const outCtx = get2DContext(outCanvas);
    outCtx.drawImage(baseImg, 0, 0);
    applyDirectionEdits(outCtx, baseImg, originalCanvases, editedCanvases);
    sheets[animName] = outCanvas;
  }

  return sheets;
}

function applyDirectionEdits(
  ctx: CanvasRenderingContext2D,
  baseImg: HTMLImageElement,
  originalCanvases: Record<Direction, HTMLCanvasElement>,
  editedCanvases: Record<Direction, HTMLCanvasElement>,
): void {
  const rowCount = Math.floor(baseImg.height / FRAME_SIZE);
  const frameCount = Math.floor(baseImg.width / FRAME_SIZE);
  if (rowCount <= 0 || frameCount <= 0) return;

  if (rowCount < 4) {
    for (let row = 0; row < rowCount; row++) {
      applyDirectionChangesToRow(
        ctx,
        row,
        frameCount,
        originalCanvases.front,
        editedCanvases.front,
      );
    }
    return;
  }

  for (const direction of DIRECTIONS) {
    applyDirectionChangesToRow(
      ctx,
      DIRECTION_ROWS[direction],
      frameCount,
      originalCanvases[direction],
      editedCanvases[direction],
    );
  }
}

function applyDirectionChangesToRow(
  ctx: CanvasRenderingContext2D,
  row: number,
  frameCount: number,
  originalCanvas: HTMLCanvasElement,
  editedCanvas: HTMLCanvasElement,
): void {
  const width = FRAME_SIZE;
  const height = FRAME_SIZE;
  const originalData = get2DContext(originalCanvas).getImageData(
    0,
    0,
    width,
    height,
  );
  const editedData = get2DContext(editedCanvas).getImageData(
    0,
    0,
    width,
    height,
  );

  const modifiedPixels: {
    x: number;
    y: number;
    r: number;
    g: number;
    b: number;
    a: number;
  }[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const oR = originalData.data[idx];
      const oG = originalData.data[idx + 1];
      const oB = originalData.data[idx + 2];
      const oA = originalData.data[idx + 3];

      const eR = editedData.data[idx];
      const eG = editedData.data[idx + 1];
      const eB = editedData.data[idx + 2];
      const eA = editedData.data[idx + 3];

      if (oR !== eR || oG !== eG || oB !== eB || oA !== eA) {
        modifiedPixels.push({ x, y, r: eR, g: eG, b: eB, a: eA });
      }
    }
  }

  if (modifiedPixels.length === 0) return;

  for (let frameIdx = 0; frameIdx < frameCount; frameIdx++) {
    const frameData = ctx.getImageData(
      frameIdx * FRAME_SIZE,
      row * FRAME_SIZE,
      FRAME_SIZE,
      FRAME_SIZE,
    );
    for (const { x, y, r, g, b, a } of modifiedPixels) {
      const idx = (y * width + x) * 4;
      frameData.data[idx] = r;
      frameData.data[idx + 1] = g;
      frameData.data[idx + 2] = b;
      frameData.data[idx + 3] = a;
    }
    ctx.putImageData(frameData, frameIdx * FRAME_SIZE, row * FRAME_SIZE);
  }
}

function saveHistory(stateObj: PartEditorState): void {
  stateObj.history = stateObj.history.slice(0, stateObj.historyIndex + 1);
  stateObj.history.push(JSON.stringify(createHistorySnapshot(stateObj)));
  stateObj.historyIndex = stateObj.history.length - 1;
}

function createHistorySnapshot(stateObj: PartEditorState): EditorSnapshot {
  return {
    activeLayerId: stateObj.activeLayerId,
    nextLayerNumber: stateObj.nextLayerNumber,
    layers: stateObj.editLayers.map((layer) => ({
      id: layer.id,
      name: layer.name,
      visible: layer.visible,
      opacity: layer.opacity,
      canvases: {
        front: layer.canvases.front.toDataURL(),
        back: layer.canvases.back.toDataURL(),
        left: layer.canvases.left.toDataURL(),
        right: layer.canvases.right.toDataURL(),
      },
    })),
  };
}

function undo(stateObj: PartEditorState): void {
  if (stateObj.historyIndex <= 0) return;
  stateObj.historyIndex--;
  const snapshot = JSON.parse(stateObj.history[stateObj.historyIndex]) as
    | EditorSnapshot
    | Partial<Record<Direction, string>>;
  void loadSnapshot(stateObj, snapshot);
}

function redo(stateObj: PartEditorState): void {
  if (stateObj.historyIndex >= stateObj.history.length - 1) return;
  stateObj.historyIndex++;
  const snapshot = JSON.parse(stateObj.history[stateObj.historyIndex]) as
    | EditorSnapshot
    | Partial<Record<Direction, string>>;
  void loadSnapshot(stateObj, snapshot);
}

async function loadSnapshot(
  stateObj: PartEditorState,
  snapshot: EditorSnapshot | Partial<Record<Direction, string>>,
): Promise<void> {
  try {
    if (isEditorSnapshot(snapshot)) {
      const layers = await Promise.all(
        snapshot.layers.map((layerSnapshot) =>
          createLayerFromSnapshot(layerSnapshot),
        ),
      );
      if (layers.length === 0) {
        resetEditLayers(stateObj);
      } else {
        stateObj.editLayers = layers;
        stateObj.activeLayerId =
          layers.find((layer) => layer.id === snapshot.activeLayerId)?.id ??
          layers[layers.length - 1].id;
        stateObj.nextLayerNumber = Math.max(snapshot.nextLayerNumber, 1);
      }
    } else {
      await loadLegacyCanvasSnapshot(stateObj, snapshot);
    }

    clearSelectionState(stateObj, true);
    recomposeCanvases(stateObj);
    m.redraw();
  } catch (err) {
    console.warn("Failed to restore editor history snapshot:", err);
  }
}

function isEditorSnapshot(snapshot: unknown): snapshot is EditorSnapshot {
  return (
    typeof snapshot === "object" &&
    snapshot !== null &&
    Array.isArray((snapshot as { layers?: unknown }).layers)
  );
}

async function createLayerFromSnapshot(
  snapshot: EditorLayerSnapshot,
): Promise<EditorLayer> {
  const canvases = createDirectionCanvases();
  await Promise.all(
    DIRECTIONS.map((direction) =>
      loadDataUrlIntoCanvas(snapshot.canvases[direction], canvases[direction]),
    ),
  );

  return {
    id: snapshot.id,
    name: snapshot.name || "Layer",
    visible: snapshot.visible,
    opacity: Math.min(1, Math.max(0, snapshot.opacity)),
    canvases,
  };
}

async function loadLegacyCanvasSnapshot(
  stateObj: PartEditorState,
  snapshot: Partial<Record<Direction, string>>,
): Promise<void> {
  stateObj.nextLayerNumber = 1;
  const layer = createEditorLayer(stateObj, "Base");
  await Promise.all(
    DIRECTIONS.map((direction) =>
      loadDataUrlIntoCanvas(snapshot[direction], layer.canvases[direction]),
    ),
  );
  stateObj.editLayers = [layer];
  stateObj.activeLayerId = layer.id;
}

function loadDataUrlIntoCanvas(
  dataUrl: string | undefined,
  canvas: HTMLCanvasElement,
): Promise<void> {
  const ctx = get2DContext(canvas);
  ctx.clearRect(0, 0, FRAME_SIZE, FRAME_SIZE);
  if (!dataUrl) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, FRAME_SIZE, FRAME_SIZE);
      ctx.drawImage(img, 0, 0);
      resolve();
    };
    img.onerror = () => reject(new Error("Unable to load layer image data."));
    img.src = dataUrl;
  });
}

function resetCanvases(stateObj: PartEditorState): void {
  if (stateObj.history.length > 0) {
    // Reset to index 0 of history (original standing frames)
    const snapshot = JSON.parse(stateObj.history[0]) as
      | EditorSnapshot
      | Partial<Record<Direction, string>>;
    void loadSnapshot(stateObj, snapshot);
    stateObj.history = stateObj.history.slice(0, 1);
    stateObj.historyIndex = 0;
  }
}
