import m from "mithril";
import { err } from "neverthrow";
import { expect } from "chai";
import { describe, it, beforeEach, afterEach } from "mocha-globals";
import { App } from "../../sources/components/App.ts";
import {
  requestConfirmation,
  resetNotificationsForTests,
  showToast,
} from "../../sources/state/notifications.ts";
import { state } from "../../sources/state/state.ts";

const loadingCatalog = {
  isLayersReady: () => false,
  isLiteReady: () => false,
  isCreditsReady: () => false,
  getCategoryTree: () => err({ kind: "loading", chunk: "index" }),
  getItemLite: (itemId) => err({ kind: "not-found", id: itemId }),
  getItemMerged: (itemId) => err({ kind: "not-found", id: itemId }),
};

describe("App", () => {
  let container;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    state.selections = {};
    state.previewBootstrapRenderDone = false;
    resetNotificationsForTests();
  });

  afterEach(() => {
    m.render(container, null);
    container.remove();
    resetNotificationsForTests();
  });

  it("mounts the shared notification center", () => {
    showToast("Legacy feedback", { kind: "success", timeoutMs: 0 });

    m.render(container, m(App, { catalog: loadingCatalog }));

    expect(
      container.querySelector(".notification-toast-message").textContent,
    ).to.equal("Legacy feedback");
  });

  it("mounts the shared confirmation dialog", () => {
    void requestConfirmation({
      title: "Confirm legacy action",
      message: "Continue?",
      confirmLabel: "Continue",
    });

    m.render(container, m(App, { catalog: loadingCatalog }));

    expect(
      container.querySelector(".confirm-dialog-header h3").textContent,
    ).to.equal("Confirm legacy action");
  });
});
