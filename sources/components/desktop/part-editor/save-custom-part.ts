import m from "mithril";
import { defaultCatalog, registerCustomPart } from "../../../state/catalog.ts";
import { state } from "../../../state/state.ts";
import { clearDraft } from "../../../state/editor-autosave.ts";
import { SLOT_CONFIG, clearSlotSelections } from "../slot-config.ts";
import {
  buildEditedAnimationSheets,
  createCanvasesFromContext,
  createFrameOverrides,
} from "./save.ts";
import { recomposeCanvases } from "./canvas.ts";
import { createEditorContextSnapshot } from "./history.ts";
import { saveActiveEditorContext } from "./animation.ts";
import type { PartEditorState } from "./types.ts";
import { cleanupPartEditorLivePreview } from "./live-preview.ts";
import { showToast } from "../../../state/notifications.ts";

export async function saveCustomPartFromEditor(
  editorState: PartEditorState,
  slotLabel: string,
): Promise<void> {
  if (!editorState.baseItemId) return;
  const baseId = editorState.baseItemId;
  const meta = defaultCatalog.getItemMerged(baseId).unwrapOr(null);
  if (!meta) return;

  editorState.loading = true;
  try {
    recomposeCanvases(editorState);
    saveActiveEditorContext(editorState);
    const globalContext =
      editorState.globalEditorContext ??
      createEditorContextSnapshot(editorState);
    const globalCanvases = await createCanvasesFromContext(globalContext);
    const frameOverrides = await createFrameOverrides(editorState);
    const sheets = await buildEditedAnimationSheets(
      baseId,
      meta,
      globalCanvases.originalCanvases,
      globalCanvases.editedCanvases,
      frameOverrides,
    );
    const firstSheet = sheets["walk"] ?? Object.values(sheets)[0];
    if (!firstSheet) {
      throw new Error("No editable animation sheets could be generated.");
    }

    const customPartId = `custom_part_${Date.now()}`;
    const currentSelection =
      editorState.draftPreviewOriginalSelection ?? state.selections[meta.type_name];
    const customName = editorState.name.trim() || `Custom ${meta.name}`;

    registerCustomPart({
      itemId: customPartId,
      name: customName,
      type_name: meta.type_name,
      baseItemId: baseId,
      sheets,
      image: firstSheet,
    });

    const slot = SLOT_CONFIG.find((s) => s.label === slotLabel);
    if (slot) {
      clearSlotSelections(slot, defaultCatalog);
    }
    state.selections[meta.type_name] = {
      itemId: customPartId,
      variant: currentSelection?.variant ?? null,
      recolor: currentSelection?.recolor ?? null,
      name: customName,
    };

    cleanupPartEditorLivePreview(editorState, false);
    state.editingPart = null;
    editorState.baseItemId = null;
    editorState.unsavedChanges = false;
    void clearDraft(baseId);
    showToast(`Saved "${customName}" as a custom part.`, { kind: "success" });
    m.redraw();
  } catch (err) {
    console.error("Failed to save custom part:", err);
    showToast(
      err instanceof Error ? err.message : "Failed to save custom part.",
      { kind: "error" },
    );
  } finally {
    editorState.loading = false;
  }
}
