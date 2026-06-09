import m from "mithril";
import { state } from "./state.ts";
import type { EditorTool } from "../components/desktop/pixel-editor-tools.ts";
import { showToast } from "./notifications.ts";
import { recordRecentCommand } from "./command-history.ts";
import { getAppCommands } from "./commands/app-commands.ts";
import { getFileCommands } from "./commands/file-commands.ts";
import { getViewCommands } from "./commands/view-commands.ts";
import { getEditorCommands } from "./commands/editor-commands.ts";
import {
  initShortcutPreferences,
  getShortcut,
  setShortcut as setShortcutPreference,
  getConflicts as getShortcutConflicts,
  resetShortcuts as resetShortcutPreferences,
  clearShortcut,
} from "./shortcut-preferences.ts";

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
    if (shouldRecordCommand(cmd.id)) {
      recordRecentCommand(cmd.id);
    }
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

export function setCommandShortcut(
  commandId: string,
  keyCombo: CommandKeyCombo | null,
): boolean {
  if (!keyCombo) {
    clearShortcut(commandId);
    restoreDefaultShortcut(commandId);
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
    restoreDefaultShortcut(cmd.id);
  }
}

export function initDefaultCommands(): void {
  defaultKeyCombos = {};

  const editorContext = {
    getEditorContext,
    hasActiveEditor,
    hasFullscreenEditor,
  };

  const defaultCommands = [
    ...getAppCommands(),
    ...getViewCommands(editorContext),
    ...getFileCommands(),
    ...getEditorCommands(editorContext),
  ];

  for (const cmd of defaultCommands) {
    registerDefaultCommand(cmd);
  }

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

function registerDefaultCommand(cmd: Command): void {
  if (cmd.keyCombo) {
    defaultKeyCombos[cmd.id] = cmd.keyCombo;
  }
  registerCommand(cmd);
}

function shouldRecordCommand(commandId: string): boolean {
  return !["app.commandPalette.toggle", "app.shortcuts.toggle"].includes(
    commandId,
  );
}

function restoreDefaultShortcut(commandId: string): void {
  const cmd = getCommand(commandId);
  if (!cmd) return;

  const def = defaultKeyCombos[commandId];
  if (def) {
    cmd.keyCombo = def;
    cmd.shortcut = formatShortcut(def);
  } else {
    cmd.keyCombo = undefined;
    cmd.shortcut = undefined;
  }
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
