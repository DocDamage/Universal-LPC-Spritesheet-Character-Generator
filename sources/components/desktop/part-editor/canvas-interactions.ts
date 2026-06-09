import m from "mithril";
import { clamp } from "../../../utils/helpers.ts";
import {
  applyBrush,
  applyFill,
  getLinePoints,
  sampleColor,
} from "../pixel-editor-tools.ts";
import { recomposeCanvases, refreshVisibleCanvas } from "./canvas.ts";
import { getActiveLayerToolState } from "./layers.ts";
import {
  finishSelectionInteraction,
  getCanvasPoint,
  startSelectionInteraction,
  updateSelectionInteraction,
} from "./selection.ts";
import {
  finishShapeInteraction,
  isShapeTool,
  startShapeInteraction,
} from "./shapes.ts";
import { saveHistory } from "./history.ts";
import { getEditorWheelZoomUpdate } from "./state.ts";
import type { PartEditorState } from "./types.ts";

type CanvasHandlersArgs = {
  editorState: PartEditorState;
  setZoom: (zoom: number) => void;
};

export function createCanvasInteractionHandlers({
  editorState,
  setZoom,
}: CanvasHandlersArgs) {
  const handleCanvasWheel = (e: WheelEvent): void => {
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
      zoom: editorState.zoom,
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

  const drawOnMain = (e: MouseEvent, canvasEl: HTMLCanvasElement): void => {
    const point = getCanvasPoint(e, canvasEl);
    if (!point) return;

    const tool = e.altKey ? "picker" : editorState.tool;
    if (tool === "select" || isShapeTool(tool)) return;

    if (tool === "picker") {
      const sampledColor = sampleColor(editorState, point);
      if (sampledColor) {
        editorState.activeColor = sampledColor;
      }
      editorState.tool = "pen";
      editorState.lastPoint = point;
      return;
    }

    const layerState = getActiveLayerToolState(editorState);
    if (!layerState) return;

    if (tool === "fill") {
      applyFill(layerState, point);
      recomposeCanvases(editorState);
      refreshVisibleCanvas(canvasEl, editorState);
      editorState.lastPoint = point;
      return;
    }

    const points =
      e.shiftKey && editorState.lastPoint
        ? getLinePoints(editorState.lastPoint, point)
        : [point];

    for (const p of points) {
      applyBrush(layerState, p, tool === "eraser" ? "erase" : "paint");
    }
    recomposeCanvases(editorState);
    refreshVisibleCanvas(canvasEl, editorState);
    editorState.lastPoint = point;
  };

  const handleCanvasDown = (
    e: MouseEvent,
    canvasEl: HTMLCanvasElement,
  ): void => {
    const point = getCanvasPoint(e, canvasEl);
    if (!point) return;

    if (editorState.tool === "select" && !e.altKey) {
      editorState.isDrawing = false;
      startSelectionInteraction(editorState, point);
      recomposeCanvases(editorState);
      refreshVisibleCanvas(canvasEl, editorState);
      return;
    }

    if (isShapeTool(editorState.tool) && !e.altKey) {
      editorState.isDrawing = false;
      startShapeInteraction(editorState, point);
      refreshVisibleCanvas(canvasEl, editorState);
      return;
    }

    editorState.isDrawing = true;
    drawOnMain(e, canvasEl);
  };

  const handleCanvasMove = (
    e: MouseEvent,
    canvasEl: HTMLCanvasElement,
  ): void => {
    const point = getCanvasPoint(e, canvasEl);
    if (!point) return;

    if (editorState.selectionDraftStart || editorState.selectionMove) {
      updateSelectionInteraction(editorState, point);
      recomposeCanvases(editorState);
      refreshVisibleCanvas(canvasEl, editorState);
      return;
    }

    if (editorState.shapeStart) {
      editorState.shapeEnd = point;
      refreshVisibleCanvas(canvasEl, editorState);
      return;
    }

    if (editorState.isDrawing) {
      drawOnMain(e, canvasEl);
    }
  };

  const handleCanvasUp = (canvasEl: HTMLCanvasElement): void => {
    const movedSelection = finishSelectionInteraction(editorState);
    if (movedSelection) {
      saveHistory(editorState);
    }

    const drewShape = finishShapeInteraction(editorState);
    if (drewShape) {
      saveHistory(editorState);
    }

    if (editorState.isDrawing) {
      editorState.isDrawing = false;
      saveHistory(editorState);
    }

    recomposeCanvases(editorState);
    refreshVisibleCanvas(canvasEl, editorState);
    m.redraw();
  };

  const handleCanvasLeave = (canvasEl: HTMLCanvasElement): void => {
    if (
      !editorState.isDrawing &&
      !editorState.selectionDraftStart &&
      !editorState.selectionMove &&
      !editorState.shapeStart
    ) {
      return;
    }

    handleCanvasUp(canvasEl);
  };

  return {
    handleCanvasDown,
    handleCanvasLeave,
    handleCanvasMove,
    handleCanvasUp,
    handleCanvasWheel,
  };
}
