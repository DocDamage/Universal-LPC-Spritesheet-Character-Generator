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
import { drawCalls } from "../canvas/renderer.ts";
import {
  clampBrushSize,
  type EditorTool,
} from "../components/desktop/pixel-editor-tools.ts";

const MIN_PREVIEW_ZOOM = 0.5;
const MAX_PREVIEW_ZOOM = 5;
const PREVIEW_ZOOM_STEP = 0.25;
const MIN_EDITOR_ZOOM = 2;
const MAX_EDITOR_ZOOM = 16;
const DEFAULT_EDITOR_ZOOM = 4;

type CommandKeyCombo = {
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
    cmd.action();
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

function hasActiveEditor(): boolean {
  return activeEditorContext !== null && state.editingPart !== null;
}

function hasFullscreenEditor(): boolean {
  return hasActiveEditor() && activeEditorContext?.isFullscreen === true;
}

function clampPreviewZoom(value: number): number {
  return Math.min(MAX_PREVIEW_ZOOM, Math.max(MIN_PREVIEW_ZOOM, value));
}

function clampEditorZoom(value: number): number {
  return Math.min(MAX_EDITOR_ZOOM, Math.max(MIN_EDITOR_ZOOM, value));
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

export function initDefaultCommands(): void {
  registerCommand({
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

  registerCommand({
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

  registerCommand({
    id: "view.zoom.in",
    label: "Zoom In",
    category: "View",
    shortcut: "Ctrl++",
    keyCombo: { key: ["=", "+"], ctrlKey: true },
    action: zoomIn,
  });

  registerCommand({
    id: "view.zoom.out",
    label: "Zoom Out",
    category: "View",
    shortcut: "Ctrl+-",
    keyCombo: { key: "-", ctrlKey: true },
    action: zoomOut,
  });

  registerCommand({
    id: "view.zoom.reset",
    label: "Reset Zoom",
    category: "View",
    shortcut: "Ctrl+0",
    keyCombo: { key: "0", ctrlKey: true },
    action: resetZoom,
  });

  registerCommand({
    id: "app.reset",
    label: "Reset All Selections",
    category: "Actions",
    shortcut: "Ctrl+Alt+R",
    keyCombo: { key: "r", ctrlKey: true, altKey: true },
    action: () => {
      if (confirm("Reset all selections to defaults?")) {
        void resetAll();
      }
    },
  });

  registerCommand({
    id: "app.randomize",
    label: "Randomize All Slots",
    category: "Actions",
    shortcut: "Ctrl+Alt+Shift+R",
    keyCombo: { key: "r", ctrlKey: true, altKey: true, shiftKey: true },
    action: () => {
      if (confirm("🎲 Randomize all character slots?")) {
        randomizeAll(defaultCatalog);
      }
    },
  });

  registerCommand({
    id: "app.load.clipboard",
    label: "Load Character from Clipboard",
    category: "File",
    tooltip: "Load character from clipboard JSON",
    action: async () => {
      if (!window.canvasRenderer) return;
      try {
        const json = await navigator.clipboard.readText();
        const imported = importStateFromJSON(json);
        Object.assign(state, imported);
        m.redraw();
        alert("Character loaded from clipboard.");
      } catch (err) {
        console.error("Failed to load:", err);
        alert("Failed to load. Check clipboard content.");
      }
    },
  });

  registerCommand({
    id: "app.save.clipboard",
    label: "Save Character to Clipboard",
    category: "File",
    tooltip: "Save character to clipboard as JSON",
    shortcut: "Ctrl+S",
    keyCombo: { key: "s", ctrlKey: true },
    action: async () => {
      if (!window.canvasRenderer) return;
      try {
        const json = exportStateAsJSON(
          state,
          serializeLayersForJson(drawCalls),
        );
        await navigator.clipboard.writeText(json);
        alert("Character saved to clipboard.");
      } catch (err) {
        console.error("Failed to save:", err);
        alert("Failed to save. Check browser permissions.");
      }
    },
  });

  registerCommand({
    id: "app.export.png",
    label: "Export PNG Spritesheet",
    category: "File",
    tooltip: "Export full spritesheet as PNG",
    shortcut: "Ctrl+Shift+E",
    keyCombo: { key: "e", ctrlKey: true, shiftKey: true },
    action: () => {
      if (!window.canvasRenderer) return;
      downloadAsPNG("character-spritesheet.png");
    },
  });

  registerCommand({
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

  registerCommand({
    id: "app.grid.toggle",
    label: "Toggle Transparency Grid",
    category: "View",
    tooltip: "Toggle the preview transparency grid",
    action: () => {
      state.showTransparencyGrid = !state.showTransparencyGrid;
    },
  });

  registerCommand({
    id: "app.shadows.toggle",
    label: "Toggle Cast Shadow",
    category: "View",
    tooltip: "Toggle cast shadow transparency mask",
    action: () => {
      state.applyTransparencyMask = !state.applyTransparencyMask;
    },
  });

  registerCommand({
    id: "app.tab.body",
    label: "Switch to Body Tab",
    category: "General",
    shortcut: "Ctrl+1",
    keyCombo: { key: "1", ctrlKey: true },
    action: () => {
      state.activeTab = "character";
    },
  });

  registerCommand({
    id: "app.tab.gear",
    label: "Switch to Gear Tab",
    category: "General",
    shortcut: "Ctrl+2",
    keyCombo: { key: "2", ctrlKey: true },
    action: () => {
      state.activeTab = "accessories";
    },
  });

  registerCommand({
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

  registerCommand({
    id: "editor.tab.edit",
    label: "Show Editor Tools Tab",
    category: "Editor",
    shortcut: "1",
    keyCombo: { key: "1" },
    enabled: hasFullscreenEditor,
    action: () => setEditorTab("edit"),
  });

  registerCommand({
    id: "editor.tab.animation",
    label: "Show Animation Tab",
    category: "Editor",
    shortcut: "2",
    keyCombo: { key: "2" },
    enabled: hasFullscreenEditor,
    action: () => setEditorTab("animation"),
  });

  registerCommand({
    id: "editor.tool.pen",
    label: "Select Pencil Tool",
    category: "Editor Tools",
    shortcut: "B/P",
    keyCombo: { key: ["b", "p"] },
    enabled: hasActiveEditor,
    action: () => selectEditorTool("pen"),
  });

  registerCommand({
    id: "editor.tool.eraser",
    label: "Select Eraser Tool",
    category: "Editor Tools",
    shortcut: "E",
    keyCombo: { key: "e" },
    enabled: hasActiveEditor,
    action: () => selectEditorTool("eraser"),
  });

  registerCommand({
    id: "editor.tool.picker",
    label: "Select Color Picker",
    category: "Editor Tools",
    shortcut: "I",
    keyCombo: { key: "i" },
    enabled: hasActiveEditor,
    action: () => selectEditorTool("picker"),
  });

  registerCommand({
    id: "editor.tool.select",
    label: "Select Marquee Selection",
    category: "Editor Tools",
    shortcut: "M",
    keyCombo: { key: "m" },
    enabled: hasFullscreenEditor,
    action: () => selectEditorTool("select"),
  });

  registerCommand({
    id: "editor.tool.line",
    label: "Select Line Tool",
    category: "Editor Tools",
    shortcut: "L",
    keyCombo: { key: "l" },
    enabled: hasFullscreenEditor,
    action: () => selectEditorTool("line"),
  });

  registerCommand({
    id: "editor.tool.rect",
    label: "Select Rectangle Tool",
    category: "Editor Tools",
    shortcut: "R",
    keyCombo: { key: "r" },
    enabled: hasFullscreenEditor,
    action: () => selectEditorTool("rect"),
  });

  registerCommand({
    id: "editor.tool.ellipse",
    label: "Select Ellipse Tool",
    category: "Editor Tools",
    shortcut: "O",
    keyCombo: { key: "o" },
    enabled: hasFullscreenEditor,
    action: () => selectEditorTool("ellipse"),
  });

  registerCommand({
    id: "editor.tool.fill",
    label: "Select Fill Tool",
    category: "Editor Tools",
    shortcut: "G",
    keyCombo: { key: "g" },
    enabled: hasFullscreenEditor,
    action: () => selectEditorTool("fill"),
  });

  registerCommand({
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

  registerCommand({
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

  registerCommand({
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

  registerCommand({
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

  registerCommand({
    id: "editor.undo",
    label: "Undo Edit",
    category: "Editor",
    shortcut: "Ctrl+Z",
  });

  registerCommand({
    id: "editor.redo",
    label: "Redo Edit",
    category: "Editor",
    shortcut: "Ctrl+Y / Ctrl+Shift+Z",
  });

  registerCommand({
    id: "editor.layer.new",
    label: "Add Layer",
    category: "Editor Layers",
    shortcut: "Ctrl+Shift+N",
  });

  registerCommand({
    id: "editor.layer.duplicate",
    label: "Duplicate Layer",
    category: "Editor Layers",
    shortcut: "Ctrl+J",
  });

  registerCommand({
    id: "editor.layer.mergeDown",
    label: "Merge Layer Down",
    category: "Editor Layers",
    shortcut: "Ctrl+E",
  });

  registerCommand({
    id: "editor.layer.flatten",
    label: "Flatten Visible Layers",
    category: "Editor Layers",
    shortcut: "Ctrl+Shift+E",
  });

  registerCommand({
    id: "editor.layer.pixelLock",
    label: "Toggle Layer Pixel Lock",
    category: "Editor Layers",
    shortcut: "/",
  });

  registerCommand({
    id: "editor.layer.alphaLock",
    label: "Toggle Layer Alpha Lock",
    category: "Editor Layers",
    shortcut: "?",
  });

  registerCommand({
    id: "editor.frame.previous",
    label: "Previous Animation Frame",
    category: "Animation",
    shortcut: ",",
  });

  registerCommand({
    id: "editor.frame.next",
    label: "Next Animation Frame",
    category: "Animation",
    shortcut: ".",
  });
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
      cmd.action();
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
