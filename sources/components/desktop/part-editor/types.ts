import {
  type Direction,
  type PixelEditorToolState,
  type Point,
} from "../pixel-editor-tools.ts";

export { Direction, Point, PixelEditorToolState };

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
  referenceImageUrl: string | null;
  referenceOpacity: number;
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
  uploadedPaletteColors: string[] | null;
  collapsedLayerGroups: Record<string, boolean>; // Group Name -> Collapsed state
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
  blendMode?: GlobalCompositeOperation;
};

export type EditorLayerSnapshot = {
  id: string;
  name: string;
  visible: boolean;
  opacity: number;
  locked?: boolean;
  alphaLocked?: boolean;
  blendMode?: string;
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

export type FrameOverride = {
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

export type ShapeTool = "line" | "rect" | "ellipse";

export type TransformOperation =
  | "flipHorizontal"
  | "flipVertical"
  | "rotateClockwise"
  | "rotateCounterClockwise"
  | "clear";

export type RgbColor = {
  r: number;
  g: number;
  b: number;
};

export const QUICK_COLORS = [
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

export const DIRECTION_ROWS: Record<Direction, number> = {
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
export const MAX_EXTRACTED_PALETTE_COLORS = 36;

export function getFrameContextKey(
  animation: string,
  frameIndex: number,
): string {
  return `${animation}:${frameIndex}`;
}

export function parseFrameContextKey(
  key: string,
): { animation: string; frameIndex: number } | null {
  const [animation, frameText] = key.split(":");
  const frameIndex = Number(frameText);
  if (!animation || !Number.isInteger(frameIndex)) return null;
  return { animation, frameIndex };
}
