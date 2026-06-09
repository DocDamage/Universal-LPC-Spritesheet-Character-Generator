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
  getPreviewAnimationStatus,
  isPreviewAnimationRunning,
  renderDirectionalPreviewCanvases,
  setPreviewShowTransparencyGrid,
  setPreviewApplyTransparencyMask,
  stepPreviewAnimation,
  syncPreviewTweenSettingsForAnimation,
} from "../../canvas/preview-animation.ts";
import type { PreviewAnimationStatus } from "../../canvas/preview-animation.ts";
import { requireFeature } from "../../state/feature-gates.ts";
import { showToast } from "../../state/notifications.ts";

type DesktopPreviewState = {
  zoomLevel: number;
  selectedAnimation: string;
  directionalFrames: Array<{ direction: string; src: string }>;
  directionalRefreshTimer: number | null;
  statusRefreshTimer: number | null;
  isPlaying: boolean;
  animationStatus: PreviewAnimationStatus | null;
  exportBusy: "gif" | "webp" | null;
  wheelHandler: EventListener | null;
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

function refreshAnimationStatus(
  vnode: m.Vnode<Record<string, never>, DesktopPreviewState>,
): void {
  try {
    vnode.state.animationStatus = getPreviewAnimationStatus();
  } catch {
    vnode.state.animationStatus = null;
  }
}

function scheduleStatusRefresh(
  vnode: m.Vnode<Record<string, never>, DesktopPreviewState>,
): void {
  if (vnode.state.statusRefreshTimer !== null) {
    return;
  }

  vnode.state.statusRefreshTimer = window.setInterval(() => {
    refreshAnimationStatus(vnode);
    m.redraw();
  }, 500);
}

function stopStatusRefresh(
  vnode: m.Vnode<Record<string, never>, DesktopPreviewState>,
): void {
  if (vnode.state.statusRefreshTimer !== null) {
    window.clearInterval(vnode.state.statusRefreshTimer);
    vnode.state.statusRefreshTimer = null;
  }
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
    vnode.state.statusRefreshTimer = null;
    vnode.state.isPlaying = true;
    vnode.state.animationStatus = null;
    vnode.state.exportBusy = null;
    vnode.state.wheelHandler = null;
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
    syncPreviewTweenSettingsForAnimation(vnode.state.selectedAnimation);
    setPreviewShowTransparencyGrid(state.showTransparencyGrid);
    setPreviewApplyTransparencyMask(state.applyTransparencyMask);
    startPreviewAnimation();
    vnode.state.isPlaying = isPreviewAnimationRunning();
    refreshAnimationStatus(vnode);
    scheduleStatusRefresh(vnode);
    setPreviewCanvasZoom(vnode.state.zoomLevel);
    if (!refreshDirectionalFrames(vnode)) {
      scheduleDirectionalRefresh(vnode);
    }

    // Mouse wheel zoom
    const container = vnode.dom as HTMLElement;
    const wheelHandler: EventListener = (event) => {
      const e = event as WheelEvent;
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      let newZoom = vnode.state.zoomLevel + delta;
      newZoom = Math.max(0.5, Math.min(5, newZoom));
      vnode.state.zoomLevel = newZoom;
      state.previewCanvasZoomLevel = newZoom;
      setPreviewCanvasZoom(newZoom);
      m.redraw();
    };
    vnode.state.wheelHandler = wheelHandler;
    container.addEventListener("wheel", wheelHandler, { passive: false });
  },

  onupdate(vnode) {
    vnode.state.zoomLevel = state.previewCanvasZoomLevel || 1;
    // Sync dropdown with external animation changes (e.g., auto-switch for wheelchair/weapons)
    if (state.selectedAnimation !== vnode.state.selectedAnimation) {
      vnode.state.selectedAnimation = state.selectedAnimation;
      if (window.canvasRenderer) {
        setPreviewAnimation(vnode.state.selectedAnimation);
        syncPreviewTweenSettingsForAnimation(vnode.state.selectedAnimation);
        refreshDirectionalFrames(vnode);
        refreshAnimationStatus(vnode);
      }
    }
  },

  onremove(vnode) {
    if (vnode.state.directionalRefreshTimer !== null) {
      window.clearTimeout(vnode.state.directionalRefreshTimer);
      vnode.state.directionalRefreshTimer = null;
    }
    if (vnode.state.statusRefreshTimer !== null) {
      window.clearInterval(vnode.state.statusRefreshTimer);
      vnode.state.statusRefreshTimer = null;
    }
    if (vnode.dom && vnode.state.wheelHandler) {
      vnode.dom.removeEventListener("wheel", vnode.state.wheelHandler);
      vnode.state.wheelHandler = null;
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
                syncPreviewTweenSettingsForAnimation(anim);
                startPreviewAnimation();
                vnode.state.isPlaying = isPreviewAnimationRunning();
                refreshDirectionalFrames(vnode);
                refreshAnimationStatus(vnode);
                scheduleStatusRefresh(vnode);
              }
            },
          },
          allAnimations.map((anim) =>
            m("option", { value: anim.value }, anim.label),
          ),
        ),
        m("div.desktop-preview-playback", [
          m(
            "button.desktop-preview-playback-btn",
            {
              type: "button",
              title: "Step backward",
              onclick: () => {
                stepPreviewAnimation(-1);
                vnode.state.isPlaying = false;
                stopStatusRefresh(vnode);
                refreshAnimationStatus(vnode);
              },
            },
            "Prev",
          ),
          m(
            "button.desktop-preview-playback-btn",
            {
              type: "button",
              title: vnode.state.isPlaying ? "Pause preview" : "Play preview",
              onclick: () => {
                if (vnode.state.isPlaying) {
                  stopPreviewAnimation();
                  vnode.state.isPlaying = false;
                  stopStatusRefresh(vnode);
                } else {
                  startPreviewAnimation();
                  vnode.state.isPlaying = isPreviewAnimationRunning();
                  scheduleStatusRefresh(vnode);
                }
                refreshAnimationStatus(vnode);
              },
            },
            vnode.state.isPlaying ? "Pause" : "Play",
          ),
          m(
            "button.desktop-preview-playback-btn",
            {
              type: "button",
              title: "Step forward",
              onclick: () => {
                stepPreviewAnimation(1);
                vnode.state.isPlaying = false;
                stopStatusRefresh(vnode);
                refreshAnimationStatus(vnode);
              },
            },
            "Next",
          ),
        ]),
        m("div.desktop-preview-exports", [
          m(
            "button.desktop-preview-export-btn",
            {
              type: "button",
              disabled: vnode.state.exportBusy !== null,
              title: "Export the current animation as GIF",
              onclick: async () => {
                if (!requireFeature("animation-export")) return;
                vnode.state.exportBusy = "gif";
                try {
                  const { downloadPreviewAnimationGif } =
                    await import("../../canvas/preview-gif.ts");
                  await downloadPreviewAnimationGif(
                    vnode.state.selectedAnimation,
                    state.bodyType,
                  );
                  showToast("Animated GIF exported.", { kind: "success" });
                } catch (err) {
                  console.error(err);
                  showToast("Failed to export animated GIF.", {
                    kind: "error",
                  });
                } finally {
                  vnode.state.exportBusy = null;
                  m.redraw();
                }
              },
            },
            vnode.state.exportBusy === "gif" ? "GIF..." : "GIF",
          ),
          m(
            "button.desktop-preview-export-btn",
            {
              type: "button",
              disabled: vnode.state.exportBusy !== null,
              title: "Export the current animation as WebP",
              onclick: async () => {
                if (!requireFeature("animation-export")) return;
                vnode.state.exportBusy = "webp";
                try {
                  const { downloadPreviewAnimationWebp } =
                    await import("../../canvas/preview-webp.ts");
                  await downloadPreviewAnimationWebp(
                    vnode.state.selectedAnimation,
                    state.bodyType,
                  );
                  showToast("Animated WebP exported.", { kind: "success" });
                } catch (err) {
                  console.error(err);
                  showToast("Failed to export animated WebP.", {
                    kind: "error",
                  });
                } finally {
                  vnode.state.exportBusy = null;
                  m.redraw();
                }
              },
            },
            vnode.state.exportBusy === "webp" ? "WebP..." : "WebP",
          ),
        ]),
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
      vnode.state.animationStatus
        ? m("div.desktop-animation-status", [
            m("span", [
              "Step ",
              vnode.state.animationStatus.currentStep,
              "/",
              vnode.state.animationStatus.totalSteps,
            ]),
            m("span", [
              vnode.state.animationStatus.sourceFrameCount,
              " source frames",
            ]),
            m("span", [
              vnode.state.animationStatus.directionCount,
              vnode.state.animationStatus.directionCount === 1
                ? " direction"
                : " directions",
            ]),
            m("span", [vnode.state.animationStatus.fps, " FPS"]),
            m("span", vnode.state.animationStatus.tweenMode),
          ])
        : null,
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
