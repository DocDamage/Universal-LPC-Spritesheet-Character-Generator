const COMMAND_HISTORY_STORAGE_KEY = "lpc-command-history";
const MAX_RECENT_COMMANDS = 8;

function getStorage(): Storage | null {
  if (typeof window === "undefined") return null;

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function getRecentCommandIds(): string[] {
  const raw = getStorage()?.getItem(COMMAND_HISTORY_STORAGE_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string")
      : [];
  } catch {
    return [];
  }
}

export function recordRecentCommand(commandId: string): void {
  const storage = getStorage();
  if (!storage) return;

  const recent = [
    commandId,
    ...getRecentCommandIds().filter((id) => id !== commandId),
  ].slice(0, MAX_RECENT_COMMANDS);
  storage.setItem(COMMAND_HISTORY_STORAGE_KEY, JSON.stringify(recent));
}

export function clearRecentCommands(): void {
  getStorage()?.removeItem(COMMAND_HISTORY_STORAGE_KEY);
}
