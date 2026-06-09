import m from "mithril";
import type { PartEditorState } from "../types.ts";
import {
  getAnimationFrameCount,
  getAnimationLabel,
  switchEditorContext,
  applyGlobalToFrame,
  startPlayback,
  stopPlayback,
  updateOnionCanvases,
} from "../animation.ts";
import { renderTimelineThumbnails } from "./timeline-thumbnails.ts";

export function renderAnimationEditorPanel(
  stateObj: PartEditorState,
): m.Children {
  const frameCount = getAnimationFrameCount(stateObj.frameAnimation);
  const canUseFrameTools = stateObj.availableFrameAnimations.length > 0;

  return [
    m("div.part-editor-pro-section.part-editor-timeline-section", [
      m("h4", "Timeline"),
      m("div.part-editor-mode-switch", [
        m(
          "button.part-editor-pro-button",
          {
            type: "button",
            class: !stateObj.frameMode ? "active" : "",
            title: "Edit global standing-frame changes",
            onclick: () => {
              void switchEditorContext(stateObj, false);
            },
          },
          "Global",
        ),
        m(
          "button.part-editor-pro-button",
          {
            type: "button",
            class: stateObj.frameMode ? "active" : "",
            disabled: !canUseFrameTools,
            title: "Edit one animation frame",
            onclick: () => {
              void switchEditorContext(stateObj, true);
            },
          },
          "Frame",
        ),
      ]),
      m("label.part-editor-pro-field.part-editor-pro-field-wide", [
        m("span", "Anim"),
        m(
          "select",
          {
            value: stateObj.frameAnimation,
            disabled: !canUseFrameTools,
            title: "Animation for frame editing",
            onchange: (e: Event) => {
              const animation = (e.target as HTMLSelectElement).value;
              void switchEditorContext(stateObj, true, animation, 0);
            },
          },
          stateObj.availableFrameAnimations.map((animation) =>
            m("option", { value: animation }, getAnimationLabel(animation)),
          ),
        ),
        m("b", stateObj.frameMode ? "On" : "Off"),
      ]),
      m("div.part-editor-playback-controls", [
        m(
          "button.part-editor-pro-button",
          {
            type: "button",
            title: stateObj.isPlaying ? "Pause playback" : "Play animation",
            disabled: !stateObj.frameMode,
            onclick: () => {
              if (stateObj.isPlaying) {
                stopPlayback(stateObj);
              } else {
                startPlayback(stateObj);
              }
            },
          },
          stateObj.isPlaying ? "⏸ Pause" : "▶ Play",
        ),
      ]),
      m("div.part-editor-frame-controls", [
        m(
          "button.part-editor-pro-button",
          {
            type: "button",
            disabled: !stateObj.frameMode || stateObj.frameIndex <= 0,
            title: "Previous animation frame (,)",
            onclick: () => {
              void switchEditorContext(
                stateObj,
                true,
                stateObj.frameAnimation,
                stateObj.frameIndex - 1,
              );
            },
          },
          "<",
        ),
        m("input.part-editor-frame-slider", {
          type: "range",
          min: "0",
          max: String(Math.max(0, frameCount - 1)),
          step: "1",
          value: String(stateObj.frameIndex),
          disabled: !stateObj.frameMode,
          title: "Animation frame",
          oninput: (e: Event) => {
            void switchEditorContext(
              stateObj,
              true,
              stateObj.frameAnimation,
              Number((e.target as HTMLInputElement).value),
            );
          },
        }),
        m(
          "button.part-editor-pro-button",
          {
            type: "button",
            disabled:
              !stateObj.frameMode || stateObj.frameIndex >= frameCount - 1,
            title: "Next animation frame (.)",
            onclick: () => {
              void switchEditorContext(
                stateObj,
                true,
                stateObj.frameAnimation,
                stateObj.frameIndex + 1,
              );
            },
          },
          ">",
        ),
        m(
          "span.part-editor-frame-count",
          `${stateObj.frameIndex + 1}/${frameCount}`,
        ),
      ]),
      renderTimelineThumbnails(stateObj, frameCount),
      m(
        "button.part-editor-pro-button",
        {
          type: "button",
          title: "Copy global edits into the current frame",
          disabled: !stateObj.frameMode || !stateObj.globalEditorContext,
          onclick: () => applyGlobalToFrame(stateObj),
        },
        "Apply Global to Frame",
      ),
      m(
        "label.part-editor-pro-toggle",
        {
          title: "Show neighboring animation frames",
        },
        [
          m("input", {
            type: "checkbox",
            checked: stateObj.onionSkin,
            onchange: (e: Event) => {
              stateObj.onionSkin = (e.target as HTMLInputElement).checked;
              if (stateObj.frameMode) {
                void updateOnionCanvases(stateObj);
              }
            },
          }),
          "Onion",
        ],
      ),
      m("label.part-editor-pro-field", [
        m("span", "Ghost"),
        m("input", {
          type: "range",
          min: "10",
          max: "70",
          step: "5",
          value: String(Math.round(stateObj.onionOpacity * 100)),
          title: "Onion skin opacity",
          oninput: (e: Event) => {
            stateObj.onionOpacity =
              Number((e.target as HTMLInputElement).value) / 100;
          },
        }),
        m("b", `${Math.round(stateObj.onionOpacity * 100)}%`),
      ]),
    ]),
  ];
}
