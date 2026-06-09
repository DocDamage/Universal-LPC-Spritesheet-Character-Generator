import m from "mithril";
import type { PartEditorState } from "../types.ts";
import { switchEditorContext, isFrameDirty } from "../animation.ts";

export function renderTimelineThumbnails(
  stateObj: PartEditorState,
  frameCount: number,
): m.Children {
  if (!stateObj.frameMode || frameCount <= 1) return null;

  return m("div.part-editor-timeline-strip", [
    Array.from({ length: frameCount }, (_, i) => {
      const isActive = i === stateObj.frameIndex;
      const dirty = isFrameDirty(stateObj, i);
      return m(
        "div.part-editor-timeline-thumb",
        {
          key: i,
          class: isActive ? "active" : "",
          title: `Frame ${i + 1}${dirty ? " (edited)" : ""}`,
          onclick: () => {
            void switchEditorContext(
              stateObj,
              true,
              stateObj.frameAnimation,
              i,
            );
          },
        },
        [
          m("span.part-editor-timeline-label", String(i + 1)),
          dirty ? m("span.part-editor-timeline-dot") : null,
        ],
      );
    }),
  ]);
}
