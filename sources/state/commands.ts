import m from "mithril";
import { state, resetAll } from "./state.ts";
import { setPreviewCanvasZoom } from "../canvas/preview-canvas.ts";
import { randomizeAll } from "../components/desktop/slot-config.ts";
import { defaultCatalog } from "./catalog.ts";
import { downloadAsPNG, downloadFile } from "../canvas/download.ts";
import { getAllCredits, creditsToCsv } from "../utils/credits.ts";
import {
  exportStateAsJSON,
  importStateFromJSON,
  serializeLayersForJson,
} from "./json.ts";
import { renderState } from "./render-state.ts";
import {
  clampBrushSize,
  type EditorTool,
} from "../components/desktop/pixel-editor-tools.ts";
import { clamp } from "../utils/helpers.ts";
import { requestConfirmation, showToast } from "./notifications.ts";

import {
  initShortcutPreferences,
  getShortcut,
  setShortcut as setShortcutPreference,
  getConflicts as getShortcutConflicts,
  resetShortcuts as resetShortcutPreferences,
  clearShortcut,
} from "./shortcut-preferences.ts";

const MIN_PREVIEW_ZOOM = 0.5;
const MAX_PREVIEW_ZOOM = 5;
const PREVIEW_ZOOM_STEP = 0.25;
const MIN_EDITOR_ZOOM = 2;
const MAX_EDITOR_ZOOM = 16;
const DEFAULT_EDITOR_ZOOM = 4;

export type CommandKeyCombo = {
  key: string | readonly string[];
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
};

export interface Command {
  id: string;
  label: string;
  category: string;
  tooltip?: string;
  shortcut?: string;
  keyCombo?: CommandKeyCombo;
  action?: () => void | Promise<void>;
  enabled?: () => boolean;
}

export type EditorCommandContext = {
  activeEditorTab: "edit" | "animation";
  brushSize: number;
  isFullscreen: boolean;
  mirrorX: boolean;
  mirrorY: boolean;
  tool: EditorTool;
  zoom: number;
};

export const commands: Command[] = [];
let activeEditorContext: EditorCommandContext | null = null;
let shortcutListener: ((e: KeyboardEvent) => void) | null = null;
let defaultKeyCombos: Record<string, CommandKeyCombo> = {};

export function registerEditorContext(stateObj: EditorCommandContext): void {
  activeEditorContext = stateObj;
}

export function unregisterEditorContext(): void {
  activeEditorContext = null;
}

export function getEditorContext(): EditorCommandContext | null {
  return activeEditorContext;
}

export function registerCommand(command: Command): void {
  // Prevent duplicate registers
  const existingIdx = commands.findIndex((c) => c.id === command.id);
  if (existingIdx !== -1) {
    commands[existingIdx] = command;
  } else {
    commands.push(command);
  }
}

export function executeCommand(id: string): boolean {
  const cmd = commands.find((c) => c.id === id);
  if (cmd?.action && isCommandEnabled(cmd)) {
    runCommandAction(cmd);
    m.redraw();
    return true;
  }
  return false;
}

export function getCommands(): Command[] {
  return commands;
}

export function getCommand(id: string): Command | undefined {
  return commands.find((cmd) => cmd.id === id);
}

export function getCommandTitle(id: string, fallback: string): string {
  const cmd = getCommand(id);
  if (!cmd) return fallback;
  const title = cmd.tooltip ?? cmd.label;
  return cmd.shortcut ? `${title} (${cmd.shortcut})` : title;
}

function isCommandEnabled(cmd: Command): boolean {
  return cmd.enabled ? cmd.enabled() : true;
}

function runCommandAction(cmd: Command): void {
  try {
    const result = cmd.action?.();
    void Promise.resolve(result).catch((err: unknown) => {
      console.error(`Command failed: ${cmd.id}`, err);
      showToast("Command failed. Check the console for details.", {
        kind: "error",
      });
    });
  } catch (err) {
    console.error(`Command failed: ${cmd.id}`, err);
    showToast("Command failed. Check the console for details.", {
      kind: "error",
    });
  }
}

function hasActiveEditor(): boolean {
  return activeEditorContext !== null && state.editingPart !== null;
}

function hasFullscreenEditor(): boolean {
  return hasActiveEditor() && activeEditorContext?.isFullscreen === true;
}

function clampPreviewZoom(value: number): number {
  return clamp(value, MIN_PREVIEW_ZOOM, MAX_PREVIEW_ZOOM);
}

function clampEditorZoom(value: number): number {
  return clamp(value, MIN_EDITOR_ZOOM, MAX_EDITOR_ZOOM);
}

function zoomIn(): void {
  if (hasActiveEditor() && activeEditorContext) {
    activeEditorContext.zoom = clampEditorZoom(activeEditorContext.zoom + 1);
    return;
  }
  const zoom = clampPreviewZoom(
    (state.previewCanvasZoomLevel || 1) + PREVIEW_ZOOM_STEP,
  );
  state.previewCanvasZoomLevel = zoom;
  setPreviewCanvasZoom(zoom);
}

function zoomOut(): void {
  if (hasActiveEditor() && activeEditorContext) {
    activeEditorContext.zoom = clampEditorZoom(activeEditorContext.zoom - 1);
    return;
  }
  const zoom = clampPreviewZoom(
    (state.previewCanvasZoomLevel || 1) - PREVIEW_ZOOM_STEP,
  );
  state.previewCanvasZoomLevel = zoom;
  setPreviewCanvasZoom(zoom);
}

function resetZoom(): void {
  if (hasActiveEditor() && activeEditorContext) {
    activeEditorContext.zoom = DEFAULT_EDITOR_ZOOM;
    return;
  }
  state.previewCanvasZoomLevel = 1;
  setPreviewCanvasZoom(1);
}

function selectEditorTool(tool: EditorTool): void {
  if (activeEditorContext) {
    activeEditorContext.tool = tool;
  }
}

function setEditorTab(tab: EditorCommandContext["activeEditorTab"]): void {
  if (activeEditorContext) {
    activeEditorContext.activeEditorTab = tab;
  }
}

function applyShortcutOverrides(): void {
  for (const cmd of commands) {
    if (!cmd.id) continue;
    const override = getShortcut(cmd.id);
    if (override) {
      cmd.keyCombo = override;
      cmd.shortcut = formatShortcut(override);
    }
  }
}

function formatShortcut(keyCombo: CommandKeyCombo): string {
  const parts: string[] = [];
  if (keyCombo.ctrlKey) parts.push("Ctrl");
  if (keyCombo.altKey) parts.push("Alt");
  if (keyCombo.shiftKey) parts.push("Shift");
  const rawKey =
    typeof keyCombo.key === "string"
      ? keyCombo.key
      : (keyCombo.key as string[]).join("/");
  const key = rawKey.length === 1 ? rawKey.toUpperCase() : rawKey;
  parts.push(key);
  return parts.join("+");
}

export function setCommandShortcut(
  commandId: string,
  keyCombo: CommandKeyCombo | null,
): boolean {
  if (!keyCombo) {
    clearShortcut(commandId);
    const cmd = getCommand(commandId);
    if (cmd) {
      const def = defaultKeyCombos[commandId];
      if (def) {
        cmd.keyCombo = def;
        cmd.shortcut = formatShortcut(def);
      } else {
        cmd.keyCombo = undefined;
        cmd.shortcut = undefined;
      }
    }
    return true;
  }
  const success = setShortcutPreference(commandId, keyCombo);
  if (success) {
    const cmd = getCommand(commandId);
    if (cmd) {
      cmd.keyCombo = keyCombo;
      cmd.shortcut = formatShortcut(keyCombo);
    }
  }
  return success;
}

export function getAllShortcutConflicts(): string[][] {
  return getShortcutConflicts();
}

export function resetAllShortcuts(): void {
  resetShortcutPreferences();
  for (const cmd of commands) {
    if (!cmd.id) continue;
    const def = defaultKeyCombos[cmd.id];
    if (def) {
      cmd.keyCombo = def;
      cmd.shortcut = formatShortcut(def);
    } else {
      cmd.keyCombo = undefined;
      cmd.shortcut = undefined;
    }
  }
}

export function initDefaultCommands(): void {
  defaultKeyCombos = {};

  function register(cmd: Command): void {
    if (cmd.keyCombo) {
      defaultKeyCombos[cmd.id] = cmd.keyCombo;
    }
    registerCommand(cmd);
  }

  register({
    id: "app.commandPalette.toggle",
    label: "Open Command Palette",
    category: "General",
    shortcut: "Ctrl+K",
    keyCombo: { key: "k", ctrlKey: true },
    action: () => {
      state.showCommandPalette = !state.showCommandPalette;
      if (state.showCommandPalette) {
        state.showShortcutHelp = false;
      }
    },
  });

  register({
    id: "app.shortcuts.toggle",
    label: "Show Keyboard Shortcuts",
    category: "General",
    shortcut: "Ctrl+/",
    keyCombo: { key: ["/", "?"], ctrlKey: true },
    action: () => {
      state.showShortcutHelp = !state.showShortcutHelp;
      if (state.showShortcutHelp) {
        state.showCommandPalette = false;
      }
    },
  });

  register({
    id: "view.zoom.in",
    label: "Zoom In",
    category: "View",
    shortcut: "Ctrl++",
    keyCombo: { key: ["=", "+"], ctrlKey: true },
    action: zoomIn,
  });

  register({
    id: "view.zoom.out",
    label: "Zoom Out",
    category: "View",
    shortcut: "Ctrl+-",
    keyCombo: { key: "-", ctrlKey: true },
    action: zoomOut,
  });

  register({
    id: "view.zoom.reset",
    label: "Reset Zoom",
    category: "View",
    shortcut: "Ctrl+0",
    keyCombo: { key: "0", ctrlKey: true },
    action: resetZoom,
  });

  register({
    id: "app.reset",
    label: "Reset All Selections",
    category: "Actions",
    shortcut: "Ctrl+Alt+R",
    keyCombo: { key: "r", ctrlKey: true, altKey: true },
    action: async () => {
      const confirmed = await requestConfirmation({
        title: "Reset selections",
        message: "Reset all selections to defaults?",
        confirmLabel: "Reset",
        danger: true,
      });
      if (!confirmed) return;

      await resetAll();
      showToast("Selections reset.", { kind: "success" });
    },
  });

  register({
    id: "app.randomize",
    label: "Randomize All Slots",
    category: "Actions",
    shortcut: "Ctrl+Alt+Shift+R",
    keyCombo: { key: "r", ctrlKey: true, altKey: true, shiftKey: true },
    action: async () => {
      const confirmed = await requestConfirmation({
        title: "Randomize character",
        message: "Randomly select items for all slots?",
        confirmLabel: "Randomize",
      });
      if (!confirmed) return;

      randomizeAll(defaultCatalog);
      showToast("Character randomized.", { kind: "success" });
    },
  });

  register({
    id: "app.load.clipboard",
    label: "Load Character from Clipboard",
    category: "File",
    tooltip: "Load character from clipboard JSON",
    action: async () => {
      if (!window.canvasRenderer) {
        showToast("Canvas renderer is not ready yet.", { kind: "warning" });
        return;
      }
      try {
        const json = await navigator.clipboard.readText();
        const imported = importStateFromJSON(json);
        Object.assign(state, imported);
        m.redraw();
        showToast("Character loaded from clipboard.", { kind: "success" });
      } catch (err) {
        console.error("Failed to load:", err);
        showToast("Failed to load. Check clipboard content.", {
          kind: "error",
        });
      }
    },
  });

  register({
    id: "app.save.clipboard",
    label: "Save Character to Clipboard",
    category: "File",
    tooltip: "Save character to clipboard as JSON",
    shortcut: "Ctrl+S",
    keyCombo: { key: "s", ctrlKey: true },
    action: async () => {
      if (!window.canvasRenderer) {
        showToast("Canvas renderer is not ready yet.", { kind: "warning" });
        return;
      }
      try {
        const json = exportStateAsJSON(
          state,
          serializeLayersForJson(renderState.drawCalls),
        );
        await navigator.clipboard.writeText(json);
        showToast("Character saved to clipboard.", { kind: "success" });
      } catch (err) {
        console.error("Failed to save:", err);
        showToast("Failed to save. Check browser permissions.", {
          kind: "error",
        });
      }
    },
  });

  register({
    id: "app.export.png",
    label: "Export PNG Spritesheet",
    category: "File",
    tooltip: "Export full spritesheet as PNG",
    shortcut: "Ctrl+Shift+E",
    keyCombo: { key: "e", ctrlKey: true, shiftKey: true },
    action: () => {
      if (!window.canvasRenderer) {
        showToast("Canvas renderer is not ready yet.", { kind: "warning" });
        return;
      }
      downloadAsPNG("character-spritesheet.png");
    },
  });

  register({
    id: "app.export.credits",
    label: "Export Credits CSV",
    category: "File",
    tooltip: "Download asset credits as CSV",
    shortcut: "Ctrl+Shift+C",
    keyCombo: { key: "c", ctrlKey: true, shiftKey: true },
    action: () => {
      const allCredits = getAllCredits(state.selections, state.bodyType);
      const csvContent = creditsToCsv(allCredits);
      downloadFile(csvContent, "credits.csv", "text/csv");
    },
  });

  register({
    id: "app.grid.toggle",
    label: "Toggle Transparency Grid",
    category: "View",
    tooltip: "Toggle the preview transparency grid",
    action: () => {
      state.showTransparencyGrid = !state.showTransparencyGrid;
    },
  });

  register({
    id: "app.shadows.toggle",
    label: "Toggle Cast Shadow",
    category: "View",
    tooltip: "Toggle cast shadow transparency mask",
    action: () => {
      state.applyTransparencyMask = !state.applyTransparencyMask;
    },
  });

  register({
    id: "app.tab.body",
    label: "Switch to Body Tab",
    category: "General",
    shortcut: "Ctrl+1",
    keyCombo: { key: "1", ctrlKey: true },
    action: () => {
      state.activeTab = "character";
    },
  });

  register({
    id: "app.tab.gear",
    label: "Switch to Gear Tab",
    category: "General",
    shortcut: "Ctrl+2",
    keyCombo: { key: "2", ctrlKey: true },
    action: () => {
      state.activeTab = "accessories";
    },
  });

  register({
    id: "editor.fullscreen.toggle",
    label: "Toggle Fullscreen Editor",
    category: "Editor",
    shortcut: "F",
    keyCombo: { key: "f" },
    enabled: hasActiveEditor,
    action: () => {
      if (activeEditorContext) {
        activeEditorContext.isFullscreen = !activeEditorContext.isFullscreen;
      }
    },
  });

  register({
    id: "editor.tab.edit",
    label: "Show Editor Tools Tab",
    category: "Editor",
    shortcut: "1",
    keyCombo: { key: "1" },
    enabled: hasFullscreenEditor,
    action: () => setEditorTab("edit"),
  });

  register({
    id: "editor.tab.animation",
    label: "Show Animation Tab",
    category: "Editor",
    shortcut: "2",
    keyCombo: { key: "2" },
    enabled: hasFullscreenEditor,
    action: () => setEditorTab("animation"),
  });

  register({
    id: "editor.tool.pen",
    label: "Select Pencil Tool",
    category: "Editor Tools",
    shortcut: "B/P",
    keyCombo: { key: ["b", "p"] },
    enabled: hasActiveEditor,
    action: () => selectEditorTool("pen"),
  });

  register({
    id: "editor.tool.eraser",
    label: "Select Eraser Tool",
    category: "Editor Tools",
    shortcut: "E",
    keyCombo: { key: "e" },
    enabled: hasActiveEditor,
    action: () => selectEditorTool("eraser"),
  });

  register({
    id: "editor.tool.picker",
    label: "Select Color Picker",
    category: "Editor Tools",
    shortcut: "I",
    keyCombo: { key: "i" },
    enabled: hasActiveEditor,
    action: () => selectEditorTool("picker"),
  });

  register({
    id: "editor.tool.select",
    label: "Select Marquee Selection",
    category: "Editor Tools",
    shortcut: "M",
    keyCombo: { key: "m" },
    enabled: hasFullscreenEditor,
    action: () => selectEditorTool("select"),
  });

  register({
    id: "editor.tool.line",
    label: "Select Line Tool",
    category: "Editor Tools",
    shortcut: "L",
    keyCombo: { key: "l" },
    enabled: hasFullscreenEditor,
    action: () => selectEditorTool("line"),
  });

  register({
    id: "editor.tool.rect",
    label: "Select Rectangle Tool",
    category: "Editor Tools",
    shortcut: "R",
    keyCombo: { key: "r" },
    enabled: hasFullscreenEditor,
    action: () => selectEditorTool("rect"),
  });

  register({
    id: "editor.tool.ellipse",
    label: "Select Ellipse Tool",
    category: "Editor Tools",
    shortcut: "O",
    keyCombo: { key: "o" },
    enabled: hasFullscreenEditor,
    action: () => selectEditorTool("ellipse"),
  });

  register({
    id: "editor.tool.fill",
    label: "Select Fill Tool",
    category: "Editor Tools",
    shortcut: "G",
    keyCombo: { key: "g" },
    enabled: hasFullscreenEditor,
    action: () => selectEditorTool("fill"),
  });

  register({
    id: "editor.brush.smaller",
    label: "Decrease Brush Size",
    category: "Editor",
    shortcut: "[",
    keyCombo: { key: "[" },
    enabled: hasActiveEditor,
    action: () => {
      if (activeEditorContext) {
        activeEditorContext.brushSize = clampBrushSize(
          activeEditorContext.brushSize - 1,
        );
      }
    },
  });

  register({
    id: "editor.brush.larger",
    label: "Increase Brush Size",
    category: "Editor",
    shortcut: "]",
    keyCombo: { key: "]" },
    enabled: hasActiveEditor,
    action: () => {
      if (activeEditorContext) {
        activeEditorContext.brushSize = clampBrushSize(
          activeEditorContext.brushSize + 1,
        );
      }
    },
  });

  register({
    id: "editor.mirrorX.toggle",
    label: "Toggle Horizontal Mirror",
    category: "Editor",
    shortcut: "X",
    keyCombo: { key: "x" },
    enabled: hasFullscreenEditor,
    action: () => {
      if (activeEditorContext) {
        activeEditorContext.mirrorX = !activeEditorContext.mirrorX;
      }
    },
  });

  register({
    id: "editor.mirrorY.toggle",
    label: "Toggle Vertical Mirror",
    category: "Editor",
    shortcut: "Y",
    keyCombo: { key: "y" },
    enabled: hasFullscreenEditor,
    action: () => {
      if (activeEditorContext) {
        activeEditorContext.mirrorY = !activeEditorContext.mirrorY;
      }
    },
  });

  register({
    id: "editor.undo",
    label: "Undo Edit",
    category: "Editor",
    shortcut: "Ctrl+Z",
    keyCombo: { key: "z", ctrlKey: true },
  });

  register({
    id: "editor.redo",
    label: "Redo Edit",
    category: "Editor",
    shortcut: "Ctrl+Y / Ctrl+Shift+Z",
    keyCombo: { key: "y", ctrlKey: true, shiftKey: true },
  });

  register({
    id: "editor.layer.new",
    label: "Add Layer",
    category: "Editor Layers",
    shortcut: "Ctrl+Shift+N",
    keyCombo: { key: "n", ctrlKey: true, shiftKey: true },
  });

  register({
    id: "editor.layer.duplicate",
    label: "Duplicate Layer",
    category: "Editor Layers",
    shortcut: "Ctrl+J",
    keyCombo: { key: "j", ctrlKey: true },
  });

  register({
    id: "editor.layer.mergeDown",
    label: "Merge Layer Down",
    category: "Editor Layers",
    shortcut: "Ctrl+E",
    keyCombo: { key: "e", ctrlKey: true },
  });

  register({
    id: "editor.layer.flatten",
    label: "Flatten Visible Layers",
    category: "Editor Layers",
    shortcut: "Ctrl+Shift+E",
    keyCombo: { key: "e", ctrlKey: true, shiftKey: true },
  });

  register({
    id: "editor.layer.pixelLock",
    label: "Toggle Layer Pixel Lock",
    category: "Editor Layers",
    shortcut: "/",
    keyCombo: { key: "/" },
  });

  register({
    id: "editor.layer.alphaLock",
    label: "Toggle Layer Alpha Lock",
    category: "Editor Layers",
    shortcut: "?",
    keyCombo: { key: "?" },
  });

  register({
    id: "editor.frame.previous",
    label: "Previous Animation Frame",
    category: "Animation",
    shortcut: ",",
    keyCombo: { key: "," },
  });

  register({
    id: "editor.frame.next",
    label: "Next Animation Frame",
    category: "Animation",
    shortcut: ".",
    keyCombo: { key: "." },
  });

  initShortcutPreferences(defaultKeyCombos);
  applyShortcutOverrides();
}

export function setupGlobalShortcutListener(): void {
  if (shortcutListener) return;
  shortcutListener = handleGlobalKeyDown;
  window.addEventListener("keydown", shortcutListener);
}

export function teardownGlobalShortcutListener(): void {
  if (!shortcutListener) return;
  window.removeEventListener("keydown", shortcutListener);
  shortcutListener = null;
}

export function resetCommandsForTests(): void {
  teardownGlobalShortcutListener();
  commands.length = 0;
  activeEditorContext = null;
  state.showCommandPalette = false;
  state.showShortcutHelp = false;
  defaultKeyCombos = {};
}

function handleGlobalKeyDown(e: KeyboardEvent): void {
  const key = e.key.toLowerCase();

  if (key === "escape" && closeOpenOverlay()) {
    e.preventDefault();
    e.stopImmediatePropagation();
    m.redraw();
    return;
  }

  if (isTypingTarget(e.target)) {
    return;
  }

  for (const cmd of commands) {
    if (!cmd.action || !cmd.keyCombo || !isCommandEnabled(cmd)) {
      continue;
    }

    if (matchesKeyCombo(e, cmd.keyCombo)) {
      e.preventDefault();
      e.stopImmediatePropagation();
      runCommandAction(cmd);
      m.redraw();
      return;
    }
  }
}

function closeOpenOverlay(): boolean {
  if (state.showCommandPalette) {
    state.showCommandPalette = false;
    return true;
  }
  if (state.showShortcutHelp) {
    state.showShortcutHelp = false;
    return true;
  }
  return false;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tagName = target.tagName.toLowerCase();
  return (
    tagName === "input" ||
    tagName === "select" ||
    tagName === "textarea" ||
    target.isContentEditable
  );
}

function matchesKeyCombo(e: KeyboardEvent, combo: CommandKeyCombo): boolean {
  const comboKeys = Array.isArray(combo.key) ? combo.key : [combo.key];
  const keyMatches = comboKeys.some((comboKey) => {
    return e.key.toLowerCase() === comboKey.toLowerCase();
  });
  if (!keyMatches) return false;

  const primaryKey = e.ctrlKey || e.metaKey;
  if (combo.ctrlKey !== undefined && primaryKey !== combo.ctrlKey) {
    return false;
  }
  if (combo.altKey !== undefined && e.altKey !== combo.altKey) {
    return false;
  }
  if (combo.shiftKey !== undefined && e.shiftKey !== combo.shiftKey) {
    return false;
  }
  return true;
}
