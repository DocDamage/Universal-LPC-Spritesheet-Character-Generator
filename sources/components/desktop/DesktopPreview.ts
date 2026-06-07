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
} from "../../canvas/preview-animation.ts";

type DesktopPreviewState = {
  zoomLevel: number;
  selectedAnimation: string;
};

export const DesktopPreview: m.Component<
  Record<string, never>,
  DesktopPreviewState
> = {
  oninit(vnode) {
    vnode.state.zoomLevel = state.previewCanvasZoomLevel || 1;
    vnode.state.selectedAnimation = state.selectedAnimation || "walk";
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
    startPreviewAnimation();
    setPreviewCanvasZoom(vnode.state.zoomLevel);

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
    }
  },

  onremove() {
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

    return m("div.desktop-preview", [
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
    ]);
  },
};
