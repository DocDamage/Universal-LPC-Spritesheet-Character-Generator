// Animation Preview component
import m from "mithril";
import { state } from "../../state/state.ts";
import { CollapsibleSection } from "../CollapsibleSection.ts";
import {
  setPreviewAnimation,
  syncPreviewTweenSettingsForAnimation,
} from "../../canvas/preview-animation.ts";
import { setPreviewCanvasZoom } from "../../canvas/preview-canvas.ts";
import type { TweenSettings } from "../../canvas/tween.ts";
import {
  getTweenSettingsForAnimation,
  hasTweenOverride,
} from "../../state/tween-settings.ts";
import { ScrollableContainer } from "./ScrollableContainer.ts";
import { PreviewMetadataLoadingOverlay } from "./PreviewMetadataLoadingOverlay.ts";
import { PreviewCanvas } from "./PreviewCanvas.ts";
import { DirectionalPreviewGrid } from "./DirectionalPreviewGrid.ts";
import { AnimationSelector } from "./AnimationSelector.ts";
import { AnimationQAPanel } from "./AnimationQAPanel.ts";
import { AnimationExportButtons } from "./AnimationExportButtons.ts";
import { TweenControls } from "./TweenControls.ts";
import {
  assignTweenState,
  currentTweenSettings,
  type TweenState,
} from "./tween-utils.ts";

type AnimationPreviewState = {
  selectedAnimation: string;
  zoomLevel: number;
  frameCycle: string;
  tweenState: TweenState;
};

function previewRefreshKey(
  vnode: m.Vnode<Record<string, never>, AnimationPreviewState>,
): string {
  const t = vnode.state.tweenState;
  return [
    vnode.state.selectedAnimation,
    vnode.state.frameCycle,
    vnode.state.zoomLevel,
    t.tweenMode,
    t.tweenInbetweens,
    t.tweenFps,
    t.tweenMotionStrength,
    t.tweenAlphaThreshold,
    t.tweenEasing,
    t.compareOriginal ? "original" : "tweened",
    t.useAnimationOverride ? "override" : "global",
  ].join(":");
}

function onAnimationChange(
  vnode: m.Vnode<Record<string, never>, AnimationPreviewState>,
  newAnimation: string,
  settings: TweenSettings,
): void {
  vnode.state.selectedAnimation = newAnimation;
  state.selectedAnimation = newAnimation;
  vnode.state.tweenState.useAnimationOverride = hasTweenOverride(newAnimation);
  const t = vnode.state.tweenState;
  assignTweenState(t, settings);
  if (window.canvasRenderer) {
    const frames = setPreviewAnimation(newAnimation);
    syncPreviewTweenSettingsForAnimation(newAnimation);
    vnode.state.frameCycle = frames ? frames.join("-") : "";
  }
}

function onTweenStateChange(
  vnode: m.Vnode<Record<string, never>, AnimationPreviewState>,
  partial: Partial<TweenState>,
): void {
  Object.assign(vnode.state.tweenState, partial);
}

export const AnimationPreview: m.Component<
  Record<string, never>,
  AnimationPreviewState
> = {
  oninit(vnode) {
    const settings = getTweenSettingsForAnimation("walk");
    vnode.state.selectedAnimation = "walk";
    vnode.state.zoomLevel = state.previewCanvasZoomLevel || 1;
    vnode.state.frameCycle = "";
    vnode.state.tweenState = {
      tweenMode: settings.mode,
      tweenInbetweens: settings.inbetweens,
      tweenFps: settings.fps,
      tweenMotionStrength: settings.motionStrength,
      tweenAlphaThreshold: settings.alphaThreshold,
      tweenEasing: settings.easing || "linear",
      tweenPreset: state.previewTweenPreset,
      useAnimationOverride: hasTweenOverride("walk"),
      compareOriginal: false,
    };
    if (window.canvasRenderer) {
      const frames = setPreviewAnimation("walk");
      vnode.state.frameCycle = frames ? frames.join("-") : "";
    }
  },

  onupdate(vnode) {
    vnode.state.zoomLevel = state.previewCanvasZoomLevel || 1;
  },

  view(vnode) {
    const t = vnode.state.tweenState;

    return m(
      CollapsibleSection,
      { title: "Animation Preview", defaultOpen: true, boxClass: "box" },
      [
        m("div.columns.is-multiline", [
          // Animation selector column
          m("div.column", [
            m(AnimationSelector, {
              selectedAnimation: vnode.state.selectedAnimation,
              frameCycle: vnode.state.frameCycle,
              onAnimationChange: (newAnimation, settings) =>
                onAnimationChange(vnode, newAnimation, settings),
              onFrameCycleUpdate: (fc) => {
                vnode.state.frameCycle = fc;
              },
            }),
          ]),

          // Zoom slider column
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

          // Tween controls column
          m("div.column.is-full", [
            m(TweenControls, {
              tweenState: t,
              selectedAnimation: vnode.state.selectedAnimation,
              onTweenStateChange: (partial) =>
                onTweenStateChange(vnode, partial),
            }),
          ]),
        ]),

        // QA panel
        m(AnimationQAPanel, {
          selectedAnimation: vnode.state.selectedAnimation,
          tweenSettings: currentTweenSettings(vnode.state.tweenState),
        }),

        // Directional preview grid
        m(DirectionalPreviewGrid, { refreshKey: previewRefreshKey(vnode) }),

        // Export buttons
        m(AnimationExportButtons, {
          selectedAnimation: vnode.state.selectedAnimation,
          tweenSettings: currentTweenSettings(vnode.state.tweenState),
        }),

        // Preview canvas area
        m("div.mt-3", [
          m("div.preview-canvas-area", [
            m(ScrollableContainer, { classes: "spritesheet-preview" }, [
              m("div.preview-canvas-root", [
                m(PreviewCanvas, {
                  selectedAnimation: vnode.state.selectedAnimation,
                  zoomLevel: vnode.state.zoomLevel,
                  tweenMode: t.tweenMode,
                  tweenInbetweens: t.compareOriginal ? 0 : t.tweenInbetweens,
                  tweenFps: t.compareOriginal ? 8 : t.tweenFps,
                  tweenMotionStrength: t.tweenMotionStrength,
                  tweenAlphaThreshold: t.tweenAlphaThreshold,
                  tweenEasing: t.compareOriginal
                    ? "linear"
                    : t.tweenEasing || "linear",
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
