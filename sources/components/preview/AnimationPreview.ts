// Animation Preview component
import m from "mithril";
import { state } from "../../state/state.ts";
import { ANIMATIONS } from "../../state/constants.ts";
import { CollapsibleSection } from "../CollapsibleSection.ts";
import {
  repaintStaticPreviewFrameForTests,
  setPreviewAnimation,
  setPreviewTweenSettings,
  startPreviewAnimation,
  stopPreviewAnimation,
  getCustomAnimations,
} from "../../canvas/preview-animation.ts";
import { TWEEN_MODES, isTweenMode } from "../../canvas/tween.ts";
import type { TweenMode } from "../../canvas/tween.ts";
import {
  initPreviewCanvas,
  setPreviewCanvasZoom,
} from "../../canvas/preview-canvas.ts";
import PinchToZoom from "./PinchToZoom.ts";
import { ScrollableContainer } from "./ScrollableContainer.ts";
import { PreviewMetadataLoadingOverlay } from "./PreviewMetadataLoadingOverlay.ts";

type PreviewCanvasAttrs = {
  selectedAnimation: string;
  zoomLevel: number;
  tweenMode: TweenMode;
  tweenInbetweens: number;
  tweenFps: number;
  onFrameCycleUpdate: (frameCycle: string) => void;
};

type PreviewCanvasState = {
  zoomLevel: number;
  lastAnimation: string;
  lastTweenMode: TweenMode;
  lastTweenInbetweens: number;
  lastTweenFps: number;
  _pinchUnmounted: boolean;
  pinch: PinchToZoom | null;
};

const PreviewCanvas: m.Component<PreviewCanvasAttrs, PreviewCanvasState> = {
  oncreate(vnode) {
    const canvas = vnode.dom as HTMLCanvasElement;
    const {
      selectedAnimation,
      tweenMode,
      tweenInbetweens,
      tweenFps,
      onFrameCycleUpdate,
    } = vnode.attrs;
    const zoomLevel = vnode.attrs.zoomLevel || 1;

    if (!window.canvasRenderer) {
      console.error("Canvas renderer not available yet");
      return;
    }

    initPreviewCanvas(canvas);
    const frames = setPreviewAnimation(selectedAnimation);
    setPreviewTweenSettings({
      mode: tweenMode,
      inbetweens: tweenInbetweens,
      fps: tweenFps,
    });
    startPreviewAnimation();

    if (frames) {
      onFrameCycleUpdate(frames.join("-"));
    }

    vnode.state.zoomLevel = zoomLevel;
    vnode.state.lastAnimation = selectedAnimation;
    vnode.state.lastTweenMode = tweenMode;
    vnode.state.lastTweenInbetweens = tweenInbetweens;
    vnode.state.lastTweenFps = tweenFps;
    vnode.state._pinchUnmounted = false;
    vnode.state.pinch = null;
    PinchToZoom.create(
      canvas,
      (scale) => {
        vnode.state.zoomLevel = scale;

        if (window.canvasRenderer) {
          m.redraw();
          setPreviewCanvasZoom(vnode.state.zoomLevel);
        }

        state.previewCanvasZoomLevel = vnode.state.zoomLevel;
      },
      vnode.state.zoomLevel,
    ).then((pinch) => {
      if (vnode.state._pinchUnmounted) {
        pinch.destroy();
        return;
      }
      vnode.state.pinch = pinch;
    });
  },
  onupdate(vnode) {
    const { selectedAnimation, tweenMode, tweenInbetweens, tweenFps } =
      vnode.attrs;
    const didTweenSettingsChange =
      vnode.state.lastTweenMode !== tweenMode ||
      vnode.state.lastTweenInbetweens !== tweenInbetweens ||
      vnode.state.lastTweenFps !== tweenFps;

    if (
      vnode.state.lastAnimation !== selectedAnimation ||
      didTweenSettingsChange
    ) {
      if (window.canvasRenderer) {
        stopPreviewAnimation();
        setPreviewAnimation(selectedAnimation);
        setPreviewTweenSettings({
          mode: tweenMode,
          inbetweens: tweenInbetweens,
          fps: tweenFps,
        });
        initPreviewCanvas(vnode.dom as HTMLCanvasElement);
        startPreviewAnimation();
      }
      vnode.state.lastAnimation = selectedAnimation;
      vnode.state.lastTweenMode = tweenMode;
      vnode.state.lastTweenInbetweens = tweenInbetweens;
      vnode.state.lastTweenFps = tweenFps;
    }

    vnode.state.zoomLevel = state.previewCanvasZoomLevel || 1;
    repaintStaticPreviewFrameForTests();
  },
  onremove(vnode) {
    vnode.state._pinchUnmounted = true;
    vnode.state.pinch?.destroy();
    vnode.state.pinch = null;
    if (window.canvasRenderer) {
      stopPreviewAnimation();
    }
  },
  view() {
    return m("canvas#previewAnimations");
  },
};

type AnimationOption = { value: string; label: string };

type AnimationPreviewState = {
  selectedAnimation: string;
  zoomLevel: number;
  frameCycle: string;
  tweenMode: TweenMode;
  tweenInbetweens: number;
  tweenFps: number;
};

const TWEEN_LABELS: Record<TweenMode, string> = {
  off: "Off",
  hold: "Hold",
  crossfade: "Crossfade",
  "pixel-motion": "Pixel Motion",
};

export const AnimationPreview: m.Component<
  Record<string, never>,
  AnimationPreviewState
> = {
  oninit(vnode) {
    vnode.state.selectedAnimation = "walk";
    vnode.state.zoomLevel = state.previewCanvasZoomLevel || 1;
    vnode.state.tweenMode = state.previewTweenMode;
    vnode.state.tweenInbetweens = state.previewTweenInbetweens;
    vnode.state.tweenFps = state.previewTweenFps;
    if (window.canvasRenderer) {
      const frames = setPreviewAnimation("walk");
      vnode.state.frameCycle = frames ? frames.join("-") : "";
    } else {
      vnode.state.frameCycle = "";
    }
  },
  onupdate(vnode) {
    vnode.state.zoomLevel = state.previewCanvasZoomLevel || 1;
  },
  view(vnode) {
    const customAnims = Object.keys(getCustomAnimations());
    const allAnimations: AnimationOption[] = [
      ...ANIMATIONS,
      ...customAnims.map((anim) => ({
        value: anim,
        label: anim.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()),
      })),
    ];

    if (
      !allAnimations.find(
        (anim) => anim.value === vnode.state.selectedAnimation,
      )
    ) {
      vnode.state.selectedAnimation = "walk";
      state.selectedAnimation = "walk";
      if (window.canvasRenderer) {
        const frames = setPreviewAnimation("walk");
        vnode.state.frameCycle = frames ? frames.join("-") : "";
      }
    }

    return m(
      CollapsibleSection,
      {
        title: "Animation Preview",
        defaultOpen: true,
        boxClass: "box",
      },
      [
        m("div.columns.is-multiline", [
          m("div.column", [
            m("div.field.is-horizontal.is-align-items-center", [
              m("div.field-label.is-normal", [
                m("label.label.mb-0", "Animation"),
              ]),
              m("div.field-body", [
                m("div.field.has-addons.mb-0", [
                  m("div.control", [
                    m("div.select", [
                      m(
                        "select",
                        {
                          value: vnode.state.selectedAnimation,
                          onchange: (e: Event) => {
                            const target = e.target as HTMLSelectElement;
                            vnode.state.selectedAnimation = target.value;
                            state.selectedAnimation =
                              vnode.state.selectedAnimation;
                            if (window.canvasRenderer) {
                              const frames = setPreviewAnimation(target.value);
                              vnode.state.frameCycle = frames
                                ? frames.join("-")
                                : "";
                            }
                          },
                        },
                        allAnimations.map((anim) =>
                          m("option", { value: anim.value }, anim.label),
                        ),
                      ),
                    ]),
                  ]),
                  m("div.control", [
                    m("span.button.is-static.is-light", vnode.state.frameCycle),
                  ]),
                ]),
              ]),
            ]),
          ]),
          m("div.column", [
            m("div.field.is-horizontal.is-align-items-center", [
              m("div.field-label.is-normal", [
                m(
                  "label.label.mb-0",
                  `Zoom: ${Math.round(vnode.state.zoomLevel * 100)}%`,
                ),
              ]),
              m("div.field-body", [
                m("div.field.mb-0", [
                  m("div.control.is-expanded", [
                    m("input.is-fullwidth[type=range]", {
                      min: 0.5,
                      max: 2,
                      step: 0.1,
                      value: vnode.state.zoomLevel,
                      oninput: (e: Event) => {
                        const target = e.target as HTMLInputElement;
                        vnode.state.zoomLevel = parseFloat(target.value);
                        state.previewCanvasZoomLevel = vnode.state.zoomLevel;
                        if (window.canvasRenderer) {
                          setPreviewCanvasZoom(vnode.state.zoomLevel);
                        }
                      },
                    }),
                  ]),
                ]),
              ]),
            ]),
          ]),
          m("div.column", [
            m("div.field.is-horizontal.is-align-items-center", [
              m("div.field-label.is-normal", [m("label.label.mb-0", "Tween")]),
              m("div.field-body", [
                m("div.field.has-addons.mb-0", [
                  m("div.control", [
                    m("div.select", [
                      m(
                        "select",
                        {
                          value: vnode.state.tweenMode,
                          onchange: (e: Event) => {
                            const target = e.target as HTMLSelectElement;
                            vnode.state.tweenMode = isTweenMode(target.value)
                              ? target.value
                              : "off";
                            state.previewTweenMode = vnode.state.tweenMode;
                          },
                        },
                        TWEEN_MODES.map((mode) =>
                          m("option", { value: mode }, TWEEN_LABELS[mode]),
                        ),
                      ),
                    ]),
                  ]),
                  m("div.control", [
                    m("span.button.is-static.is-light", [
                      `${vnode.state.tweenInbetweens} in-between`,
                      vnode.state.tweenInbetweens === 1 ? "" : "s",
                    ]),
                  ]),
                ]),
              ]),
            ]),
          ]),
          m("div.column", [
            m("div.field.is-horizontal.is-align-items-center", [
              m("div.field-label.is-normal", [
                m("label.label.mb-0", `FPS: ${vnode.state.tweenFps}`),
              ]),
              m("div.field-body", [
                m("div.field.mb-0", [
                  m("div.control.is-expanded", [
                    m("input.is-fullwidth[type=range]", {
                      min: 1,
                      max: 4,
                      step: 1,
                      disabled: vnode.state.tweenMode === "off",
                      value: vnode.state.tweenInbetweens,
                      oninput: (e: Event) => {
                        const target = e.target as HTMLInputElement;
                        vnode.state.tweenInbetweens = parseInt(
                          target.value,
                          10,
                        );
                        state.previewTweenInbetweens =
                          vnode.state.tweenInbetweens;
                      },
                    }),
                  ]),
                  m("div.control.is-expanded.mt-2", [
                    m("input.is-fullwidth[type=range]", {
                      min: 4,
                      max: 24,
                      step: 1,
                      value: vnode.state.tweenFps,
                      oninput: (e: Event) => {
                        const target = e.target as HTMLInputElement;
                        vnode.state.tweenFps = parseInt(target.value, 10);
                        state.previewTweenFps = vnode.state.tweenFps;
                      },
                    }),
                  ]),
                ]),
              ]),
            ]),
          ]),
        ]),
        m("div.mt-3", [
          m("div.preview-canvas-area", [
            m(ScrollableContainer, { classes: "spritesheet-preview" }, [
              m("div.preview-canvas-root", [
                m(PreviewCanvas, {
                  selectedAnimation: vnode.state.selectedAnimation,
                  zoomLevel: vnode.state.zoomLevel,
                  tweenMode: vnode.state.tweenMode,
                  tweenInbetweens: vnode.state.tweenInbetweens,
                  tweenFps: vnode.state.tweenFps,
                  onFrameCycleUpdate: (frameCycle) => {
                    vnode.state.frameCycle = frameCycle;
                  },
                }),
                state.isRenderingCharacter
                  ? m("div.preview-canvas-busy", { "aria-hidden": true }, [
                      m("span.loading", {
                        "aria-label": "Rendering character",
                      }),
                    ])
                  : null,
                m(PreviewMetadataLoadingOverlay),
              ]),
            ]),
          ]),
        ]),
      ],
    );
  },
};
