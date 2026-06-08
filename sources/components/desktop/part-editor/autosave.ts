import { debugWarn } from "../../../utils/debug.ts";
import {
  saveDraft,
  hasUnsavedDraft,
} from "../../../state/editor-autosave.ts";
import type { PartEditorState } from "./types.ts";
import { createEditorContextSnapshot } from "./history.ts";
import m from "mithril";

export function debouncedAutosave(stateObj: PartEditorState): void {
  const baseItemId = stateObj.baseItemId;
  if (!baseItemId) return;
  if (stateObj.autosaveDebounceTimer) {
    window.clearTimeout(stateObj.autosaveDebounceTimer);
  }
  stateObj.autosaveDebounceTimer = window.setTimeout(() => {
    const snapshot = JSON.stringify(createEditorContextSnapshot(stateObj));
    void saveDraft(baseItemId, snapshot).catch((err) => {
      debugWarn("Unable to autosave editor draft:", err);
    });
  }, 500);
}

export async function checkForDraftRecovery(
  stateObj: PartEditorState,
  itemId: string,
): Promise<void> {
  if (await hasUnsavedDraft(itemId)) {
    stateObj.showRecoveryPrompt = true;
    m.redraw();
  }
}

