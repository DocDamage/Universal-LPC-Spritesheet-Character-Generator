import { FRAME_SIZE } from "../../../state/constants.ts";
import { clamp } from "../../../utils/helpers.ts";

import {
  PartEditorState,
  EditorWheelZoomInput,
  EditorWheelZoomUpdate,
  MIN_EDITOR_ZOOM,
  MAX_EDITOR_ZOOM,
  DEFAULT_EDITOR_ZOOM,
} from "./types.ts";
import { createDirectionCanvases } from "./canvas.ts";
import { resetEditLayers } from "./layers.ts";
import { recomposeCanvases } from "./canvas.ts";
import { saveHistory } from "./history.ts";

export function clampEditorZoom(value: number): number {
  return clamp(value, MIN_EDITOR_ZOOM, MAX_EDITOR_ZOOM);
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
  const boundedRatioX = clamp(pointerRatioX, 0, 1);
  const boundedRatioY = clamp(pointerRatioY, 0, 1);
  const scrollLeftDelta = sizeDelta * boundedRatioX;
  const scrollTopDelta = sizeDelta * boundedRatioY;

  return {
    nextZoom,
    scrollLeftDelta: scrollLeftDelta === 0 ? 0 : scrollLeftDelta,
    scrollTopDelta: scrollTopDelta === 0 ? 0 : scrollTopDelta,
    changed: nextZoom !== oldZoom,
  };
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
    referenceImageUrl: null,
    referenceOpacity: 0.3,
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
    uploadedPaletteColors: null,
    collapsedLayerGroups: {},
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
