// Animation QA Check Panel component
import m from "mithril";
import {
  buildAnimationQaChecks,
} from "../../canvas/animation-professional-tools.ts";
import type { TweenSettings } from "../../canvas/tween.ts";

export type AnimationQAPanelAttrs = {
  selectedAnimation: string;
  tweenSettings: TweenSettings;
};

export const AnimationQAPanel: m.Component<
  AnimationQAPanelAttrs
> = {
  view(vnode) {
    const { selectedAnimation, tweenSettings } = vnode.attrs;
    const checks = buildAnimationQaChecks(selectedAnimation, tweenSettings);

    return m("div.animation-qa-panel", [
      m("div.animation-qa-header", [
        m("strong", "Animation QA"),
        m(
          "span",
          `${checks.filter((check) => check.status === "ready").length}/4 ready`,
        ),
      ]),
      checks.map((check) =>
        m(
          "div.animation-qa-row",
          { class: `animation-qa-${check.status}` },
          [
            m("span.animation-qa-dot"),
            m("div", [m("strong", check.label), m("p", check.detail)]),
          ],
        ),
      ),
    ]);
  },
};
