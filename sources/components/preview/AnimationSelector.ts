// Animation selector dropdown with frame cycle display
import m from "mithril";
import { ANIMATIONS } from "../../state/constants.ts";
import {
  getCustomAnimations,
  setPreviewAnimation,
  syncPreviewTweenSettingsForAnimation,
} from "../../canvas/preview-animation.ts";
import { getTweenSettingsForAnimation } from "../../state/tween-settings.ts";
import type { TweenSettings } from "../../canvas/tween.ts";

export type AnimationSelectorAttrs = {
  selectedAnimation: string;
  frameCycle: string;
  onAnimationChange: (animation: string, settings: TweenSettings) => void;
  onFrameCycleUpdate: (frameCycle: string) => void;
};

export const AnimationSelector: m.Component<AnimationSelectorAttrs> = {
  view(vnode) {
    const customAnims = Object.keys(getCustomAnimations());
    const allAnimations: Array<{ value: string; label: string }> = [
      ...ANIMATIONS,
      ...customAnims.map((anim) => ({
        value: anim,
        label: anim.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()),
      })),
    ];

    return m("div.field.is-horizontal.is-align-items-center", [
      m("div.field-label.is-normal", [m("label.label.mb-0", "Animation")]),
      m("div.field-body", [
        m("div.field.has-addons.mb-0", [
          m("div.control", [
            m("div.select", [
              m(
                "select",
                {
                  value: vnode.attrs.selectedAnimation,
                  onchange: (e: Event) => {
                    const target = e.target as HTMLSelectElement;
                    const newAnimation = target.value;
                    const settings = getTweenSettingsForAnimation(newAnimation);
                    vnode.attrs.onAnimationChange(newAnimation, settings);
                    if (window.canvasRenderer) {
                      const frames = setPreviewAnimation(newAnimation);
                      syncPreviewTweenSettingsForAnimation(newAnimation);
                      vnode.attrs.onFrameCycleUpdate(
                        frames ? frames.join("-") : "",
                      );
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
            m("span.button.is-static.is-light", vnode.attrs.frameCycle),
          ]),
        ]),
      ]),
    ]);
  },
};
