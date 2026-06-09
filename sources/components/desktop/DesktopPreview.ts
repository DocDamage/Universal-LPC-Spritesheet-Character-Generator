// Desktop-style preview panel with mouse wheel zoom and animation cycling
import m from "mithril";
import { state } from "../../state/state.ts";
import { ANIMATIONS } from "../../state/constants.ts";
import {
  initPreviewCanvas,
  setPreviewCanvasZoom,
} from "../../canvas/preview-canvas.ts";
import {
  setPreviewAnimation,
  startPreviewAnimation,
  stopPreviewAnimation,
  getCustomAnimations,
  renderDirectionalPreviewCanvases,
  setPreviewShowTransparencyGrid,
  setPreviewApplyTransparencyMask,
} from "../../canvas/preview-animation.ts";

type DesktopPreviewState = {
  zoomLevel: number;
  selectedAnimation: string;
  directionalFrames: Array<{ direction: string; src: string }>;
  directionalRefreshTimer: number | null;
};

function refreshDirectionalFrames(
  vnode: m.Vnode<Record<string, never>, DesktopPreviewState>,
): boolean {
  try {
    vnode.state.directionalFrames = renderDirectionalPreviewCanvases(0).map(
      (frame) => ({
        direction: frame.direction,
        src: frame.canvas.toDataURL("image/png"),
      }),
    );
    return vnode.state.directionalFrames.length > 0;
  } catch {
    vnode.state.directionalFrames = [];
    return false;
  }
}

function scheduleDirectionalRefresh(
  vnode: m.Vnode<Record<string, never>, DesktopPreviewState>,
  attempts = 8,
): void {
  if (vnode.state.directionalRefreshTimer !== null) {
    window.clearTimeout(vnode.state.directionalRefreshTimer);
  }

  vnode.state.directionalRefreshTimer = window.setTimeout(() => {
    vnode.state.directionalRefreshTimer = null;
    const refreshed = refreshDirectionalFrames(vnode);
    m.redraw();
    if (!refreshed && attempts > 1) {
      scheduleDirectionalRefresh(vnode, attempts - 1);
    }
  }, 250);
}

export const DesktopPreview: m.Component<
  Record<string, never>,
  DesktopPreviewState
> = {
  oninit(vnode) {
    vnode.state.zoomLevel = state.previewCanvasZoomLevel || 1;
    vnode.state.selectedAnimation = state.selectedAnimation || "walk";
    vnode.state.directionalFrames = [];
    vnode.state.directionalRefreshTimer = null;
  },

  oncreate(vnode) {
    const canvas = vnode.dom.querySelector(
      "#desktop-preview-canvas",
    ) as HTMLCanvasElement;
    if (!canvas) {
      console.error("[DesktopPreview] Canvas element not found");
      return;
    }
    if (!window.canvasRenderer) {
      console.error("[DesktopPreview] Canvas renderer not available");
      return;
    }

    initPreviewCanvas(canvas);
    setPreviewAnimation(vnode.state.selectedAnimation);
    setPreviewShowTransparencyGrid(state.showTransparencyGrid);
    setPreviewApplyTransparencyMask(state.applyTransparencyMask);
    startPreviewAnimation();
    setPreviewCanvasZoom(vnode.state.zoomLevel);
    if (!refreshDirectionalFrames(vnode)) {
      scheduleDirectionalRefresh(vnode);
    }

    // Mouse wheel zoom
    const container = vnode.dom as HTMLElement;
    container.addEventListener(
      "wheel",
      (e: WheelEvent) => {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        let newZoom = vnode.state.zoomLevel + delta;
        newZoom = Math.max(0.5, Math.min(5, newZoom));
        vnode.state.zoomLevel = newZoom;
        state.previewCanvasZoomLevel = newZoom;
        setPreviewCanvasZoom(newZoom);
        m.redraw();
      },
      { passive: false },
    );
  },

  onupdate(vnode) {
    vnode.state.zoomLevel = state.previewCanvasZoomLevel || 1;
    // Sync dropdown with external animation changes (e.g., auto-switch for wheelchair/weapons)
    if (state.selectedAnimation !== vnode.state.selectedAnimation) {
      vnode.state.selectedAnimation = state.selectedAnimation;
      if (window.canvasRenderer) {
        setPreviewAnimation(vnode.state.selectedAnimation);
        refreshDirectionalFrames(vnode);
      }
    }
  },

  onremove() {
    if (this.directionalRefreshTimer !== null) {
      window.clearTimeout(this.directionalRefreshTimer);
      this.directionalRefreshTimer = null;
    }
    if (window.canvasRenderer) {
      stopPreviewAnimation();
    }
  },

  view(vnode) {
    const customAnims = Object.keys(getCustomAnimations());
    const allAnimations = [
      ...ANIMATIONS,
      ...customAnims.map((anim) => ({
        value: anim,
        label: anim.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()),
      })),
    ];

    return m("div#mithril-preview.desktop-preview", [
      m("div.desktop-preview-header", [
        m(
          "span.desktop-preview-zoom",
          `Zoom: ${Math.round(vnode.state.zoomLevel * 100)}%`,
        ),
        m(
          "select.desktop-anim-select",
          {
            value: vnode.state.selectedAnimation,
            onchange: (e: Event) => {
              const target = e.target as HTMLSelectElement;
              const anim = target.value;
              vnode.state.selectedAnimation = anim;
              state.selectedAnimation = anim;
              if (window.canvasRenderer) {
                stopPreviewAnimation();
                setPreviewAnimation(anim);
                startPreviewAnimation();
                refreshDirectionalFrames(vnode);
              }
            },
          },
          allAnimations.map((anim) =>
            m("option", { value: anim.value }, anim.label),
          ),
        ),
      ]),
      m("div.desktop-preview-canvas-wrapper", [
        m("canvas#desktop-preview-canvas"),
        state.isRenderingCharacter
          ? m("div.desktop-preview-loading", { "aria-hidden": true }, [
              m(
                "span",
                { "aria-label": "Rendering character" },
                "Rendering...",
              ),
            ])
          : null,
      ]),
      vnode.state.directionalFrames.length > 0
        ? m(
            "div.desktop-direction-preview",
            vnode.state.directionalFrames.map((frame) =>
              m("div.desktop-direction-preview-card", [
                m("img", {
                  src: frame.src,
                  alt: `${frame.direction} direction preview`,
                }),
                m("span", frame.direction),
              ]),
            ),
          )
        : null,
    ]);
  },
};
