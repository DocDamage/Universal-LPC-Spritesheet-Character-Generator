import m from "mithril";
import { state } from "../state/state.ts";
import { syncSelectionsToHash } from "../state/hash.ts";
import { renderCharacter } from "../canvas/renderer.ts";

/**
 * Builds a deterministic key from all state fields that affect the canvas render.
 * Used by App and DesktopApp to detect when a re-render + hash sync is needed.
 */
export function buildRenderKey(): string {
  const imageKey = state.customUploadedImage
    ? state.customUploadedImage.src +
      "#" +
      state.customUploadedImage.width +
      "x" +
      state.customUploadedImage.height
    : "";
  return (
    JSON.stringify(state.selections) +
    "|" +
    state.bodyType +
    "|" +
    state.customImageZPos +
    "|" +
    imageKey
  );
}

/**
 * Syncs the current selections to the URL hash and triggers an offscreen
 * canvas render.  Returns a promise that resolves when the render (and
 * subsequent Mithril redraw) is complete.
 */
export function triggerRender(): Promise<void> {
  syncSelectionsToHash();
  if (window.canvasRenderer) {
    return renderCharacter(state.selections, state.bodyType)
      .then(() => m.redraw())
      .catch((err) => {
        console.error("[render-effect] renderCharacter failed:", err);
      });
  }
  return Promise.resolve();
}
