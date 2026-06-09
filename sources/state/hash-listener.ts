import m from "mithril";
import { state, selectDefaults } from "./state.ts";
import { getHash } from "./hash-url.ts";
import { loadSelectionsFromHash } from "./hash-selection.ts";

/** Wire up the browser hashchange event. */
export function initHashChangeListener(listener?: () => void): void {
  if (listener) {
    window.addEventListener("hashchange", listener);
    return;
  }

  // Listen for browser back/forward navigation.
  window.addEventListener("hashchange", async function () {
    const currentHash = getHash();

    // Distinguish external changes (browser navigation) from our own updates:
    // `afterStateChange()` updates the hash; we don't want to reload from it.
    // External changes show as a hash that differs from the one we'd produce.
    const expectedHash =
      "#" +
      Object.entries({
        bodyType: state.bodyType,
        ...Object.fromEntries(
          Object.values(state.selections).map((s): [string, string] => [
            s.itemId,
            String(s.subId),
          ]),
        ),
      })
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join("&");

    // Hash matches what we'd produce — it's our own update; ignore.
    if (currentHash === expectedHash) {
      return;
    }

    // Load from hash (updates state once).
    loadSelectionsFromHash();

    // If nothing loaded from hash, use defaults.
    if (Object.keys(state.selections).length === 0) {
      await selectDefaults();
    }

    // Trigger redraw which calls `App.onupdate` (syncs hash and renders canvas).
    m.redraw();
  });
}
