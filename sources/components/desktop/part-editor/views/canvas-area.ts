// Canvas drawing area: main canvas, zoom controls, direction thumbnails, reference overlay
import m from "mithril";
import type { PartEditorState } from "../types.ts";
import { FRAME_SIZE } from "../../../../state/constants.ts";
import { get2DContext } from "../../../../canvas/canvas-utils.ts";
import { drawMainGrid } from "../canvas.ts";
import { getCanvasPoint } from "../selection.ts";
import { isShapeTool } from "../shapes.ts";
import { getAnimationLabel } from "../animation.ts";
import { clampEditorZoom } from "../state.ts";
import { MIN_EDITOR_ZOOM, MAX_EDITOR_ZOOM } from "../types.ts";
import { createCanvasInteractionHandlers } from "../canvas-interactions.ts";
import { handleTouchStart, handleTouchMove, handleTouchEnd } from "../touch.ts";

type ZoomControlsProps = {
  zoom: number;
  setZoom: (zoom: number) => void;
};

export function renderZoomControls({ zoom, setZoom }: ZoomControlsProps): m.Children {
  return m("div.part-editor-zoom-controls", [
    m(
      "button.part-editor-zoom-button",
      {
        type: "button",
        title: "Zoom out",
        disabled: zoom <= MIN_EDITOR_ZOOM,
        onclick: () => setZoom(zoom - 1),
      },
      "−",
    ),
    m("input.part-editor-zoom-slider", {
      type: "range",
      min: String(MIN_EDITOR_ZOOM),
      max: String(MAX_EDITOR_ZOOM),
      step: "1",
      value: String(zoom),
      title: "Editor zoom",
      oninput: (e: Event) => {
        setZoom(Number((e.target as HTMLInputElement).value));
      },
    }),
    m("span.part-editor-zoom-value", `${zoom}x`),
    m(
      "button.part-editor-zoom-button",
      {
        type: "button",
        title: "Zoom in",
        disabled: zoom >= MAX_EDITOR_ZOOM,
        onclick: () => setZoom(zoom + 1),
      },
      "+",
    ),
  ]);
}

export function renderThumbnailCanvas(
  stateObj: PartEditorState,
  dir: "front" | "back" | "left" | "right",
): m.Children {
  return m(
    "div.part-editor-dir-thumb",
    {
      key: dir,
      class: stateObj.activeDirection === dir ? "active" : "",
      title: `Edit ${dir} view`,
      onclick: () => {
        stateObj.activeDirection = dir;
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
          ctx.drawImage(stateObj.canvases[dir], 0, 0);
        },
        onupdate: (vnodeDOM) => {
          const el = vnodeDOM.dom as HTMLCanvasElement;
          const ctx = get2DContext(el);
          const cache = stateObj.thumbnailCache?.[dir];
          if (cache) {
            ctx.clearRect(0, 0, 64, 64);
            ctx.drawImage(cache, 0, 0);
          } else {
            ctx.clearRect(0, 0, 64, 64);
            ctx.drawImage(stateObj.canvases[dir], 0, 0);
          }
        },
      }),
      m("span.part-editor-dir-label", dir.toUpperCase()),
    ],
  );
}

export function renderDirectionThumbnails(stateObj: PartEditorState): m.Children {
  return m("div.part-editor-directions-row.mb-3", [
    (["front", "back", "left", "right"] as const).map((dir) =>
      renderThumbnailCanvas(stateObj, dir),
    ),
  ]);
}

export function renderCanvasArea(
  stateObj: PartEditorState,
  canvasHandlers: ReturnType<typeof createCanvasInteractionHandlers>,
): m.Children {
  const activeCanvas = stateObj.canvases[stateObj.activeDirection];
  const canvasDisplaySize = `${FRAME_SIZE * stateObj.zoom}px`;
  const editorModeLabel = stateObj.frameMode
    ? `${getAnimationLabel(stateObj.frameAnimation)} F${stateObj.frameIndex + 1}`
    : "GLOBAL";

  return m("div.part-editor-canvas-container.mb-2", [
    m("div.part-editor-canvas-header", [
      m(
        "span",
        `${stateObj.activeDirection.toUpperCase()} VIEW  ·  ${stateObj.tool.toUpperCase()} MODE  ·  ${editorModeLabel}  ·  64×64`,
      ),
      renderZoomControls({
        zoom: stateObj.zoom,
        setZoom: (zoom: number) => { stateObj.zoom = clampEditorZoom(zoom); },
      }),
    ]),
    m(
      "div.part-editor-canvas-stage",
      {
        title:
          "Scroll over the canvas to zoom. Two-finger drag to pan, pinch to zoom.",
        onwheel: canvasHandlers.handleCanvasWheel,
        ontouchstart: (e: TouchEvent) => {
          handleTouchStart(e, stateObj);
        },
        ontouchmove: (e: TouchEvent) => {
          handleTouchMove(e, stateObj);
          if (e.touches.length === 2 && stateObj.lastTouchCenter) {
            const currentCenter = {
              x: (e.touches[0]!.clientX + e.touches[1]!.clientX) / 2,
              y: (e.touches[0]!.clientY + e.touches[1]!.clientY) / 2,
            };
            const dx = currentCenter.x - stateObj.lastTouchCenter.x;
            const dy = currentCenter.y - stateObj.lastTouchCenter.y;
            const stage = e.currentTarget as HTMLElement;
            stage.scrollLeft -= dx;
            stage.scrollTop -= dy;
            stateObj.lastTouchCenter = currentCenter;
          }
        },
        ontouchend: () => {
          handleTouchEnd(stateObj);
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
            stateObj.referenceImageUrl
              ? m("img", {
                  src: stateObj.referenceImageUrl,
                  style: {
                    position: "absolute",
                    top: "0",
                    left: "0",
                    width: "100%",
                    height: "100%",
                    opacity: String(stateObj.referenceOpacity),
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
                backgroundImage: stateObj.showGrid ? undefined : "none",
                backgroundColor: stateObj.referenceImageUrl
                  ? "transparent"
                  : undefined,
                cursor:
                  stateObj.tool === "picker"
                    ? "crosshair"
                    : stateObj.tool === "select"
                      ? "crosshair"
                      : isShapeTool(stateObj.tool)
                        ? "crosshair"
                        : stateObj.tool === "eraser"
                          ? "cell"
                          : "crosshair",
              },
              oncreate: (vnodeDOM) => {
                const el = vnodeDOM.dom as HTMLCanvasElement;
                const ctx = get2DContext(el);
                ctx.imageSmoothingEnabled = false;
                drawMainGrid(ctx, activeCanvas, stateObj);
              },
              onupdate: (vnodeDOM) => {
                const el = vnodeDOM.dom as HTMLCanvasElement;
                const ctx = get2DContext(el);
                ctx.imageSmoothingEnabled = false;
                drawMainGrid(ctx, activeCanvas, stateObj);
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
                stateObj.cursorPosition = point;
                canvasHandlers.handleCanvasMove(e, canvasEl);
              },
              onmouseup: (e: MouseEvent) => {
                canvasHandlers.handleCanvasUp(
                  e.target as HTMLCanvasElement,
                );
              },
              onmouseleave: (e: MouseEvent) => {
                stateObj.cursorPosition = null;
                canvasHandlers.handleCanvasLeave(
                  e.target as HTMLCanvasElement,
                );
              },
            }),
          ],
        ),
      ],
    ),
    renderDirectionThumbnails(stateObj),
  ]);
}
