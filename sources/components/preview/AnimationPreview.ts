// Animation Preview component
import m from "mithril";
import { state } from "../../state/state.ts";
import { ANIMATIONS } from "../../state/constants.ts";
import { CollapsibleSection } from "../CollapsibleSection.ts";
import { downloadPreviewAnimationGif } from "../../canvas/preview-gif.ts";
import { downloadPreviewAnimationWebp } from "../../canvas/preview-webp.ts";
import {
  buildAnimationQaChecks,
  downloadAnimationContactSheet,
  downloadAnimationMetadata,
} from "../../canvas/animation-professional-tools.ts";
import { showToast } from "../../state/notifications.ts";
import {
  setPreviewAnimation,
  getCustomAnimations,
  syncPreviewTweenSettingsForAnimation,
} from "../../canvas/preview-animation.ts";
import {
  TWEEN_EASINGS,
  TWEEN_MODES,
  TWEEN_PRESETS,
  isTweenMode,
} from "../../canvas/tween.ts";
import type {
  TweenMode,
  TweenPreset,
  TweenSettings,
  TweenEasing,
} from "../../canvas/tween.ts";
import {
  applyTweenPreset,
  clearTweenOverrideForAnimation,
  getGlobalTweenSettings,
  getTweenSettingsForAnimation,
  hasTweenOverride,
  setGlobalTweenSettings,
  setTweenOverrideForAnimation,
} from "../../state/tween-settings.ts";
import { setPreviewCanvasZoom } from "../../canvas/preview-canvas.ts";
import { ScrollableContainer } from "./ScrollableContainer.ts";
import { PreviewMetadataLoadingOverlay } from "./PreviewMetadataLoadingOverlay.ts";
import { PreviewCanvas } from "./PreviewCanvas.ts";

type AnimationOption = { value: string; label: string };

type AnimationPreviewState = {
  selectedAnimation: string;
  zoomLevel: number;
  frameCycle: string;
  tweenMode: TweenMode;
  tweenInbetweens: number;
  tweenFps: number;
  tweenMotionStrength: number;
  tweenAlphaThreshold: number;
  tweenEasing: TweenEasing;
  tweenPreset: TweenPreset;
  useAnimationOverride: boolean;
  compareOriginal: boolean;
};

const TWEEN_LABELS: Record<TweenMode, string> = {
  off: "Off",
  hold: "Hold",
  crossfade: "Crossfade",
  "pixel-motion": "Pixel Motion",
};

const TWEEN_PRESET_LABELS: Record<TweenPreset, string> = {
  original: "Original",
  smooth: "Smooth",
  "pixel-art": "Pixel Art",
  presentation: "Presentation",
};

function assignTweenState(
  vnode: m.Vnode<Record<string, never>, AnimationPreviewState>,
  settings: TweenSettings,
): void {
  vnode.state.tweenMode = settings.mode;
  vnode.state.tweenInbetweens = settings.inbetweens;
  vnode.state.tweenFps = settings.fps;
  vnode.state.tweenMotionStrength = settings.motionStrength;
  vnode.state.tweenAlphaThreshold = settings.alphaThreshold;
  vnode.state.tweenEasing = settings.easing || "linear";
}

function persistTweenSettings(
  vnode: m.Vnode<Record<string, never>, AnimationPreviewState>,
): void {
  const settings = {
    mode: vnode.state.tweenMode,
    inbetweens: vnode.state.tweenInbetweens,
    fps: vnode.state.tweenFps,
    motionStrength: vnode.state.tweenMotionStrength,
    alphaThreshold: vnode.state.tweenAlphaThreshold,
    easing: vnode.state.tweenEasing || "linear",
  };
  if (vnode.state.useAnimationOverride) {
    setTweenOverrideForAnimation(vnode.state.selectedAnimation, settings);
  } else {
    setGlobalTweenSettings(settings);
  }
}

function currentTweenSettings(
  vnode: m.Vnode<Record<string, never>, AnimationPreviewState>,
): TweenSettings {
  return {
    mode: vnode.state.tweenMode,
    inbetweens: vnode.state.compareOriginal ? 0 : vnode.state.tweenInbetweens,
    fps: vnode.state.compareOriginal ? 8 : vnode.state.tweenFps,
    motionStrength: vnode.state.tweenMotionStrength,
    alphaThreshold: vnode.state.tweenAlphaThreshold,
    easing: vnode.state.compareOriginal
      ? "linear"
      : vnode.state.tweenEasing || "linear",
  };
}

export const AnimationPreview: m.Component<
  Record<string, never>,
  AnimationPreviewState
> = {
  oninit(vnode) {
    vnode.state.selectedAnimation = "walk";
    vnode.state.zoomLevel = state.previewCanvasZoomLevel || 1;
    vnode.state.tweenPreset = state.previewTweenPreset;
    vnode.state.useAnimationOverride = hasTweenOverride("walk");
    vnode.state.compareOriginal = false;
    assignTweenState(vnode, getTweenSettingsForAnimation("walk"));
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
                            vnode.state.useAnimationOverride = hasTweenOverride(
                              target.value,
                            );
                            assignTweenState(
                              vnode,
                              getTweenSettingsForAnimation(target.value),
                            );
                            if (window.canvasRenderer) {
                              const frames = setPreviewAnimation(target.value);
                              syncPreviewTweenSettingsForAnimation(
                                target.value,
                              );
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
                          value: vnode.state.tweenPreset,
                          title: "Apply a tween preset to the global settings",
                          onchange: (e: Event) => {
                            const target = e.target as HTMLSelectElement;
                            const preset = target.value as TweenPreset;
                            if (preset in TWEEN_PRESETS) {
                              vnode.state.tweenPreset = preset;
                              assignTweenState(vnode, applyTweenPreset(preset));
                              vnode.state.useAnimationOverride = false;
                            }
                          },
                        },
                        Object.keys(TWEEN_PRESETS).map((preset) =>
                          m(
                            "option",
                            { value: preset },
                            TWEEN_PRESET_LABELS[preset as TweenPreset],
                          ),
                        ),
                      ),
                    ]),
                  ]),
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
                            persistTweenSettings(vnode);
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
                  m("div.control", [
                    m(
                      "button.button.is-small",
                      {
                        title: vnode.state.useAnimationOverride
                          ? "Use global tween settings for this animation"
                          : "Customize tween settings for this animation only",
                        onclick: () => {
                          vnode.state.useAnimationOverride =
                            !vnode.state.useAnimationOverride;
                          if (vnode.state.useAnimationOverride) {
                            setTweenOverrideForAnimation(
                              vnode.state.selectedAnimation,
                              getGlobalTweenSettings(),
                            );
                          } else {
                            clearTweenOverrideForAnimation(
                              vnode.state.selectedAnimation,
                            );
                          }
                          assignTweenState(
                            vnode,
                            getTweenSettingsForAnimation(
                              vnode.state.selectedAnimation,
                            ),
                          );
                        },
                      },
                      vnode.state.useAnimationOverride ? "Override" : "Global",
                    ),
                  ]),
                  m("div.control", [
                    m(
                      "button.button.is-small",
                      {
                        title: "Temporarily preview original frame timing",
                        onclick: () => {
                          vnode.state.compareOriginal =
                            !vnode.state.compareOriginal;
                        },
                      },
                      vnode.state.compareOriginal ? "Tweened" : "Original",
                    ),
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
                        persistTweenSettings(vnode);
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
                        persistTweenSettings(vnode);
                      },
                    }),
                  ]),
                  m("div.control.is-expanded.mt-2", [
                    m("label.label.is-small.mb-1", "Motion Easing"),
                    m(
                      "div.select.is-small.is-fullwidth",
                      {
                        style: { width: "100%", display: "block" },
                      },
                      [
                        m(
                          "select",
                          {
                            value: vnode.state.tweenEasing || "linear",
                            disabled: vnode.state.tweenMode === "off",
                            onchange: (e: Event) => {
                              const target = e.target as HTMLSelectElement;
                              if (
                                TWEEN_EASINGS.includes(
                                  target.value as TweenEasing,
                                )
                              ) {
                                vnode.state.tweenEasing =
                                  target.value as TweenEasing;
                              }
                              persistTweenSettings(vnode);
                            },
                            style: { width: "100%" },
                          },
                          [
                            m(
                              "option",
                              { value: "linear" },
                              "Linear (Fixed Speed)",
                            ),
                            m(
                              "option",
                              { value: "ease-in" },
                              "Ease-In (Accelerate)",
                            ),
                            m(
                              "option",
                              { value: "ease-out" },
                              "Ease-Out (Decelerate)",
                            ),
                            m(
                              "option",
                              { value: "ease-in-out" },
                              "Ease-In-Out (Smooth)",
                            ),
                            m("option", { value: "bounce" }, "Bounce"),
                            m("option", { value: "elastic" }, "Elastic (Snap)"),
                          ],
                        ),
                      ],
                    ),
                  ]),
                  vnode.state.tweenMode === "pixel-motion"
                    ? [
                        m("div.control.is-expanded.mt-2", [
                          m("label.label.is-small.mb-1", [
                            `Motion: ${vnode.state.tweenMotionStrength.toFixed(1)}x`,
                          ]),
                          m("input.is-fullwidth[type=range]", {
                            min: 0,
                            max: 2,
                            step: 0.1,
                            value: vnode.state.tweenMotionStrength,
                            oninput: (e: Event) => {
                              const target = e.target as HTMLInputElement;
                              vnode.state.tweenMotionStrength = parseFloat(
                                target.value,
                              );
                              persistTweenSettings(vnode);
                            },
                          }),
                        ]),
                        m("div.control.is-expanded.mt-2", [
                          m("label.label.is-small.mb-1", [
                            `Alpha: ${vnode.state.tweenAlphaThreshold}`,
                          ]),
                          m("input.is-fullwidth[type=range]", {
                            min: 1,
                            max: 255,
                            step: 1,
                            value: vnode.state.tweenAlphaThreshold,
                            oninput: (e: Event) => {
                              const target = e.target as HTMLInputElement;
                              vnode.state.tweenAlphaThreshold = parseInt(
                                target.value,
                                10,
                              );
                              persistTweenSettings(vnode);
                            },
                          }),
                        ]),
                      ]
                    : null,
                ]),
              ]),
            ]),
          ]),
        ]),
        m("div.animation-qa-panel", [
          m("div.animation-qa-header", [
            m("strong", "Animation QA"),
            m(
              "span",
              `${buildAnimationQaChecks(vnode.state.selectedAnimation, currentTweenSettings(vnode)).filter((check) => check.status === "ready").length}/4 ready`,
            ),
          ]),
          buildAnimationQaChecks(
            vnode.state.selectedAnimation,
            currentTweenSettings(vnode),
          ).map((check) =>
            m(
              "div.animation-qa-row",
              { class: `animation-qa-${check.status}` },
              [
                m("span.animation-qa-dot"),
                m("div", [m("strong", check.label), m("p", check.detail)]),
              ],
            ),
          ),
        ]),
        m(
          "div.is-flex.is-justify-content-center.mb-3",
          { style: { gap: "8px" } },
          [
            m(
              "button.button.is-small.is-primary",
              {
                onclick: async () => {
                  try {
                    await downloadPreviewAnimationGif(
                      state.selectedAnimation,
                      state.bodyType,
                    );
                    showToast("Animated GIF exported successfully!", {
                      kind: "success",
                    });
                  } catch (err) {
                    console.error(err);
                    showToast("Failed to export preview GIF.", {
                      kind: "error",
                    });
                  }
                },
              },
              "Export Loop as GIF",
            ),
            m(
              "button.button.is-small.is-primary",
              {
                onclick: async () => {
                  try {
                    await downloadPreviewAnimationWebp(
                      state.selectedAnimation,
                      state.bodyType,
                    );
                    showToast("Animated WebP exported successfully!", {
                      kind: "success",
                    });
                  } catch (err) {
                    console.error(err);
                    showToast("Failed to export preview WebP.", {
                      kind: "error",
                    });
                  }
                },
              },
              "Export Loop as WebP",
            ),
            m(
              "button.button.is-small",
              {
                onclick: async () => {
                  try {
                    await downloadAnimationContactSheet(
                      vnode.state.selectedAnimation,
                      currentTweenSettings(vnode),
                    );
                    showToast("Animation contact sheet exported.", {
                      kind: "success",
                    });
                  } catch (err) {
                    console.error(err);
                    showToast("Failed to export contact sheet.", {
                      kind: "error",
                    });
                  }
                },
              },
              "Contact Sheet",
            ),
            m(
              "button.button.is-small",
              {
                onclick: () => {
                  downloadAnimationMetadata(
                    vnode.state.selectedAnimation,
                    currentTweenSettings(vnode),
                  );
                  showToast("Animation metadata exported.", {
                    kind: "success",
                  });
                },
              },
              "Metadata JSON",
            ),
          ],
        ),
        m("div.mt-3", [
          m("div.preview-canvas-area", [
            m(ScrollableContainer, { classes: "spritesheet-preview" }, [
              m("div.preview-canvas-root", [
                m(PreviewCanvas, {
                  selectedAnimation: vnode.state.selectedAnimation,
                  zoomLevel: vnode.state.zoomLevel,
                  tweenMode: vnode.state.tweenMode,
                  tweenInbetweens: vnode.state.compareOriginal
                    ? 0
                    : vnode.state.tweenInbetweens,
                  tweenFps: vnode.state.compareOriginal
                    ? 8
                    : vnode.state.tweenFps,
                  tweenMotionStrength: vnode.state.tweenMotionStrength,
                  tweenAlphaThreshold: vnode.state.tweenAlphaThreshold,
                  tweenEasing: vnode.state.compareOriginal
                    ? "linear"
                    : vnode.state.tweenEasing || "linear",
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
