import m from "mithril";
import type { PartEditorState, EditorContextSnapshot } from "../types.ts";
import { loadDraft, clearDraft } from "../../../../state/editor-autosave.ts";
import { debugWarn } from "../../../../utils/debug.ts";
import { restoreEditorContext } from "../animation.ts";

export function renderRecoveryPrompt(stateObj: PartEditorState): m.Children {
  return m("div.part-editor-recovery-overlay", [
    m("div.part-editor-recovery-dialog", [
      m("h4", "Recover Unsaved Draft?"),
      m("p", "You have unsaved edits from a previous session."),
      m("div.part-editor-recovery-actions", [
        m(
          "button.part-editor-pro-button",
          {
            type: "button",
            onclick: async () => {
              const draft = await loadDraft(stateObj.baseItemId!);
              if (draft) {
                try {
                  const context = JSON.parse(draft) as EditorContextSnapshot;
                  await restoreEditorContext(stateObj, context);
                  stateObj.globalEditorContext = context;
                  stateObj.unsavedChanges = true;
                } catch (err) {
                  debugWarn("Failed to restore draft:", err);
                }
              }
              stateObj.showRecoveryPrompt = false;
              m.redraw();
            },
          },
          "Restore Draft",
        ),
        m(
          "button.part-editor-pro-button.part-editor-transform-clear",
          {
            type: "button",
            onclick: () => {
              stateObj.showRecoveryPrompt = false;
              if (stateObj.baseItemId) {
                void clearDraft(stateObj.baseItemId);
              }
              m.redraw();
            },
          },
          "Discard",
        ),
      ]),
    ]),
  ]);
}
