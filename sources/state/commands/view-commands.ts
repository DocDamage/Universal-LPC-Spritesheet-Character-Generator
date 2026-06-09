import { setPreviewCanvasZoom } from "../../canvas/preview-canvas.ts";
import { clamp } from "../../utils/helpers.ts";
import { showToast } from "../notifications.ts";
import { selectItem, state } from "../state.ts";
import type { Command, EditorCommandContext } from "../commands.ts";

const MIN_PREVIEW_ZOOM = 0.5;
const MAX_PREVIEW_ZOOM = 5;
const PREVIEW_ZOOM_STEP = 0.25;
const MIN_EDITOR_ZOOM = 2;
const MAX_EDITOR_ZOOM = 16;
const DEFAULT_EDITOR_ZOOM = 4;
const SHADOW_ITEM_ID = "shadow";
const SHADOW_VARIANT = "shadow";

export type ViewCommandContext = {
  getEditorContext: () => EditorCommandContext | null;
  hasActiveEditor: () => boolean;
};

export function getViewCommands(context: ViewCommandContext): Command[] {
  return [
    {
      id: "view.zoom.in",
      label: "Zoom In",
      category: "View",
      shortcut: "Ctrl++",
      keyCombo: { key: ["=", "+"], ctrlKey: true },
      action: () => zoomIn(context),
    },
    {
      id: "view.zoom.out",
      label: "Zoom Out",
      category: "View",
      shortcut: "Ctrl+-",
      keyCombo: { key: "-", ctrlKey: true },
      action: () => zoomOut(context),
    },
    {
      id: "view.zoom.reset",
      label: "Reset Zoom",
      category: "View",
      shortcut: "Ctrl+0",
      keyCombo: { key: "0", ctrlKey: true },
      action: () => resetZoom(context),
    },
    {
      id: "app.grid.toggle",
      label: "Toggle Transparency Grid",
      category: "View",
      tooltip: "Toggle the preview transparency grid",
      action: () => {
        state.showTransparencyGrid = !state.showTransparencyGrid;
        showToast(
          state.showTransparencyGrid
            ? "Transparency grid enabled."
            : "Transparency grid disabled.",
          { kind: "success" },
        );
      },
    },
    {
      id: "app.shadows.toggle",
      label: "Toggle Cast Shadow",
      category: "View",
      tooltip: "Toggle the cast shadow layer",
      action: () => {
        const isSelected =
          state.selections["shadow"]?.itemId === SHADOW_ITEM_ID;
        selectItem(SHADOW_ITEM_ID, SHADOW_VARIANT, isSelected);
        showToast(
          isSelected ? "Cast shadow disabled." : "Cast shadow enabled.",
          { kind: "success" },
        );
      },
    },
  ];
}

function zoomIn(context: ViewCommandContext): void {
  const editorContext = context.getEditorContext();
  if (context.hasActiveEditor() && editorContext) {
    editorContext.zoom = clampEditorZoom(editorContext.zoom + 1);
    return;
  }
  const zoom = clampPreviewZoom(
    (state.previewCanvasZoomLevel || 1) + PREVIEW_ZOOM_STEP,
  );
  state.previewCanvasZoomLevel = zoom;
  setPreviewCanvasZoom(zoom);
}

function zoomOut(context: ViewCommandContext): void {
  const editorContext = context.getEditorContext();
  if (context.hasActiveEditor() && editorContext) {
    editorContext.zoom = clampEditorZoom(editorContext.zoom - 1);
    return;
  }
  const zoom = clampPreviewZoom(
    (state.previewCanvasZoomLevel || 1) - PREVIEW_ZOOM_STEP,
  );
  state.previewCanvasZoomLevel = zoom;
  setPreviewCanvasZoom(zoom);
}

function resetZoom(context: ViewCommandContext): void {
  const editorContext = context.getEditorContext();
  if (context.hasActiveEditor() && editorContext) {
    editorContext.zoom = DEFAULT_EDITOR_ZOOM;
    return;
  }
  state.previewCanvasZoomLevel = 1;
  setPreviewCanvasZoom(1);
}

function clampPreviewZoom(value: number): number {
  return clamp(value, MIN_PREVIEW_ZOOM, MAX_PREVIEW_ZOOM);
}

function clampEditorZoom(value: number): number {
  return clamp(value, MIN_EDITOR_ZOOM, MAX_EDITOR_ZOOM);
}
