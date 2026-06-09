// Tween controls component (presets, mode, override, save/clear/compare)
import m from "mithril";
import {
  TWEEN_EASINGS,
  TWEEN_MODES,
  TWEEN_PRESETS,
  isTweenMode,
  type TweenMode,
  type TweenPreset,
  type TweenEasing,
} from "../../canvas/tween.ts";
import {
  applyTweenPreset,
  clearTweenOverrideForAnimation,
  getGlobalTweenSettings,
  getTweenSettingsForAnimation,
  hasTweenOverride,
  setTweenOverrideForAnimation,
} from "../../state/tween-settings.ts";
import { syncPreviewTweenSettingsForAnimation } from "../../canvas/preview-animation.ts";
import { showToast } from "../../state/notifications.ts";
import {
  assignTweenState,
  persistTweenSettings,
  currentTweenSettings,
  type TweenState,
} from "./tween-utils.ts";

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

export type TweenControlsAttrs = {
  tweenState: TweenState;
  selectedAnimation: string;
  onTweenStateChange: (updatedState: Partial<TweenState>) => void;
};

export const TweenControls: m.Component<TweenControlsAttrs> = {
  view(vnode) {
    const { tweenState, selectedAnimation } = vnode.attrs;
    const update = (partial: Partial<TweenState>) =>
      vnode.attrs.onTweenStateChange(partial);

    return [
      // Row 1: Tween preset + mode + override buttons
      m("div.field.is-horizontal.is-align-items-center", [
        m("div.field-label.is-normal", [m("label.label.mb-0", "Tween")]),
        m("div.field-body", [
          m("div.field.has-addons.mb-0", [
            // Preset selector
            m("div.control", [
              m("div.select", [
                m(
                  "select",
                  {
                    value: tweenState.tweenPreset,
                    title: "Apply a tween preset to the global settings",
                    onchange: (e: Event) => {
                      const target = e.target as HTMLSelectElement;
                      const preset = target.value as TweenPreset;
                      if (preset in TWEEN_PRESETS) {
                        const newSettings = applyTweenPreset(preset);
                        update({
                          tweenPreset: preset,
                          useAnimationOverride: false,
                        });
                        assignTweenState(tweenState, newSettings);
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
            // Mode selector
            m("div.control", [
              m("div.select", [
                m(
                  "select",
                  {
                    value: tweenState.tweenMode,
                    onchange: (e: Event) => {
                      const target = e.target as HTMLSelectElement;
                      const mode = isTweenMode(target.value)
                        ? target.value
                        : "off";
                      update({ tweenMode: mode });
                      // Persist after state update in next tick
                      tweenState.tweenMode = mode;
                      persistTweenSettings(tweenState, selectedAnimation);
                    },
                  },
                  TWEEN_MODES.map((mode) =>
                    m("option", { value: mode }, TWEEN_LABELS[mode]),
                  ),
                ),
              ]),
            ]),
            // In-between count display
            m("div.control", [
              m("span.button.is-static.is-light", [
                `${tweenState.tweenInbetweens} in-between`,
                tweenState.tweenInbetweens === 1 ? "" : "s",
              ]),
            ]),
            // Override/Global toggle
            m("div.control", [
              m(
                "button.button.is-small",
                {
                  title: tweenState.useAnimationOverride
                    ? "Use global tween settings for this animation"
                    : "Customize tween settings for this animation only",
                  onclick: () => {
                    const useOverride = !tweenState.useAnimationOverride;
                    if (useOverride) {
                      setTweenOverrideForAnimation(
                        selectedAnimation,
                        getGlobalTweenSettings(),
                      );
                    } else {
                      clearTweenOverrideForAnimation(selectedAnimation);
                    }
                    assignTweenState(
                      tweenState,
                      getTweenSettingsForAnimation(selectedAnimation),
                    );
                    update({ useAnimationOverride: useOverride });
                  },
                },
                tweenState.useAnimationOverride ? "Override" : "Global",
              ),
            ]),
            // Save Preset
            m("div.control", [
              m(
                "button.button.is-small",
                {
                  title:
                    "Save the current tween settings for only this animation",
                  onclick: () => {
                    setTweenOverrideForAnimation(
                      selectedAnimation,
                      currentTweenSettings(tweenState),
                    );
                    update({ useAnimationOverride: true });
                    showToast("Animation preset saved.", {
                      kind: "success",
                    });
                  },
                },
                "Save Preset",
              ),
            ]),
            // Use Global
            m("div.control", [
              m(
                "button.button.is-small",
                {
                  disabled: !hasTweenOverride(selectedAnimation),
                  title:
                    "Clear this animation preset and use global tween settings",
                  onclick: () => {
                    clearTweenOverrideForAnimation(selectedAnimation);
                    assignTweenState(
                      tweenState,
                      getTweenSettingsForAnimation(selectedAnimation),
                    );
                    syncPreviewTweenSettingsForAnimation(selectedAnimation);
                    update({ useAnimationOverride: false });
                    showToast("Animation now uses global preset.", {
                      kind: "success",
                    });
                  },
                },
                "Use Global",
              ),
            ]),
            // Compare Original
            m("div.control", [
              m(
                "button.button.is-small",
                {
                  title: "Temporarily preview original frame timing",
                  onclick: () => {
                    update({ compareOriginal: !tweenState.compareOriginal });
                  },
                },
                tweenState.compareOriginal ? "Tweened" : "Original",
              ),
            ]),
          ]),
        ]),
      ]),
      // Row 2: FPS + in-between sliders + easing + pixel-motion extras
      m("div.field.is-horizontal.is-align-items-center", [
        m("div.field-label.is-normal", [
          m("label.label.mb-0", `FPS: ${tweenState.tweenFps}`),
        ]),
        m("div.field-body", [
          m("div.field.mb-0", [
            // In-betweens slider
            m("div.control.is-expanded", [
              m("input.is-fullwidth[type=range]", {
                min: 1,
                max: 4,
                step: 1,
                disabled: tweenState.tweenMode === "off",
                value: tweenState.tweenInbetweens,
                oninput: (e: Event) => {
                  const target = e.target as HTMLInputElement;
                  update({ tweenInbetweens: parseInt(target.value, 10) });
                  tweenState.tweenInbetweens = parseInt(target.value, 10);
                  persistTweenSettings(tweenState, selectedAnimation);
                },
              }),
            ]),
            // FPS slider
            m("div.control.is-expanded.mt-2", [
              m("input.is-fullwidth[type=range]", {
                min: 4,
                max: 24,
                step: 1,
                value: tweenState.tweenFps,
                oninput: (e: Event) => {
                  const target = e.target as HTMLInputElement;
                  update({ tweenFps: parseInt(target.value, 10) });
                  tweenState.tweenFps = parseInt(target.value, 10);
                  persistTweenSettings(tweenState, selectedAnimation);
                },
              }),
            ]),
            // Easing selector
            m("div.control.is-expanded.mt-2", [
              m("label.label.is-small.mb-1", "Motion Easing"),
              m(
                "div.select.is-small.is-fullwidth",
                { style: { width: "100%", display: "block" } },
                [
                  m(
                    "select",
                    {
                      value: tweenState.tweenEasing || "linear",
                      disabled: tweenState.tweenMode === "off",
                      onchange: (e: Event) => {
                        const target = e.target as HTMLSelectElement;
                        const easing = TWEEN_EASINGS.includes(
                          target.value as TweenEasing,
                        )
                          ? (target.value as TweenEasing)
                          : "linear";
                        update({ tweenEasing: easing });
                        tweenState.tweenEasing = easing;
                        persistTweenSettings(tweenState, selectedAnimation);
                      },
                      style: { width: "100%" },
                    },
                    [
                      m("option", { value: "linear" }, "Linear (Fixed Speed)"),
                      m("option", { value: "ease-in" }, "Ease-In (Accelerate)"),
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
            // Pixel-motion specific controls
            tweenState.tweenMode === "pixel-motion"
              ? [
                  m("div.control.is-expanded.mt-2", [
                    m("label.label.is-small.mb-1", [
                      `Motion: ${tweenState.tweenMotionStrength.toFixed(1)}x`,
                    ]),
                    m("input.is-fullwidth[type=range]", {
                      min: 0,
                      max: 2,
                      step: 0.1,
                      value: tweenState.tweenMotionStrength,
                      oninput: (e: Event) => {
                        const target = e.target as HTMLInputElement;
                        const val = parseFloat(target.value);
                        update({ tweenMotionStrength: val });
                        tweenState.tweenMotionStrength = val;
                        persistTweenSettings(tweenState, selectedAnimation);
                      },
                    }),
                  ]),
                  m("div.control.is-expanded.mt-2", [
                    m("label.label.is-small.mb-1", [
                      `Alpha: ${tweenState.tweenAlphaThreshold}`,
                    ]),
                    m("input.is-fullwidth[type=range]", {
                      min: 1,
                      max: 255,
                      step: 1,
                      value: tweenState.tweenAlphaThreshold,
                      oninput: (e: Event) => {
                        const target = e.target as HTMLInputElement;
                        const val = parseInt(target.value, 10);
                        update({ tweenAlphaThreshold: val });
                        tweenState.tweenAlphaThreshold = val;
                        persistTweenSettings(tweenState, selectedAnimation);
                      },
                    }),
                  ]),
                ]
              : null,
          ]),
        ]),
      ]),
    ];
  },
};
