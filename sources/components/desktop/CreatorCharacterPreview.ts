import m from "mithril";
import {
  renderDirectionalPreviewCanvases,
  setPreviewAnimation,
} from "../../canvas/preview-animation.ts";
import { buildRenderKey } from "../render-effect.ts";

type CreatorCharacterPreviewState = {
  frameSrc: string;
  lastRenderKey: string;
  zoomLevel: number;
  wheelHandler: EventListener | null;
  refreshTimer: number | null;
};

function refreshFrontFrame(
  vnode: m.Vnode<unknown, CreatorCharacterPreviewState>,
): boolean {
  try {
    setPreviewAnimation("walk");
    const frames = renderDirectionalPreviewCanvases(0);
    const frontFrame =
      frames.find((frame) => frame.direction === "down") ?? frames[0];
    if (!frontFrame || isCanvasBlank(frontFrame.canvas)) {
      return false;
    }
    vnode.state.frameSrc = frontFrame?.canvas.toDataURL("image/png") ?? "";
    return true;
  } catch {
    vnode.state.frameSrc = "";
    return false;
  }
}

function isCanvasBlank(canvas: HTMLCanvasElement): boolean {
  const ctx = canvas.getContext("2d");
  if (!ctx) return true;

  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  for (let index = 3; index < pixels.length; index += 4) {
    if (pixels[index] !== 0) return false;
  }
  return true;
}

function scheduleRefresh(
  vnode: m.VnodeDOM<unknown, CreatorCharacterPreviewState>,
  attempts = 8,
): void {
  if (vnode.state.refreshTimer !== null) {
    window.clearTimeout(vnode.state.refreshTimer);
  }

  vnode.state.refreshTimer = window.setTimeout(() => {
    vnode.state.refreshTimer = null;
    const refreshed = refreshFrontFrame(vnode);
    m.redraw();
    if (!refreshed && attempts > 1) {
      scheduleRefresh(vnode, attempts - 1);
    }
  }, 180);
}

export const CreatorCharacterPreview: m.Component<
  Record<string, never>,
  CreatorCharacterPreviewState
> = {
  oninit(vnode) {
    vnode.state.frameSrc = "";
    vnode.state.lastRenderKey = "";
    vnode.state.zoomLevel = 2;
    vnode.state.wheelHandler = null;
    vnode.state.refreshTimer = null;
  },

  oncreate(vnode) {
    vnode.state.lastRenderKey = buildRenderKey();
    if (!refreshFrontFrame(vnode)) {
      scheduleRefresh(vnode);
    }

    const wheelHandler: EventListener = (event) => {
      const e = event as WheelEvent;
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.15 : 0.15;
      vnode.state.zoomLevel = Math.max(
        1,
        Math.min(5, vnode.state.zoomLevel + delta),
      );
      m.redraw();
    };
    vnode.state.wheelHandler = wheelHandler;
    vnode.dom.addEventListener("wheel", wheelHandler, { passive: false });
  },

  onupdate(vnode) {
    const renderKey = buildRenderKey();
    if (renderKey !== vnode.state.lastRenderKey) {
      vnode.state.lastRenderKey = renderKey;
      if (!refreshFrontFrame(vnode)) {
        scheduleRefresh(vnode);
      }
    }
  },

  onremove(vnode) {
    if (vnode.state.refreshTimer !== null) {
      window.clearTimeout(vnode.state.refreshTimer);
      vnode.state.refreshTimer = null;
    }
    if (vnode.state.wheelHandler) {
      vnode.dom.removeEventListener("wheel", vnode.state.wheelHandler);
      vnode.state.wheelHandler = null;
    }
  },

  view(vnode) {
    return m("div.creator-character-preview", [
      vnode.state.frameSrc
        ? m("img.creator-character-preview-img", {
            src: vnode.state.frameSrc,
            alt: "Front-facing character preview",
            style: {
              width: `${64 * vnode.state.zoomLevel}px`,
              height: `${64 * vnode.state.zoomLevel}px`,
            },
          })
        : null,
    ]);
  },
};
