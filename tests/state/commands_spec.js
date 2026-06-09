// @ts-nocheck
import { expect } from "chai";
import { describe, it, beforeEach, afterEach } from "mocha-globals";
import {
  executeCommand,
  getCommandTitle,
  getCommands,
  initDefaultCommands,
  registerEditorContext,
  resetCommandsForTests,
  setupGlobalShortcutListener,
} from "../../sources/state/commands.ts";
import {
  resetStateDeps,
  setStateDeps,
  state,
} from "../../sources/state/state.ts";
import {
  getConfirmDialog,
  getToasts,
  resetNotificationsForTests,
  resolveConfirmation,
} from "../../sources/state/notifications.ts";

function keydown(target, key, options = {}) {
  return target.dispatchEvent(
    new KeyboardEvent("keydown", {
      key,
      bubbles: true,
      cancelable: true,
      ...options,
    }),
  );
}

describe("state/commands.ts", () => {
  beforeEach(() => {
    resetCommandsForTests();
    resetNotificationsForTests();
    resetStateDeps();
    state.editingPart = null;
    state.previewCanvasZoomLevel = 1;
    initDefaultCommands();
  });

  afterEach(() => {
    resetCommandsForTests();
    resetNotificationsForTests();
    resetStateDeps();
    state.editingPart = null;
    state.previewCanvasZoomLevel = 1;
  });

  it("registers default commands idempotently", () => {
    const firstCount = getCommands().length;

    initDefaultCommands();

    expect(getCommands()).to.have.length(firstCount);
    expect(getCommands().map((cmd) => cmd.id)).to.include.members([
      "app.commandPalette.toggle",
      "app.shortcuts.toggle",
      "app.load.clipboard",
      "app.save.clipboard",
      "editor.tool.pen",
      "editor.layer.alphaLock",
    ]);
  });

  it("builds command titles from tooltip and shortcut metadata", () => {
    expect(getCommandTitle("app.export.png", "Export")).to.equal(
      "Export full spritesheet as PNG (Ctrl+Shift+E)",
    );
    expect(getCommandTitle("app.load.clipboard", "Load")).to.equal(
      "Load character from clipboard JSON",
    );
    expect(getCommandTitle("missing.command", "Fallback")).to.equal("Fallback");
  });

  it("toggles command palette and shortcut help through executable commands", () => {
    expect(executeCommand("app.commandPalette.toggle")).to.equal(true);
    expect(state.showCommandPalette).to.equal(true);

    expect(executeCommand("app.shortcuts.toggle")).to.equal(true);
    expect(state.showShortcutHelp).to.equal(true);
    expect(state.showCommandPalette).to.equal(false);
  });

  it("routes zoom commands to preview when no editor is active", () => {
    executeCommand("view.zoom.in");
    expect(state.previewCanvasZoomLevel).to.equal(1.25);

    executeCommand("view.zoom.out");
    expect(state.previewCanvasZoomLevel).to.equal(1);

    executeCommand("view.zoom.reset");
    expect(state.previewCanvasZoomLevel).to.equal(1);
  });

  it("routes zoom and tool commands to the active editor context", () => {
    const editorContext = {
      activeEditorTab: "edit",
      brushSize: 1,
      isFullscreen: false,
      mirrorX: false,
      mirrorY: false,
      tool: "pen",
      zoom: 4,
    };
    state.editingPart = { slotLabel: "Hair", itemId: "hair" };
    registerEditorContext(editorContext);

    expect(executeCommand("editor.tool.eraser")).to.equal(true);
    expect(editorContext.tool).to.equal("eraser");

    expect(executeCommand("editor.tool.select")).to.equal(false);
    expect(editorContext.tool).to.equal("eraser");

    editorContext.isFullscreen = true;
    expect(executeCommand("editor.tool.select")).to.equal(true);
    expect(editorContext.tool).to.equal("select");

    executeCommand("view.zoom.in");
    expect(editorContext.zoom).to.equal(5);
    expect(state.previewCanvasZoomLevel).to.equal(1);
  });

  it("confirms reset before applying the command", async () => {
    let selectedDefaults = false;
    setStateDeps({
      selectDefaults: async () => {
        selectedDefaults = true;
      },
      redraw: () => {},
    });
    state.selections = {
      hair: { itemId: "hair", name: "Hair" },
    };
    state.customImageZPos = 7;

    expect(executeCommand("app.reset")).to.equal(true);
    expect(selectedDefaults).to.equal(false);
    expect(getConfirmDialog()).to.include({
      title: "Reset selections",
      confirmLabel: "Reset",
      danger: true,
    });

    resolveConfirmation(true);
    await new Promise((resolve) => window.setTimeout(resolve, 0));

    expect(selectedDefaults).to.equal(true);
    expect(state.selections).to.deep.equal({});
    expect(state.customImageZPos).to.equal(0);
    expect(getToasts().map((toast) => toast.message)).to.include(
      "Selections reset.",
    );
  });

  it("handles global shortcuts and ignores typing fields", () => {
    setupGlobalShortcutListener();

    keydown(window, "k", { ctrlKey: true });
    expect(state.showCommandPalette).to.equal(true);

    keydown(window, "Escape");
    expect(state.showCommandPalette).to.equal(false);

    keydown(window, "/", { ctrlKey: true });
    expect(state.showShortcutHelp).to.equal(true);

    keydown(window, "Escape");
    expect(state.showShortcutHelp).to.equal(false);

    const input = document.createElement("input");
    document.body.appendChild(input);
    keydown(input, "k", { ctrlKey: true });
    expect(state.showCommandPalette).to.equal(false);

    state.showCommandPalette = true;
    keydown(input, "Escape");
    expect(state.showCommandPalette).to.equal(false);
    input.remove();
  });
});
