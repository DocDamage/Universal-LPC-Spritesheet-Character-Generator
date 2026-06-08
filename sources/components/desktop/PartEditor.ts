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
import { variantToFilename } from "../../utils/helpers.ts";
import { getMultiRecolors } from "../../state/palettes.ts";
import {
  ANIMATION_CONFIGS,
  ANIMATION_OFFSETS,
  ANIMATIONS,
  FRAME_SIZE,
} from "../../state/constants.ts";
import {
  clearDraft,
  hasUnsavedDraft,
  loadDraft,
  saveDraft,
} from "../../state/editor-autosave.ts";
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

export type PartEditorState = PixelEditorToolState & {
  loading: boolean;
  baseItemId: string | null;
  name: string;
  activeEditorTab: "edit" | "animation";
  originalCanvases: Record<Direction, HTMLCanvasElement>;
  editLayers: EditorLayer[];
  activeLayerId: string | null;
  nextLayerNumber: number;
  globalEditorContext: EditorContextSnapshot | null;
  frameEditorContexts: Record<string, EditorContextSnapshot>;
  availableFrameAnimations: string[];
  frameMode: boolean;
  frameAnimation: string;
  frameIndex: number;
  onionSkin: boolean;
  onionOpacity: number;
  onionCanvases: OnionCanvases | null;
  replaceFromColor: string;
  replaceToColor: string;
  replaceTolerance: number;
  replaceAllDirections: boolean;
  transformAllDirections: boolean;
  alphaLocked: boolean;
  isDrawing: boolean;
  zoom: number;
  showGrid: boolean;
  isFullscreen: boolean;
  shapeStart: Point | null;
  shapeEnd: Point | null;
  shapeFilled: boolean;
  lastPoint: Point | null;
  selectionRect: SelectionRect | null;
  selectionDraftStart: Point | null;
  selectionMove: SelectionMoveState | null;
  clipboard: SelectionClipboard | null;
  keyboardHandler: ((e: KeyboardEvent) => void) | null;

  // Undo history
  history: string[]; // Store JSON snapshots of edit layers
  historyIndex: number;

  // Task 1: Autosave
  showRecoveryPrompt: boolean;
  autosaveDebounceTimer: number | null;
  unsavedChanges: boolean;
  beforeunloadHandler: ((e: BeforeUnloadEvent) => void) | null;

  // Task 2: Status bar
  cursorPosition: Point | null;

  // Task 6: Animation playback
  isPlaying: boolean;
  playbackTimer: number | null;

  // Task 8: Mobile/touch
  isTouchDevice: boolean;
  touchStartDist: number;
  touchStartZoom: number;
  lastTouchCenter: { x: number; y: number } | null;

  // Task 9: Performance
  thumbnailCache: Record<Direction, HTMLCanvasElement> | null;
  recomposeDebounceTimer: number | null;
};

export type EditorLayer = {
  id: string;
  name: string;
  canvases: Record<Direction, HTMLCanvasElement>;
  visible: boolean;
  opacity: number;
  locked: boolean;
  alphaLocked: boolean;
};

export type EditorLayerSnapshot = {
  id: string;
  name: string;
  visible: boolean;
  opacity: number;
  locked?: boolean;
  alphaLocked?: boolean;
  canvases: Record<Direction, string>;
};

export type EditorSnapshot = {
  activeLayerId: string | null;
  nextLayerNumber: number;
  layers: EditorLayerSnapshot[];
};

export type EditorContextSnapshot = EditorSnapshot & {
  originalCanvases: Record<Direction, string>;
  history: string[];
  historyIndex: number;
};

export type OnionCanvases = {
  previous: Record<Direction, HTMLCanvasElement> | null;
  next: Record<Direction, HTMLCanvasElement> | null;
};

type FrameOverride = {
  animation: string;
  frameIndex: number;
  canvases: Record<Direction, HTMLCanvasElement>;
};

export type SelectionRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type SelectionMoveState = {
  startPoint: Point;
  sourceRect: SelectionRect;
  baseCanvas: HTMLCanvasElement;
  imageData: ImageData;
  direction: Direction;
  layerId: string;
};

export type SelectionClipboard = {
  width: number;
  height: number;
  imageData: ImageData;
  sourceDirection?: Direction;
};

type ShapeTool = "line" | "rect" | "ellipse";

type TransformOperation =
  | "flipHorizontal"
  | "flipVertical"
  | "rotateClockwise"
  | "rotateCounterClockwise"
  | "clear";

type RgbColor = {
  r: number;
  g: number;
  b: number;
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
export type EditorWheelZoomInput = {
  zoom: number;
  deltaY: number;
  pointerRatioX?: number;
  pointerRatioY?: number;
};

export type EditorWheelZoomUpdate = {
  nextZoom: number;
  scrollLeftDelta: number;
  scrollTopDelta: number;
  changed: boolean;
};

export const MIN_EDITOR_ZOOM = 2;
export const MAX_EDITOR_ZOOM = 16;
export const DEFAULT_EDITOR_ZOOM = 4;
const MAX_EXTRACTED_PALETTE_COLORS = 36;

export function clampEditorZoom(value: number): number {
  return Math.min(MAX_EDITOR_ZOOM, Math.max(MIN_EDITOR_ZOOM, value));
}

export function getEditorWheelZoomUpdate({
  zoom,
  deltaY,
  pointerRatioX = 0.5,
  pointerRatioY = 0.5,
}: EditorWheelZoomInput): EditorWheelZoomUpdate {
  const oldZoom = clampEditorZoom(zoom);
  const nextZoom = clampEditorZoom(oldZoom + (deltaY < 0 ? 1 : -1));
  const sizeDelta = FRAME_SIZE * (nextZoom - oldZoom);
  const boundedRatioX = Math.min(1, Math.max(0, pointerRatioX));
  const boundedRatioY = Math.min(1, Math.max(0, pointerRatioY));
  const scrollLeftDelta = sizeDelta * boundedRatioX;
  const scrollTopDelta = sizeDelta * boundedRatioY;

  return {
    nextZoom,
    scrollLeftDelta: scrollLeftDelta === 0 ? 0 : scrollLeftDelta,
    scrollTopDelta: scrollTopDelta === 0 ? 0 : scrollTopDelta,
    changed: nextZoom !== oldZoom,
  };
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

export function createPartEditorStateForTests(
  overrides: Partial<PartEditorState> = {},
): PartEditorState {
  const stateObj = {
    loading: false,
    baseItemId: null,
    name: "",
    activeEditorTab: "edit",
    activeDirection: "front",
    tool: "pen",
    activeColor: "#ff0000",
    autoPropagate: true,
    isDrawing: false,
    zoom: DEFAULT_EDITOR_ZOOM,
    brushSize: 1,
    mirrorX: false,
    mirrorY: false,
    showGrid: true,
    isFullscreen: false,
    shapeStart: null,
    shapeEnd: null,
    shapeFilled: false,
    lastPoint: null,
    selectionRect: null,
    selectionDraftStart: null,
    selectionMove: null,
    clipboard: null,
    keyboardHandler: null,
    history: [],
    historyIndex: -1,
    canvases: createDirectionCanvases(),
    originalCanvases: createDirectionCanvases(),
    editLayers: [],
    activeLayerId: null,
    nextLayerNumber: 1,
    globalEditorContext: null,
    frameEditorContexts: {},
    availableFrameAnimations: ["walk"],
    frameMode: false,
    frameAnimation: "walk",
    frameIndex: 0,
    onionSkin: false,
    onionOpacity: 0.28,
    onionCanvases: null,
    replaceFromColor: "#000000",
    replaceToColor: "#ff0000",
    replaceTolerance: 0,
    replaceAllDirections: false,
    transformAllDirections: false,
    alphaLocked: false,
    showRecoveryPrompt: false,
    autosaveDebounceTimer: null,
    unsavedChanges: false,
    beforeunloadHandler: null,
    cursorPosition: null,
    isPlaying: false,
    playbackTimer: null,
    isTouchDevice: false,
    touchStartDist: 0,
    touchStartZoom: DEFAULT_EDITOR_ZOOM,
    lastTouchCenter: null,
    thumbnailCache: null,
    recomposeDebounceTimer: null,
  } as PartEditorState;

  Object.assign(stateObj, overrides);
  if (!stateObj.canvases) {
    stateObj.canvases = createDirectionCanvases();
  }
  if (!stateObj.originalCanvases) {
    stateObj.originalCanvases = createDirectionCanvases();
  }
  if (!stateObj.editLayers || stateObj.editLayers.length === 0) {
    resetEditLayers(stateObj);
  }
  recomposeCanvases(stateObj);
  if (!stateObj.history || stateObj.history.length === 0) {
    stateObj.history = [];
    stateObj.historyIndex = -1;
    saveHistory(stateObj);
  }
  return stateObj;
}

export const PartEditor: m.Component<{}, PartEditorState> = {
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
      window.removeEventListener("beforeunload", vnode.state.beforeunloadHandler);
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
        ? Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
        : 0.5;
      const pointerRatioY = rect
        ? Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height))
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
                  title: "Scroll over the canvas to zoom. Two-finger drag to pan, pinch to zoom.",
                  onwheel: handleCanvasWheel,
                  ontouchstart: (e: TouchEvent) => {
                    handleTouchStart(e, vnode.state);
                  },
                  ontouchmove: (e: TouchEvent) => {
                    handleTouchMove(e, vnode.state);
                    if (e.touches.length === 2 && vnode.state.lastTouchCenter) {
                      const currentCenter = {
                        x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
                        y: (e.touches[0].clientY + e.touches[1].clientY) / 2,
                      };
                      const dx = currentCenter.x - vnode.state.lastTouchCenter.x;
                      const dy = currentCenter.y - vnode.state.lastTouchCenter.y;
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

function renderProPanel(stateObj: PartEditorState): m.Children {
  return m("aside.part-editor-pro-panel", [
    m("div.part-editor-pro-tabs", [
      m(
        "button.part-editor-pro-tab",
        {
          type: "button",
          class: stateObj.activeEditorTab === "edit" ? "active" : "",
          title: "Show sprite editing tools (1)",
          onclick: () => {
            stateObj.activeEditorTab = "edit";
          },
        },
        "Edit",
      ),
      m(
        "button.part-editor-pro-tab",
        {
          type: "button",
          class: stateObj.activeEditorTab === "animation" ? "active" : "",
          title: "Show animation frame editor (2)",
          onclick: () => {
            stateObj.activeEditorTab = "animation";
          },
        },
        "Animation",
      ),
    ]),
    m(
      "div.part-editor-pro-content",
      stateObj.activeEditorTab === "animation"
        ? renderAnimationEditorPanel(stateObj)
        : renderSpriteEditorPanel(stateObj),
    ),
  ]);
}

function renderSpriteEditorPanel(stateObj: PartEditorState): m.Children {
  const activeLayerIndex = getActiveLayerIndex(stateObj);
  const activeLayer = getActiveLayer(stateObj);
  const activeLayerLocked = activeLayer?.locked ?? false;
  const canMoveLayerDown = activeLayerIndex > 0;
  const canMoveLayerUp =
    activeLayerIndex >= 0 && activeLayerIndex < stateObj.editLayers.length - 1;
  const targetMergeLayer = stateObj.editLayers[activeLayerIndex - 1];
  const canMergeLayerDown =
    activeLayerIndex > 0 && !activeLayerLocked && !targetMergeLayer?.locked;
  const canFlattenLayers = stateObj.editLayers.length > 1;
  const canDeleteActiveLayer =
    stateObj.editLayers.length > 1 &&
    activeLayerIndex >= 0 &&
    !activeLayerLocked;
  const paletteColors = getVisiblePaletteColors(stateObj);

  return [
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
      m(
        "label.part-editor-pro-toggle",
        {
          title: "Fill rectangle and ellipse tools",
        },
        [
          m("input", {
            type: "checkbox",
            checked: stateObj.shapeFilled,
            onchange: (e: Event) => {
              stateObj.shapeFilled = (e.target as HTMLInputElement).checked;
            },
          }),
          "Fill shapes",
        ],
      ),
    ]),
    m("div.part-editor-pro-section.part-editor-color-section", [
      m("h4", "Color"),
      m(
        "div.part-editor-extracted-palette",
        paletteColors.map((color) =>
          m("button.part-editor-palette-chip", {
            key: color,
            type: "button",
            style: { backgroundColor: color },
            class: stateObj.activeColor === color ? "active" : "",
            title: `Use ${color}`,
            onclick: () => {
              stateObj.activeColor = color;
            },
            ondblclick: () => {
              stateObj.replaceFromColor = color;
            },
          }),
        ),
      ),
      m("div.part-editor-replace-grid", [
        m("label.part-editor-color-field", [
          m("span", "From"),
          m("input", {
            type: "color",
            value: stateObj.replaceFromColor,
            title: "Color to replace",
            oninput: (e: Event) => {
              stateObj.replaceFromColor = (e.target as HTMLInputElement).value;
            },
          }),
        ]),
        m("label.part-editor-color-field", [
          m("span", "To"),
          m("input", {
            type: "color",
            value: stateObj.replaceToColor,
            title: "Replacement color",
            oninput: (e: Event) => {
              stateObj.replaceToColor = (e.target as HTMLInputElement).value;
            },
          }),
        ]),
      ]),
      m("label.part-editor-pro-field", [
        m("span", "Tol"),
        m("input", {
          type: "range",
          min: "0",
          max: "96",
          step: "1",
          value: String(stateObj.replaceTolerance),
          title: "Color match tolerance",
          oninput: (e: Event) => {
            stateObj.replaceTolerance = Number(
              (e.target as HTMLInputElement).value,
            );
          },
        }),
        m("b", String(stateObj.replaceTolerance)),
      ]),
      m(
        "label.part-editor-pro-toggle",
        {
          title: "Replace matching colors in every direction",
        },
        [
          m("input", {
            type: "checkbox",
            checked: stateObj.replaceAllDirections,
            onchange: (e: Event) => {
              stateObj.replaceAllDirections = (
                e.target as HTMLInputElement
              ).checked;
            },
          }),
          "All dirs",
        ],
      ),
      m("div.part-editor-color-actions", [
        m(
          "button.part-editor-pro-button",
          {
            type: "button",
            title: "Use active brush color as replacement",
            onclick: () => {
              stateObj.replaceToColor = stateObj.activeColor;
            },
          },
          "Use",
        ),
        m(
          "button.part-editor-pro-button",
          {
            type: "button",
            title: "Swap source and replacement colors",
            onclick: () => {
              const from = stateObj.replaceFromColor;
              stateObj.replaceFromColor = stateObj.replaceToColor;
              stateObj.replaceToColor = from;
            },
          },
          "Swap",
        ),
        m(
          "button.part-editor-pro-button",
          {
            type: "button",
            title: "Replace color on active layer (Ctrl+Shift+R)",
            disabled: activeLayerLocked,
            onclick: () => replaceColorOnActiveLayer(stateObj),
          },
          "Apply",
        ),
      ]),
    ]),
    m("div.part-editor-pro-section.part-editor-transform-section", [
      m("h4", "Transform"),
      m(
        "label.part-editor-pro-toggle",
        {
          title: "Apply transforms to every direction",
        },
        [
          m("input", {
            type: "checkbox",
            checked: stateObj.transformAllDirections,
            onchange: (e: Event) => {
              stateObj.transformAllDirections = (
                e.target as HTMLInputElement
              ).checked;
            },
          }),
          "All dirs",
        ],
      ),
      m("div.part-editor-transform-actions", [
        m(
          "button.part-editor-pro-button",
          {
            type: "button",
            title: "Flip selection or active layer horizontally (H)",
            disabled: activeLayerLocked,
            onclick: () => transformActivePixels(stateObj, "flipHorizontal"),
          },
          "Flip H",
        ),
        m(
          "button.part-editor-pro-button",
          {
            type: "button",
            title: "Flip selection or active layer vertically (V)",
            disabled: activeLayerLocked,
            onclick: () => transformActivePixels(stateObj, "flipVertical"),
          },
          "Flip V",
        ),
        m(
          "button.part-editor-pro-button",
          {
            type: "button",
            title: "Rotate selection or active layer clockwise (T)",
            disabled: activeLayerLocked,
            onclick: () => transformActivePixels(stateObj, "rotateClockwise"),
          },
          "Rot CW",
        ),
        m(
          "button.part-editor-pro-button",
          {
            type: "button",
            title:
              "Rotate selection or active layer counterclockwise (Shift+T)",
            disabled: activeLayerLocked,
            onclick: () =>
              transformActivePixels(stateObj, "rotateCounterClockwise"),
          },
          "Rot CCW",
        ),
        m(
          "button.part-editor-pro-button.part-editor-transform-clear",
          {
            type: "button",
            title: "Clear selection or active layer",
            disabled: activeLayerLocked,
            onclick: () => transformActivePixels(stateObj, "clear"),
          },
          "Clear",
        ),
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
            disabled: !canDeleteActiveLayer,
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
                    "button.part-editor-layer-control",
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
                  m(
                    "button.part-editor-layer-control",
                    {
                      type: "button",
                      title: layer.locked
                        ? "Unlock layer pixels (/)"
                        : "Lock layer pixels (/)",
                      class: layer.locked ? "active" : "",
                      onclick: (e: MouseEvent) => {
                        e.stopPropagation();
                        toggleLayerPixelLock(stateObj, layer);
                      },
                    },
                    layer.locked ? "Lock" : "Edit",
                  ),
                  m(
                    "button.part-editor-layer-control",
                    {
                      type: "button",
                      title: layer.alphaLocked
                        ? "Unlock transparent pixels (Shift+/)"
                        : "Lock transparent pixels for recoloring (Shift+/)",
                      class: layer.alphaLocked ? "active" : "",
                      disabled: layer.locked,
                      onclick: (e: MouseEvent) => {
                        e.stopPropagation();
                        toggleLayerAlphaLock(stateObj, layer);
                      },
                    },
                    "A",
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
                    debouncedRecomposeCanvases(stateObj);
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
  ];
}

function renderAnimationEditorPanel(stateObj: PartEditorState): m.Children {
  const frameCount = getAnimationFrameCount(stateObj.frameAnimation);
  const canUseFrameTools = stateObj.availableFrameAnimations.length > 0;

  return [
    m("div.part-editor-pro-section.part-editor-timeline-section", [
      m("h4", "Timeline"),
      m("div.part-editor-mode-switch", [
        m(
          "button.part-editor-pro-button",
          {
            type: "button",
            class: !stateObj.frameMode ? "active" : "",
            title: "Edit global standing-frame changes",
            onclick: () => {
              void switchEditorContext(stateObj, false);
            },
          },
          "Global",
        ),
        m(
          "button.part-editor-pro-button",
          {
            type: "button",
            class: stateObj.frameMode ? "active" : "",
            disabled: !canUseFrameTools,
            title: "Edit one animation frame",
            onclick: () => {
              void switchEditorContext(stateObj, true);
            },
          },
          "Frame",
        ),
      ]),
      m("label.part-editor-pro-field.part-editor-pro-field-wide", [
        m("span", "Anim"),
        m(
          "select",
          {
            value: stateObj.frameAnimation,
            disabled: !canUseFrameTools,
            title: "Animation for frame editing",
            onchange: (e: Event) => {
              const animation = (e.target as HTMLSelectElement).value;
              void switchEditorContext(stateObj, true, animation, 0);
            },
          },
          stateObj.availableFrameAnimations.map((animation) =>
            m("option", { value: animation }, getAnimationLabel(animation)),
          ),
        ),
        m("b", stateObj.frameMode ? "On" : "Off"),
      ]),
      // Task 6: Play/pause
      m("div.part-editor-playback-controls", [
        m(
          "button.part-editor-pro-button",
          {
            type: "button",
            title: stateObj.isPlaying ? "Pause playback" : "Play animation",
            disabled: !stateObj.frameMode,
            onclick: () => {
              if (stateObj.isPlaying) {
                stopPlayback(stateObj);
              } else {
                startPlayback(stateObj);
              }
            },
          },
          stateObj.isPlaying ? "⏸ Pause" : "▶ Play",
        ),
      ]),
      m("div.part-editor-frame-controls", [
        m(
          "button.part-editor-pro-button",
          {
            type: "button",
            disabled: !stateObj.frameMode || stateObj.frameIndex <= 0,
            title: "Previous animation frame (,)",
            onclick: () => {
              void switchEditorContext(
                stateObj,
                true,
                stateObj.frameAnimation,
                stateObj.frameIndex - 1,
              );
            },
          },
          "<",
        ),
        m("input.part-editor-frame-slider", {
          type: "range",
          min: "0",
          max: String(Math.max(0, frameCount - 1)),
          step: "1",
          value: String(stateObj.frameIndex),
          disabled: !stateObj.frameMode,
          title: "Animation frame",
          oninput: (e: Event) => {
            void switchEditorContext(
              stateObj,
              true,
              stateObj.frameAnimation,
              Number((e.target as HTMLInputElement).value),
            );
          },
        }),
        m(
          "button.part-editor-pro-button",
          {
            type: "button",
            disabled:
              !stateObj.frameMode || stateObj.frameIndex >= frameCount - 1,
            title: "Next animation frame (.)",
            onclick: () => {
              void switchEditorContext(
                stateObj,
                true,
                stateObj.frameAnimation,
                stateObj.frameIndex + 1,
              );
            },
          },
          ">",
        ),
        m(
          "span.part-editor-frame-count",
          `${stateObj.frameIndex + 1}/${frameCount}`,
        ),
      ]),
      // Task 6: Scrubbable timeline thumbnails
      renderTimelineThumbnails(stateObj, frameCount),
      // Task 6: Apply Global to Frame
      m(
        "button.part-editor-pro-button",
        {
          type: "button",
          title: "Copy global edits into the current frame",
          disabled: !stateObj.frameMode || !stateObj.globalEditorContext,
          onclick: () => applyGlobalToFrame(stateObj),
        },
        "Apply Global to Frame",
      ),
      m(
        "label.part-editor-pro-toggle",
        {
          title: "Show neighboring animation frames",
        },
        [
          m("input", {
            type: "checkbox",
            checked: stateObj.onionSkin,
            onchange: (e: Event) => {
              stateObj.onionSkin = (e.target as HTMLInputElement).checked;
              if (stateObj.frameMode) {
                void updateOnionCanvases(stateObj);
              }
            },
          }),
          "Onion",
        ],
      ),
      m("label.part-editor-pro-field", [
        m("span", "Ghost"),
        m("input", {
          type: "range",
          min: "10",
          max: "70",
          step: "5",
          value: String(Math.round(stateObj.onionOpacity * 100)),
          title: "Onion skin opacity",
          oninput: (e: Event) => {
            stateObj.onionOpacity =
              Number((e.target as HTMLInputElement).value) / 100;
          },
        }),
        m("b", `${Math.round(stateObj.onionOpacity * 100)}%`),
      ]),
    ]),
  ];
}

function handleEditorShortcut(
  e: KeyboardEvent,
  stateObj: PartEditorState,
): void {
  if (!state.editingPart) return;
  if (e.defaultPrevented) return;

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
  if (isCommand && key === "r" && e.shiftKey && stateObj.isFullscreen) {
    e.preventDefault();
    replaceColorOnActiveLayer(stateObj);
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
    nudgeSelection(stateObj, key, e.shiftKey ? 10 : 1);
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
  } else if (key === "1" && stateObj.isFullscreen) {
    e.preventDefault();
    stateObj.activeEditorTab = "edit";
  } else if (key === "2" && stateObj.isFullscreen) {
    e.preventDefault();
    stateObj.activeEditorTab = "animation";
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
  } else if (key === "l" && stateObj.isFullscreen) {
    e.preventDefault();
    stateObj.tool = "line";
  } else if (key === "r" && stateObj.isFullscreen) {
    e.preventDefault();
    stateObj.tool = "rect";
  } else if (key === "o" && stateObj.isFullscreen) {
    e.preventDefault();
    stateObj.tool = "ellipse";
  } else if (key === "g" && stateObj.isFullscreen) {
    e.preventDefault();
    stateObj.tool = "fill";
  } else if (key === "h" && stateObj.isFullscreen) {
    e.preventDefault();
    transformActivePixels(stateObj, "flipHorizontal");
  } else if (key === "v" && stateObj.isFullscreen) {
    e.preventDefault();
    transformActivePixels(stateObj, "flipVertical");
  } else if (key === "t" && stateObj.isFullscreen) {
    e.preventDefault();
    transformActivePixels(
      stateObj,
      e.shiftKey ? "rotateCounterClockwise" : "rotateClockwise",
    );
  } else if ((key === "/" || key === "?") && stateObj.isFullscreen) {
    e.preventDefault();
    if (e.shiftKey || key === "?") {
      toggleActiveLayerAlphaLock(stateObj);
    } else {
      toggleActiveLayerPixelLock(stateObj);
    }
  } else if (key === "," && stateObj.isFullscreen && stateObj.frameMode) {
    e.preventDefault();
    void switchEditorContext(
      stateObj,
      true,
      stateObj.frameAnimation,
      stateObj.frameIndex - 1,
    );
    return;
  } else if (key === "." && stateObj.isFullscreen && stateObj.frameMode) {
    e.preventDefault();
    void switchEditorContext(
      stateObj,
      true,
      stateObj.frameAnimation,
      stateObj.frameIndex + 1,
    );
    return;
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
    !activeLayer.locked &&
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
    sourceDirection: stateObj.activeDirection,
  };
  return true;
}

function pasteClipboard(stateObj: PartEditorState): boolean {
  const activeLayer = getActiveLayer(stateObj);
  const clipboard = stateObj.clipboard;
  if (!activeLayer || activeLayer.locked || !clipboard) return false;

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

  let imageData = clipboard.imageData;
  const sourceDir = clipboard.sourceDirection;
  const targetDir = stateObj.activeDirection;
  if (
    sourceDir &&
    targetDir &&
    ((sourceDir === "left" && targetDir === "right") ||
      (sourceDir === "right" && targetDir === "left"))
  ) {
    imageData = flipImageDataHorizontal(imageData);
  }

  ctx.putImageData(cloneImageData(imageData), target.x, target.y);
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
  if (!activeLayer || activeLayer.locked || !rect) return false;

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
  if (!activeLayer || activeLayer.locked || !rect) return false;

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

function isShapeTool(tool: PartEditorState["tool"]): tool is ShapeTool {
  return tool === "line" || tool === "rect" || tool === "ellipse";
}

function startShapeInteraction(stateObj: PartEditorState, point: Point): void {
  clearSelectionState(stateObj, true);
  stateObj.shapeStart = point;
  stateObj.shapeEnd = point;
}

function finishShapeInteraction(stateObj: PartEditorState): boolean {
  const start = stateObj.shapeStart;
  const end = stateObj.shapeEnd;
  const tool = stateObj.tool;
  stateObj.shapeStart = null;
  stateObj.shapeEnd = null;

  if (!start || !end || !isShapeTool(tool)) return false;
  const layerState = getActiveLayerToolState(stateObj);
  if (!layerState) return false;

  for (const point of getShapePoints(tool, start, end, stateObj.shapeFilled)) {
    applyBrush(layerState, point, "paint");
  }
  recomposeCanvases(stateObj);
  return true;
}

function getShapePoints(
  tool: ShapeTool,
  start: Point,
  end: Point,
  filled: boolean,
): Point[] {
  if (tool === "line") {
    return getLinePoints(start, end);
  }

  if (tool === "rect") {
    return getRectanglePoints(start, end, filled);
  }

  return getEllipsePoints(start, end, filled);
}

function getRectanglePoints(
  start: Point,
  end: Point,
  filled: boolean,
): Point[] {
  const rect = normalizeSelectionRect(start, end);
  const points: Point[] = [];
  for (let y = rect.y; y < rect.y + rect.height; y++) {
    for (let x = rect.x; x < rect.x + rect.width; x++) {
      if (
        filled ||
        x === rect.x ||
        x === rect.x + rect.width - 1 ||
        y === rect.y ||
        y === rect.y + rect.height - 1
      ) {
        points.push({ x, y });
      }
    }
  }
  return points;
}

function getEllipsePoints(start: Point, end: Point, filled: boolean): Point[] {
  const rect = normalizeSelectionRect(start, end);
  if (rect.width <= 1 || rect.height <= 1) {
    return rect.width >= rect.height
      ? getLinePoints(
          { x: rect.x, y: rect.y },
          { x: rect.x + rect.width - 1, y: rect.y },
        )
      : getLinePoints(
          { x: rect.x, y: rect.y },
          { x: rect.x, y: rect.y + rect.height - 1 },
        );
  }

  if (filled) {
    return getFilledEllipsePoints(rect);
  }
  return getEllipseOutlinePoints(rect);
}

function getFilledEllipsePoints(rect: SelectionRect): Point[] {
  const points: Point[] = [];
  const radiusX = rect.width / 2;
  const radiusY = rect.height / 2;
  const centerX = rect.x + radiusX - 0.5;
  const centerY = rect.y + radiusY - 0.5;
  for (let y = rect.y; y < rect.y + rect.height; y++) {
    for (let x = rect.x; x < rect.x + rect.width; x++) {
      const dx = (x - centerX) / radiusX;
      const dy = (y - centerY) / radiusY;
      if (dx * dx + dy * dy <= 1) {
        points.push({ x, y });
      }
    }
  }
  return points;
}

function getEllipseOutlinePoints(rect: SelectionRect): Point[] {
  const points = new Map<string, Point>();
  const radiusX = (rect.width - 1) / 2;
  const radiusY = (rect.height - 1) / 2;
  const centerX = rect.x + radiusX;
  const centerY = rect.y + radiusY;
  const steps = Math.max(24, Math.ceil(Math.max(rect.width, rect.height) * 8));

  for (let i = 0; i < steps; i++) {
    const angle = (Math.PI * 2 * i) / steps;
    const x = Math.round(centerX + Math.cos(angle) * radiusX);
    const y = Math.round(centerY + Math.sin(angle) * radiusY);
    if (x >= 0 && x < FRAME_SIZE && y >= 0 && y < FRAME_SIZE) {
      points.set(`${x}:${y}`, { x, y });
    }
  }
  return [...points.values()];
}

function drawShapePreview(
  ctx: CanvasRenderingContext2D,
  stateObj: PartEditorState,
): void {
  const start = stateObj.shapeStart;
  const end = stateObj.shapeEnd;
  const tool = stateObj.tool;
  if (!start || !end || !isShapeTool(tool)) return;

  ctx.save();
  ctx.globalAlpha = 0.72;
  ctx.fillStyle = stateObj.activeColor;
  for (const point of getShapePoints(tool, start, end, stateObj.shapeFilled)) {
    drawBrushPreviewPoint(ctx, point, stateObj.brushSize);
  }
  ctx.restore();
}

function drawBrushPreviewPoint(
  ctx: CanvasRenderingContext2D,
  point: Point,
  brushSize: number,
): void {
  const offset = Math.floor(brushSize / 2);
  for (let y = 0; y < brushSize; y++) {
    for (let x = 0; x < brushSize; x++) {
      const px = point.x + x - offset;
      const py = point.y + y - offset;
      if (px >= 0 && px < FRAME_SIZE && py >= 0 && py < FRAME_SIZE) {
        ctx.fillRect(px, py, 1, 1);
      }
    }
  }
}

function drawMainGrid(
  ctx: CanvasRenderingContext2D,
  offscreenCanvas: HTMLCanvasElement,
  stateObj?: PartEditorState,
) {
  ctx.clearRect(0, 0, FRAME_SIZE, FRAME_SIZE);
  if (stateObj?.frameMode && stateObj.onionSkin && stateObj.onionCanvases) {
    ctx.save();
    ctx.globalAlpha = stateObj.onionOpacity;
    const previous =
      stateObj.onionCanvases.previous?.[stateObj.activeDirection];
    const next = stateObj.onionCanvases.next?.[stateObj.activeDirection];
    if (previous) {
      ctx.drawImage(previous, 0, 0);
    }
    if (next) {
      ctx.drawImage(next, 0, 0);
    }
    ctx.restore();
  }
  ctx.drawImage(offscreenCanvas, 0, 0);
  if (stateObj) {
    drawShapePreview(ctx, stateObj);
  }

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

function getVisiblePaletteColors(stateObj: PartEditorState): string[] {
  const counts = new Map<string, number>();
  for (const direction of DIRECTIONS) {
    const imageData = get2DContext(stateObj.canvases[direction]).getImageData(
      0,
      0,
      FRAME_SIZE,
      FRAME_SIZE,
    );
    for (let i = 0; i < imageData.data.length; i += 4) {
      const alpha = imageData.data[i + 3];
      if (alpha === 0) continue;
      const color = rgbToHex(
        imageData.data[i],
        imageData.data[i + 1],
        imageData.data[i + 2],
      );
      counts.set(color, (counts.get(color) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, MAX_EXTRACTED_PALETTE_COLORS)
    .map(([color]) => color);
}

function replaceColorOnActiveLayer(stateObj: PartEditorState): void {
  const activeLayer = getActiveLayer(stateObj);
  if (!activeLayer || activeLayer.locked) return;

  const from = hexToRgbColor(stateObj.replaceFromColor);
  const to = hexToRgbColor(stateObj.replaceToColor);
  const directions = stateObj.replaceAllDirections
    ? DIRECTIONS
    : [stateObj.activeDirection];
  let changedPixels = 0;

  for (const direction of directions) {
    changedPixels += replaceColorInCanvas(
      activeLayer.canvases[direction],
      from,
      to,
      stateObj.replaceTolerance,
    );
  }

  if (changedPixels === 0) return;
  stateObj.activeColor = stateObj.replaceToColor;
  recomposeCanvases(stateObj);
  saveHistory(stateObj);
}

function replaceColorInCanvas(
  canvas: HTMLCanvasElement,
  from: RgbColor,
  to: RgbColor,
  tolerance: number,
): number {
  const ctx = get2DContext(canvas);
  const imageData = ctx.getImageData(0, 0, FRAME_SIZE, FRAME_SIZE);
  const clampedTolerance = Math.max(0, tolerance);
  let changedPixels = 0;

  for (let i = 0; i < imageData.data.length; i += 4) {
    if (imageData.data[i + 3] === 0) continue;
    const matches =
      Math.abs(imageData.data[i] - from.r) <= clampedTolerance &&
      Math.abs(imageData.data[i + 1] - from.g) <= clampedTolerance &&
      Math.abs(imageData.data[i + 2] - from.b) <= clampedTolerance;
    if (!matches) continue;

    imageData.data[i] = to.r;
    imageData.data[i + 1] = to.g;
    imageData.data[i + 2] = to.b;
    changedPixels += 1;
  }

  if (changedPixels > 0) {
    ctx.putImageData(imageData, 0, 0);
  }
  return changedPixels;
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("")}`;
}

function hexToRgbColor(hex: string): RgbColor {
  const clean = hex.replace("#", "").padEnd(6, "0").slice(0, 6);
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
}

function transformActivePixels(
  stateObj: PartEditorState,
  operation: TransformOperation,
): void {
  const activeLayer = getActiveLayer(stateObj);
  if (!activeLayer || activeLayer.locked) return;

  const sourceRect = stateObj.selectionRect ?? {
    x: 0,
    y: 0,
    width: FRAME_SIZE,
    height: FRAME_SIZE,
  };
  const directions = stateObj.transformAllDirections
    ? DIRECTIONS
    : [stateObj.activeDirection];
  let nextSelection: SelectionRect | null = null;
  let changed = false;

  for (const direction of directions) {
    const result = transformCanvasRegion(
      activeLayer.canvases[direction],
      sourceRect,
      operation,
    );
    changed = changed || result.changed;
    nextSelection = nextSelection ?? result.rect;
  }

  if (!changed) return;
  if (stateObj.selectionRect && nextSelection) {
    stateObj.selectionRect = nextSelection;
  }
  stateObj.shapeStart = null;
  stateObj.shapeEnd = null;
  recomposeCanvases(stateObj);
  saveHistory(stateObj);
}

function transformCanvasRegion(
  canvas: HTMLCanvasElement,
  sourceRect: SelectionRect,
  operation: TransformOperation,
): { changed: boolean; rect: SelectionRect } {
  if (sourceRect.width <= 0 || sourceRect.height <= 0) {
    return { changed: false, rect: sourceRect };
  }

  const ctx = get2DContext(canvas);
  if (operation === "clear") {
    ctx.clearRect(
      sourceRect.x,
      sourceRect.y,
      sourceRect.width,
      sourceRect.height,
    );
    return { changed: true, rect: sourceRect };
  }

  const sourceData = ctx.getImageData(
    sourceRect.x,
    sourceRect.y,
    sourceRect.width,
    sourceRect.height,
  );
  const transformedData = transformImageData(sourceData, operation);
  const targetRect = clampTransformedRect(sourceRect, transformedData);
  ctx.clearRect(
    sourceRect.x,
    sourceRect.y,
    sourceRect.width,
    sourceRect.height,
  );
  ctx.putImageData(transformedData, targetRect.x, targetRect.y);
  return { changed: true, rect: targetRect };
}

function transformImageData(
  sourceData: ImageData,
  operation: TransformOperation,
): ImageData {
  if (operation === "rotateClockwise") {
    return rotateImageData(sourceData, true);
  }
  if (operation === "rotateCounterClockwise") {
    return rotateImageData(sourceData, false);
  }
  if (operation === "flipVertical") {
    return flipImageData(sourceData, false);
  }
  return flipImageData(sourceData, true);
}

function flipImageData(sourceData: ImageData, horizontal: boolean): ImageData {
  const output = new ImageData(sourceData.width, sourceData.height);
  for (let y = 0; y < sourceData.height; y++) {
    for (let x = 0; x < sourceData.width; x++) {
      const sourceX = horizontal ? sourceData.width - 1 - x : x;
      const sourceY = horizontal ? y : sourceData.height - 1 - y;
      copyImagePixel(sourceData, output, sourceX, sourceY, x, y);
    }
  }
  return output;
}

function rotateImageData(sourceData: ImageData, clockwise: boolean): ImageData {
  const output = new ImageData(sourceData.height, sourceData.width);
  for (let y = 0; y < sourceData.height; y++) {
    for (let x = 0; x < sourceData.width; x++) {
      const targetX = clockwise ? sourceData.height - 1 - y : y;
      const targetY = clockwise ? x : sourceData.width - 1 - x;
      copyImagePixel(sourceData, output, x, y, targetX, targetY);
    }
  }
  return output;
}

function copyImagePixel(
  sourceData: ImageData,
  targetData: ImageData,
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
): void {
  const sourceIndex = (sourceY * sourceData.width + sourceX) * 4;
  const targetIndex = (targetY * targetData.width + targetX) * 4;
  targetData.data[targetIndex] = sourceData.data[sourceIndex];
  targetData.data[targetIndex + 1] = sourceData.data[sourceIndex + 1];
  targetData.data[targetIndex + 2] = sourceData.data[sourceIndex + 2];
  targetData.data[targetIndex + 3] = sourceData.data[sourceIndex + 3];
}

function clampTransformedRect(
  sourceRect: SelectionRect,
  transformedData: ImageData,
): SelectionRect {
  return {
    x: Math.min(FRAME_SIZE - transformedData.width, Math.max(0, sourceRect.x)),
    y: Math.min(FRAME_SIZE - transformedData.height, Math.max(0, sourceRect.y)),
    width: transformedData.width,
    height: transformedData.height,
  };
}

function getAvailableFrameAnimations(meta: ItemMerged): string[] {
  return Object.keys(ANIMATION_OFFSETS).filter(
    (animation) =>
      supportsStandardAnimation(meta, animation) &&
      getAnimationFrameCount(animation) > 0,
  );
}

function getAnimationConfigName(animation: string): string {
  if (animation === "combat_idle") return "combat";
  if (animation === "backslash") return "1h_backslash";
  if (animation === "halfslash") return "1h_halfslash";
  return animation;
}

function getAnimationFrameCount(animation: string): number {
  const configs = ANIMATION_CONFIGS as Record<
    string,
    { cycle: number[] } | undefined
  >;
  const config = configs[getAnimationConfigName(animation)];
  if (!config || config.cycle.length === 0) return 1;
  return Math.max(...config.cycle) + 1;
}

function getAnimationLabel(animation: string): string {
  const animationEntry = ANIMATIONS.find(
    (entry) =>
      entry.value === animation ||
      (entry.folderName === animation && !entry.noExport),
  );
  if (animationEntry) return animationEntry.label;
  return animation
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getFrameContextKey(animation: string, frameIndex: number): string {
  return `${animation}:${frameIndex}`;
}

function parseFrameContextKey(
  key: string,
): { animation: string; frameIndex: number } | null {
  const [animation, frameText] = key.split(":");
  const frameIndex = Number(frameText);
  if (!animation || !Number.isInteger(frameIndex)) return null;
  return { animation, frameIndex };
}

function saveActiveEditorContext(stateObj: PartEditorState): void {
  const context = createEditorContextSnapshot(stateObj);
  if (stateObj.frameMode) {
    stateObj.frameEditorContexts[
      getFrameContextKey(stateObj.frameAnimation, stateObj.frameIndex)
    ] = context;
  } else {
    stateObj.globalEditorContext = context;
  }
}

async function switchEditorContext(
  stateObj: PartEditorState,
  frameMode: boolean,
  animation = stateObj.frameAnimation,
  frameIndex = stateObj.frameIndex,
): Promise<void> {
  const nextAnimation = stateObj.availableFrameAnimations.includes(animation)
    ? animation
    : (stateObj.availableFrameAnimations[0] ?? "walk");
  const frameCount = getAnimationFrameCount(nextAnimation);
  const nextFrameIndex = Math.min(
    frameCount - 1,
    Math.max(0, Math.round(frameIndex)),
  );

  if (
    stateObj.frameMode === frameMode &&
    (!frameMode ||
      (stateObj.frameAnimation === nextAnimation &&
        stateObj.frameIndex === nextFrameIndex))
  ) {
    return;
  }

  saveActiveEditorContext(stateObj);
  clearSelectionState(stateObj, true);

  if (!frameMode) {
    if (stateObj.globalEditorContext) {
      await restoreEditorContext(stateObj, stateObj.globalEditorContext);
    }
    stateObj.frameMode = false;
    stateObj.onionCanvases = null;
    m.redraw();
    return;
  }

  const contextKey = getFrameContextKey(nextAnimation, nextFrameIndex);
  const existingContext = stateObj.frameEditorContexts[contextKey];
  if (existingContext) {
    await restoreEditorContext(stateObj, existingContext);
  } else {
    const frameCanvases = await loadFrameCanvasesWithGlobalEdits(
      stateObj,
      nextAnimation,
      nextFrameIndex,
    );
    copyDirectionCanvases(frameCanvases, stateObj.originalCanvases);
    resetEditLayers(stateObj);
    recomposeCanvases(stateObj);
    stateObj.history = [];
    stateObj.historyIndex = -1;
    saveHistory(stateObj);
  }

  stateObj.frameMode = true;
  stateObj.activeEditorTab = "animation";
  stateObj.frameAnimation = nextAnimation;
  stateObj.frameIndex = nextFrameIndex;
  await updateOnionCanvases(stateObj);
  m.redraw();
}

async function restoreEditorContext(
  stateObj: PartEditorState,
  context: EditorContextSnapshot,
): Promise<void> {
  await Promise.all(
    DIRECTIONS.map((direction) =>
      loadDataUrlIntoCanvas(
        context.originalCanvases[direction],
        stateObj.originalCanvases[direction],
      ),
    ),
  );

  const layers = await Promise.all(
    context.layers.map((layerSnapshot) =>
      createLayerFromSnapshot(layerSnapshot),
    ),
  );
  if (layers.length === 0) {
    resetEditLayers(stateObj);
  } else {
    stateObj.editLayers = layers;
    stateObj.activeLayerId =
      layers.find((layer) => layer.id === context.activeLayerId)?.id ??
      layers[layers.length - 1].id;
    stateObj.nextLayerNumber = Math.max(context.nextLayerNumber, 1);
  }
  stateObj.history = [...context.history];
  stateObj.historyIndex = Math.min(
    stateObj.history.length - 1,
    Math.max(-1, context.historyIndex),
  );
  recomposeCanvases(stateObj);
}

async function updateOnionCanvases(stateObj: PartEditorState): Promise<void> {
  if (!stateObj.frameMode || !stateObj.onionSkin) {
    stateObj.onionCanvases = null;
    m.redraw();
    return;
  }

  try {
    const frameCount = getAnimationFrameCount(stateObj.frameAnimation);
    const previous =
      stateObj.frameIndex > 0
        ? await loadFrameCanvasesWithGlobalEdits(
            stateObj,
            stateObj.frameAnimation,
            stateObj.frameIndex - 1,
          )
        : null;
    const next =
      stateObj.frameIndex < frameCount - 1
        ? await loadFrameCanvasesWithGlobalEdits(
            stateObj,
            stateObj.frameAnimation,
            stateObj.frameIndex + 1,
          )
        : null;
    stateObj.onionCanvases = { previous, next };
    m.redraw();
  } catch (err) {
    console.warn("Failed to load onion skin frames:", err);
    stateObj.onionCanvases = null;
  }
}

async function loadFrameCanvasesWithGlobalEdits(
  stateObj: PartEditorState,
  animation: string,
  frameIndex: number,
): Promise<Record<Direction, HTMLCanvasElement>> {
  const frameCanvases = await loadAnimationFrameCanvases(
    stateObj,
    animation,
    frameIndex,
  );

  if (stateObj.globalEditorContext) {
    const globalCanvases = await createCanvasesFromContext(
      stateObj.globalEditorContext,
    );
    for (const direction of DIRECTIONS) {
      applyCanvasDiff(
        globalCanvases.originalCanvases[direction],
        globalCanvases.editedCanvases[direction],
        frameCanvases[direction],
      );
    }
  }

  return frameCanvases;
}

async function loadAnimationFrameCanvases(
  stateObj: PartEditorState,
  animation: string,
  frameIndex: number,
): Promise<Record<Direction, HTMLCanvasElement>> {
  const canvases = createDirectionCanvases();
  const baseId = stateObj.baseItemId;
  if (!baseId) return canvases;

  const meta = getItemMerged(baseId).unwrapOr(null);
  if (!meta) return canvases;

  const selection = state.selections[meta.type_name];
  const recolors = getMultiRecolors(baseId, state.selections);
  const pathResult = getSpritePath(
    baseId,
    selection?.variant ?? null,
    recolors,
    state.bodyType,
    animation,
    1,
    state.selections,
    meta,
  );
  if (pathResult.isErr()) return canvases;

  const img = await loadImage(pathResult.value);
  const rowCount = Math.max(1, Math.floor(img.height / FRAME_SIZE));
  const frameCount = Math.max(1, Math.floor(img.width / FRAME_SIZE));
  const clampedFrame = Math.min(frameCount - 1, Math.max(0, frameIndex));
  for (const direction of DIRECTIONS) {
    const row = rowCount >= 4 ? DIRECTION_ROWS[direction] : 0;
    const ctx = get2DContext(canvases[direction]);
    ctx.clearRect(0, 0, FRAME_SIZE, FRAME_SIZE);
    ctx.drawImage(
      img,
      clampedFrame * FRAME_SIZE,
      row * FRAME_SIZE,
      FRAME_SIZE,
      FRAME_SIZE,
      0,
      0,
      FRAME_SIZE,
      FRAME_SIZE,
    );
  }
  return canvases;
}

function copyDirectionCanvases(
  source: Record<Direction, HTMLCanvasElement>,
  target: Record<Direction, HTMLCanvasElement>,
): void {
  for (const direction of DIRECTIONS) {
    const ctx = get2DContext(target[direction]);
    ctx.clearRect(0, 0, FRAME_SIZE, FRAME_SIZE);
    ctx.drawImage(source[direction], 0, 0);
  }
}

async function createCanvasesFromContext(
  context: EditorContextSnapshot,
): Promise<{
  originalCanvases: Record<Direction, HTMLCanvasElement>;
  editedCanvases: Record<Direction, HTMLCanvasElement>;
}> {
  const originalCanvases = createDirectionCanvases();
  await Promise.all(
    DIRECTIONS.map((direction) =>
      loadDataUrlIntoCanvas(
        context.originalCanvases[direction],
        originalCanvases[direction],
      ),
    ),
  );

  const layers = await Promise.all(
    context.layers.map((layerSnapshot) =>
      createLayerFromSnapshot(layerSnapshot),
    ),
  );
  const editedCanvases = createDirectionCanvases();
  composeLayersIntoCanvases(layers, editedCanvases);
  return { originalCanvases, editedCanvases };
}

async function createFrameOverrides(
  stateObj: PartEditorState,
): Promise<FrameOverride[]> {
  const overrides: FrameOverride[] = [];
  for (const [key, context] of Object.entries(stateObj.frameEditorContexts)) {
    const parsed = parseFrameContextKey(key);
    if (!parsed) continue;
    const { editedCanvases } = await createCanvasesFromContext(context);
    overrides.push({
      animation: parsed.animation,
      frameIndex: parsed.frameIndex,
      canvases: editedCanvases,
    });
  }
  return overrides;
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
    locked: false,
    alphaLocked: false,
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

function toggleActiveLayerPixelLock(stateObj: PartEditorState): boolean {
  const activeLayer = getActiveLayer(stateObj);
  return activeLayer ? toggleLayerPixelLock(stateObj, activeLayer) : false;
}

function toggleLayerPixelLock(
  stateObj: PartEditorState,
  layer: EditorLayer,
): boolean {
  layer.locked = !layer.locked;
  if (layer.locked && layer.id === stateObj.activeLayerId) {
    clearSelectionState(stateObj, true);
  }
  saveHistory(stateObj);
  return true;
}

function toggleActiveLayerAlphaLock(stateObj: PartEditorState): boolean {
  const activeLayer = getActiveLayer(stateObj);
  return activeLayer ? toggleLayerAlphaLock(stateObj, activeLayer) : false;
}

function toggleLayerAlphaLock(
  stateObj: PartEditorState,
  layer: EditorLayer,
): boolean {
  if (layer.locked) return false;
  layer.alphaLocked = !layer.alphaLocked;
  saveHistory(stateObj);
  return true;
}

function getActiveLayerToolState(
  stateObj: PartEditorState,
): PixelEditorToolState | null {
  const activeLayer = getActiveLayer(stateObj);
  if (!activeLayer || activeLayer.locked) return null;

  return {
    activeDirection: stateObj.activeDirection,
    tool: stateObj.tool,
    activeColor: stateObj.activeColor,
    autoPropagate: stateObj.autoPropagate,
    canvases: activeLayer.canvases,
    brushSize: stateObj.brushSize,
    mirrorX: stateObj.mirrorX,
    mirrorY: stateObj.mirrorY,
    alphaLocked: activeLayer.alphaLocked,
  };
}

function recomposeCanvases(stateObj: PartEditorState): void {
  composeLayersIntoCanvases(stateObj.editLayers, stateObj.canvases);
  // Populate or update thumbnail cache after recomposing
  if (!stateObj.thumbnailCache) {
    stateObj.thumbnailCache = {
      front: document.createElement("canvas"),
      back: document.createElement("canvas"),
      left: document.createElement("canvas"),
      right: document.createElement("canvas"),
    };
    for (const direction of DIRECTIONS) {
      stateObj.thumbnailCache[direction].width = 64;
      stateObj.thumbnailCache[direction].height = 64;
    }
  }
  for (const direction of DIRECTIONS) {
    const thumb = stateObj.thumbnailCache[direction];
    const ctx = get2DContext(thumb);
    ctx.clearRect(0, 0, 64, 64);
    ctx.drawImage(stateObj.canvases[direction], 0, 0);
  }
}

function composeLayersIntoCanvases(
  layers: EditorLayer[],
  targetCanvases: Record<Direction, HTMLCanvasElement>,
): void {
  for (const direction of DIRECTIONS) {
    const ctx = get2DContext(targetCanvases[direction]);
    ctx.clearRect(0, 0, FRAME_SIZE, FRAME_SIZE);
    ctx.globalAlpha = 1;

    for (const layer of layers) {
      if (!layer.visible || layer.opacity <= 0) continue;
      ctx.globalAlpha = Math.min(1, Math.max(0, layer.opacity));
      ctx.drawImage(layer.canvases[direction], 0, 0);
    }
    ctx.globalAlpha = 1;
  }
}

function applyCanvasDiff(
  originalCanvas: HTMLCanvasElement,
  editedCanvas: HTMLCanvasElement,
  targetCanvas: HTMLCanvasElement,
): void {
  const originalData = get2DContext(originalCanvas).getImageData(
    0,
    0,
    FRAME_SIZE,
    FRAME_SIZE,
  );
  const editedData = get2DContext(editedCanvas).getImageData(
    0,
    0,
    FRAME_SIZE,
    FRAME_SIZE,
  );
  const targetCtx = get2DContext(targetCanvas);
  const targetData = targetCtx.getImageData(0, 0, FRAME_SIZE, FRAME_SIZE);

  for (let y = 0; y < FRAME_SIZE; y++) {
    for (let x = 0; x < FRAME_SIZE; x++) {
      const idx = (y * FRAME_SIZE + x) * 4;
      const originalMatches =
        originalData.data[idx] === editedData.data[idx] &&
        originalData.data[idx + 1] === editedData.data[idx + 1] &&
        originalData.data[idx + 2] === editedData.data[idx + 2] &&
        originalData.data[idx + 3] === editedData.data[idx + 3];
      if (originalMatches) continue;

      targetData.data[idx] = editedData.data[idx];
      targetData.data[idx + 1] = editedData.data[idx + 1];
      targetData.data[idx + 2] = editedData.data[idx + 2];
      targetData.data[idx + 3] = editedData.data[idx + 3];
    }
  }

  targetCtx.putImageData(targetData, 0, 0);
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
  layer.locked = activeLayer.locked;
  layer.alphaLocked = activeLayer.alphaLocked;
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
  if (stateObj.editLayers[activeIndex]?.locked) return;

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
  if (activeLayer.locked || targetLayer.locked) return;

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
  frameOverrides: FrameOverride[],
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
    applyFrameOverrides(outCtx, baseImg, animName, frameOverrides);
    sheets[animName] = outCanvas;
  }

  return sheets;
}

function applyFrameOverrides(
  ctx: CanvasRenderingContext2D,
  baseImg: HTMLImageElement,
  animation: string,
  frameOverrides: FrameOverride[],
): void {
  const rowCount = Math.floor(baseImg.height / FRAME_SIZE);
  const frameCount = Math.floor(baseImg.width / FRAME_SIZE);
  if (rowCount <= 0 || frameCount <= 0) return;

  for (const override of frameOverrides) {
    if (override.animation !== animation) continue;
    if (override.frameIndex < 0 || override.frameIndex >= frameCount) continue;

    if (rowCount < 4) {
      for (let row = 0; row < rowCount; row++) {
        ctx.clearRect(
          override.frameIndex * FRAME_SIZE,
          row * FRAME_SIZE,
          FRAME_SIZE,
          FRAME_SIZE,
        );
        ctx.drawImage(
          override.canvases.front,
          override.frameIndex * FRAME_SIZE,
          row * FRAME_SIZE,
        );
      }
      continue;
    }

    for (const direction of DIRECTIONS) {
      ctx.clearRect(
        override.frameIndex * FRAME_SIZE,
        DIRECTION_ROWS[direction] * FRAME_SIZE,
        FRAME_SIZE,
        FRAME_SIZE,
      );
      ctx.drawImage(
        override.canvases[direction],
        override.frameIndex * FRAME_SIZE,
        DIRECTION_ROWS[direction] * FRAME_SIZE,
      );
    }
  }
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
  stateObj.unsavedChanges = true;
  debouncedAutosave(stateObj);
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
      locked: layer.locked,
      alphaLocked: layer.alphaLocked,
      canvases: {
        front: layer.canvases.front.toDataURL(),
        back: layer.canvases.back.toDataURL(),
        left: layer.canvases.left.toDataURL(),
        right: layer.canvases.right.toDataURL(),
      },
    })),
  };
}

function createEditorContextSnapshot(
  stateObj: PartEditorState,
): EditorContextSnapshot {
  const layerSnapshot = createHistorySnapshot(stateObj);
  return {
    ...layerSnapshot,
    originalCanvases: {
      front: stateObj.originalCanvases.front.toDataURL(),
      back: stateObj.originalCanvases.back.toDataURL(),
      left: stateObj.originalCanvases.left.toDataURL(),
      right: stateObj.originalCanvases.right.toDataURL(),
    },
    history: [...stateObj.history],
    historyIndex: stateObj.historyIndex,
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
    locked: snapshot.locked ?? false,
    alphaLocked: snapshot.alphaLocked ?? false,
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

function debouncedRecomposeCanvases(stateObj: PartEditorState): void {
  if (stateObj.recomposeDebounceTimer) {
    window.clearTimeout(stateObj.recomposeDebounceTimer);
  }
  stateObj.recomposeDebounceTimer = window.setTimeout(() => {
    recomposeCanvases(stateObj);
    m.redraw();
  }, 100);
}

function debouncedAutosave(stateObj: PartEditorState): void {
  if (!stateObj.baseItemId) return;
  if (stateObj.autosaveDebounceTimer) {
    window.clearTimeout(stateObj.autosaveDebounceTimer);
  }
  stateObj.autosaveDebounceTimer = window.setTimeout(() => {
    const snapshot = JSON.stringify(createEditorContextSnapshot(stateObj));
    void saveDraft(stateObj.baseItemId!, snapshot);
  }, 500);
}

function flipImageDataHorizontal(sourceData: ImageData): ImageData {
  const output = new ImageData(sourceData.width, sourceData.height);
  for (let y = 0; y < sourceData.height; y++) {
    for (let x = 0; x < sourceData.width; x++) {
      const sourceX = sourceData.width - 1 - x;
      const sourceY = y;
      copyImagePixel(sourceData, output, sourceX, sourceY, x, y);
    }
  }
  return output;
}

function renderStatusBar(stateObj: PartEditorState): m.Children {
  const cursor = stateObj.cursorPosition;
  const cursorText = cursor ? `${cursor.x},${cursor.y}` : "—";
  const activeLayer = getActiveLayer(stateObj);
  const layerName = activeLayer?.name ?? "—";
  const frameText = stateObj.frameMode
    ? `F${stateObj.frameIndex + 1}`
    : "Global";

  return m("div.part-editor-status-bar", [
    m("span.part-editor-status-item", `Pos: ${cursorText}`),
    m("span.part-editor-status-item", `Dir: ${stateObj.activeDirection.toUpperCase()}`),
    m("span.part-editor-status-item", `Zoom: ${stateObj.zoom}x`),
    m("span.part-editor-status-item", `Layer: ${layerName}`),
    m("span.part-editor-status-item", `Brush: ${stateObj.brushSize}px`),
    m("span.part-editor-status-item", frameText),
  ]);
}

function renderRecoveryPrompt(stateObj: PartEditorState): m.Children {
  return m("div.part-editor-recovery-overlay", [
    m("div.part-editor-recovery-dialog", [
      m("h4", "Recover Unsaved Draft?"),
      m("p", "You have unsaved edits from a previous session."),
      m("div.part-editor-recovery-actions", [
        m(
          "button.part-editor-pro-button",
          {
            type: "button",
            onclick: async () => {
              const draft = await loadDraft(stateObj.baseItemId!);
              if (draft) {
                try {
                  const context = JSON.parse(draft) as EditorContextSnapshot;
                  await restoreEditorContext(stateObj, context);
                  stateObj.globalEditorContext = context;
                  stateObj.unsavedChanges = true;
                } catch (err) {
                  console.warn("Failed to restore draft:", err);
                }
              }
              stateObj.showRecoveryPrompt = false;
              m.redraw();
            },
          },
          "Restore Draft",
        ),
        m(
          "button.part-editor-pro-button.part-editor-transform-clear",
          {
            type: "button",
            onclick: () => {
              stateObj.showRecoveryPrompt = false;
              if (stateObj.baseItemId) {
                void clearDraft(stateObj.baseItemId);
              }
              m.redraw();
            },
          },
          "Discard",
        ),
      ]),
    ]),
  ]);
}

function renderTimelineThumbnails(
  stateObj: PartEditorState,
  frameCount: number,
): m.Children {
  if (!stateObj.frameMode || frameCount <= 1) return null;

  return m("div.part-editor-timeline-strip", [
    Array.from({ length: frameCount }, (_, i) => {
      const isActive = i === stateObj.frameIndex;
      const dirty = isFrameDirty(stateObj, i);
      return m(
        "div.part-editor-timeline-thumb",
        {
          key: i,
          class: isActive ? "active" : "",
          title: `Frame ${i + 1}${dirty ? " (edited)" : ""}`,
          onclick: () => {
            void switchEditorContext(stateObj, true, stateObj.frameAnimation, i);
          },
        },
        [
          m("span.part-editor-timeline-label", String(i + 1)),
          dirty ? m("span.part-editor-timeline-dot") : null,
        ],
      );
    }),
  ]);
}

function isFrameDirty(
  stateObj: PartEditorState,
  frameIndex: number,
): boolean {
  const key = getFrameContextKey(stateObj.frameAnimation, frameIndex);
  const frameContext = stateObj.frameEditorContexts[key];
  if (!frameContext) return false;
  if (!stateObj.globalEditorContext) return true;
  return (
    JSON.stringify(frameContext) !==
    JSON.stringify(stateObj.globalEditorContext)
  );
}

async function applyGlobalToFrame(stateObj: PartEditorState): Promise<void> {
  if (!stateObj.frameMode || !stateObj.globalEditorContext) return;
  const globalContext = stateObj.globalEditorContext;
  await restoreEditorContext(stateObj, globalContext);
  saveActiveEditorContext(stateObj);
  stateObj.frameEditorContexts[
    getFrameContextKey(stateObj.frameAnimation, stateObj.frameIndex)
  ] = createEditorContextSnapshot(stateObj);
  recomposeCanvases(stateObj);
  m.redraw();
}

function startPlayback(stateObj: PartEditorState): void {
  stateObj.isPlaying = true;
  stateObj.playbackTimer = window.setInterval(() => {
    advancePlayback(stateObj);
  }, 200);
  m.redraw();
}

function stopPlayback(stateObj: PartEditorState): void {
  stateObj.isPlaying = false;
  if (stateObj.playbackTimer) {
    window.clearInterval(stateObj.playbackTimer);
    stateObj.playbackTimer = null;
  }
  m.redraw();
}

function advancePlayback(stateObj: PartEditorState): void {
  const frameCount = getAnimationFrameCount(stateObj.frameAnimation);
  const nextIndex =
    stateObj.frameIndex + 1 >= frameCount ? 0 : stateObj.frameIndex + 1;
  void switchEditorContext(stateObj, true, stateObj.frameAnimation, nextIndex);
}

function handleTouchStart(e: TouchEvent, stateObj: PartEditorState): void {
  if (e.touches.length === 2) {
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    stateObj.touchStartDist = Math.hypot(dx, dy);
    stateObj.touchStartZoom = stateObj.zoom;
    stateObj.lastTouchCenter = {
      x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
      y: (e.touches[0].clientY + e.touches[1].clientY) / 2,
    };
  }
}

function handleTouchMove(e: TouchEvent, stateObj: PartEditorState): void {
  if (e.touches.length === 2 && stateObj.touchStartDist > 0) {
    e.preventDefault();
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    const dist = Math.hypot(dx, dy);
    const scale = dist / stateObj.touchStartDist;
    const nextZoom = clampEditorZoom(
      Math.round(stateObj.touchStartZoom * scale),
    );
    if (nextZoom !== stateObj.zoom) {
      stateObj.zoom = nextZoom;
    }
  }
}

function handleTouchEnd(stateObj: PartEditorState): void {
  stateObj.touchStartDist = 0;
  stateObj.lastTouchCenter = null;
}

async function checkForDraftRecovery(
  stateObj: PartEditorState,
  itemId: string,
): Promise<void> {
  if (await hasUnsavedDraft(itemId)) {
    stateObj.showRecoveryPrompt = true;
    m.redraw();
  }
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
