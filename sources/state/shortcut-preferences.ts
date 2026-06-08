import { debugWarn } from "../utils/debug.ts";
import type { CommandKeyCombo } from "./commands.ts";

const SHORTCUTS_STORAGE_KEY = "lpc.shortcuts.v1";

type ShortcutsPayload = {
  version: 1;
  overrides: Record<string, string>;
};

let overrides: Record<string, string> = {};
let defaults: Record<string, CommandKeyCombo> = {};

function loadFromStorage(): Record<string, string> {
  try {
    const raw = localStorage.getItem(SHORTCUTS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Partial<ShortcutsPayload>;
    if (parsed.version !== 1 || !parsed.overrides) return {};
    return parsed.overrides;
  } catch (err) {
    debugWarn("Unable to load shortcut preferences:", err);
    return {};
  }
}

function saveToStorage(): void {
  try {
    const payload: ShortcutsPayload = {
      version: 1,
      overrides,
    };
    localStorage.setItem(SHORTCUTS_STORAGE_KEY, JSON.stringify(payload));
  } catch (err) {
    debugWarn("Unable to save shortcut preferences:", err);
  }
}

export function initShortcutPreferences(
  defaultCombos: Record<string, CommandKeyCombo>,
): void {
  defaults = { ...defaultCombos };
  overrides = loadFromStorage();
}

export function getShortcut(commandId: string): CommandKeyCombo | null {
  const override = overrides[commandId];
  if (override) {
    return parseKeyCombo(override);
  }
  const def = defaults[commandId];
  return def ?? null;
}

export function setShortcut(
  commandId: string,
  keyCombo: CommandKeyCombo,
): boolean {
  const comboString = stringifyKeyCombo(keyCombo);
  const conflicts = findConflicts(comboString, commandId);
  if (conflicts.length > 0) {
    return false;
  }
  overrides[commandId] = comboString;
  saveToStorage();
  return true;
}

export function clearShortcut(commandId: string): void {
  delete overrides[commandId];
  saveToStorage();
}

export function getConflicts(): string[][] {
  const comboToCommands: Record<string, string[]> = {};
  for (const [cmdId, comboStr] of Object.entries(overrides)) {
    (comboToCommands[comboStr] ??= []).push(cmdId);
  }
  return Object.values(comboToCommands).filter((ids) => ids.length > 1);
}

export function resetShortcuts(): void {
  overrides = {};
  saveToStorage();
}

export function getAllOverrides(): Record<string, string> {
  return { ...overrides };
}

function findConflicts(comboString: string, excludeCommandId: string): string[] {
  const conflicts: string[] = [];
  for (const [cmdId, existing] of Object.entries(overrides)) {
    if (cmdId !== excludeCommandId && existing === comboString) {
      conflicts.push(cmdId);
    }
  }
  return conflicts;
}

function stringifyKeyCombo(combo: CommandKeyCombo): string {
  const parts: string[] = [];
  if (combo.ctrlKey) parts.push("Ctrl");
  if (combo.altKey) parts.push("Alt");
  if (combo.shiftKey) parts.push("Shift");
  const key = typeof combo.key === "string" ? combo.key : (combo.key as string[]).join("/");
  parts.push(key);
  return parts.join("+");
}

function parseKeyCombo(str: string): CommandKeyCombo {
  const parts = str.split("+");
  const keyPart = parts.pop()!;
  const key = keyPart.includes("/") ? keyPart.split("/") : keyPart;
  return {
    key,
    ctrlKey: parts.includes("Ctrl") || undefined,
    altKey: parts.includes("Alt") || undefined,
    shiftKey: parts.includes("Shift") || undefined,
  };
}
