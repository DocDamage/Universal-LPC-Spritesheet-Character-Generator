import { expect } from "chai";
import { describe, it, beforeEach, afterEach } from "mocha-globals";
import {
  dismissToast,
  getConfirmDialog,
  getToasts,
  requestConfirmation,
  resetNotificationsForTests,
  resolveConfirmation,
  showToast,
} from "../../sources/state/notifications.ts";

describe("state/notifications.ts", () => {
  beforeEach(() => {
    resetNotificationsForTests();
  });

  afterEach(() => {
    resetNotificationsForTests();
  });

  it("adds and dismisses toasts", () => {
    const id = showToast("Saved", { kind: "success", timeoutMs: 0 });

    expect(getToasts()).to.deep.equal([
      { id, kind: "success", message: "Saved" },
    ]);

    dismissToast(id);

    expect(getToasts()).to.have.length(0);
  });

  it("resolves confirmations", async () => {
    const result = requestConfirmation({
      title: "Reset",
      message: "Reset all selections?",
    });

    expect(getConfirmDialog()).to.include({
      title: "Reset",
      message: "Reset all selections?",
      confirmLabel: "Confirm",
      cancelLabel: "Cancel",
      danger: false,
    });

    resolveConfirmation(true);

    expect(await result).to.equal(true);
    expect(getConfirmDialog()).to.equal(null);
  });

  it("cancels an active confirmation when a new one opens", async () => {
    const first = requestConfirmation({
      title: "First",
      message: "First dialog",
    });
    const second = requestConfirmation({
      title: "Second",
      message: "Second dialog",
    });

    expect(await first).to.equal(false);
    expect(getConfirmDialog()).to.include({ title: "Second" });

    resolveConfirmation(false);

    expect(await second).to.equal(false);
  });
});
