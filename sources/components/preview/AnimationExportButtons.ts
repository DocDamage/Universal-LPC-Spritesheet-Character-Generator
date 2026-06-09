// Animation export buttons component (GIF, WebP, Contact Sheet, Metadata JSON)
import m from "mithril";
import { state } from "../../state/state.ts";
import { downloadPreviewAnimationGif } from "../../canvas/preview-gif.ts";
import { downloadPreviewAnimationWebp } from "../../canvas/preview-webp.ts";
import {
  downloadAnimationContactSheet,
  downloadAnimationMetadata,
} from "../../canvas/animation-professional-tools.ts";
import { showToast } from "../../state/notifications.ts";
import type { TweenSettings } from "../../canvas/tween.ts";

export type AnimationExportButtonsAttrs = {
  selectedAnimation: string;
  tweenSettings: TweenSettings;
};

export const AnimationExportButtons: m.Component<AnimationExportButtonsAttrs> =
  {
    view(vnode) {
      const { selectedAnimation, tweenSettings } = vnode.attrs;

      return m(
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
                    selectedAnimation,
                    tweenSettings,
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
                downloadAnimationMetadata(selectedAnimation, tweenSettings);
                showToast("Animation metadata exported.", {
                  kind: "success",
                });
              },
            },
            "Metadata JSON",
          ),
        ],
      );
    },
  };
