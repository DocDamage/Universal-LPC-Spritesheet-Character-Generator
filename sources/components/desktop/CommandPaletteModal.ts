import m from "mithril";
import { state } from "../../state/state.ts";
import { executeCommand, getCommands } from "../../state/commands.ts";
import type { Command } from "../../state/commands.ts";
import { getRecentCommandIds } from "../../state/command-history.ts";

type CommandPaletteState = {
  searchQuery: string;
  selectedIndex: number;
  wasOpen: boolean;
};

type RankedCommand = {
  command: Command;
  score: number;
  isRecent: boolean;
};

export const CommandPaletteModal: m.Component<
  Record<string, never>,
  CommandPaletteState
> = {
  oninit(vnode) {
    vnode.state.searchQuery = "";
    vnode.state.selectedIndex = 0;
    vnode.state.wasOpen = false;
  },

  view(vnode) {
    if (!state.showCommandPalette) {
      vnode.state.wasOpen = false;
      return null;
    }

    if (!vnode.state.wasOpen) {
      vnode.state.wasOpen = true;
      vnode.state.searchQuery = "";
      vnode.state.selectedIndex = 0;
    }

    const query = vnode.state.searchQuery.toLowerCase().trim();
    const filtered = buildCommandResults(query);

    // Clamp selected index to bounds
    if (vnode.state.selectedIndex >= filtered.length) {
      vnode.state.selectedIndex = Math.max(0, filtered.length - 1);
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        vnode.state.selectedIndex =
          filtered.length === 0
            ? 0
            : (vnode.state.selectedIndex + 1) % filtered.length;
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        vnode.state.selectedIndex =
          filtered.length === 0
            ? 0
            : (vnode.state.selectedIndex - 1 + filtered.length) %
              filtered.length;
      } else if (e.key === "Enter") {
        e.preventDefault();
        const selected = filtered[vnode.state.selectedIndex]?.command;
        if (selected?.action) {
          state.showCommandPalette = false;
          executeCommand(selected.id);
          m.redraw();
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        state.showCommandPalette = false;
        m.redraw();
      }
    };

    const handleOverlayClick = () => {
      state.showCommandPalette = false;
      m.redraw();
    };

    return m("div.command-palette-overlay", { onclick: handleOverlayClick }, [
      m(
        "div.command-palette",
        {
          role: "dialog",
          "aria-modal": "true",
          "aria-label": "Command palette",
          onclick: (e: MouseEvent) => e.stopPropagation(),
          onkeydown: handleKeyDown,
        },
        [
          m("div.command-palette-search-wrapper", [
            m("span.command-palette-search-icon", "⌕"),
            m("input.command-palette-input", {
              type: "text",
              placeholder: "Type a command to search...",
              value: vnode.state.searchQuery,
              oninput: (e: Event) => {
                vnode.state.searchQuery = (e.target as HTMLInputElement).value;
                vnode.state.selectedIndex = 0;
              },
              oncreate: (inputVnode: m.VnodeDOM) => {
                (inputVnode.dom as HTMLInputElement).focus();
              },
            }),
          ]),

          m(
            "div.command-palette-list",
            filtered.length === 0
              ? m(
                  "div.command-palette-no-results",
                  query
                    ? "No commands match your query."
                    : "Run a command and it will appear here next time.",
                )
              : [
                  query
                    ? null
                    : m(
                        "div.command-palette-section-label",
                        hasRecentResults(filtered)
                          ? "Recent commands"
                          : "Available commands",
                      ),
                  filtered.map((result, index) => {
                    const cmd = result.command;
                    const isSelected = index === vnode.state.selectedIndex;
                    return m(
                      "div.command-palette-item",
                      {
                        class: isSelected ? "selected" : "",
                        onmouseenter: () => {
                          vnode.state.selectedIndex = index;
                        },
                        onclick: () => {
                          state.showCommandPalette = false;
                          executeCommand(cmd.id);
                          m.redraw();
                        },
                      },
                      [
                        m("div.command-palette-item-info", [
                          m("span.command-palette-item-category", cmd.category),
                          m("span.command-palette-item-label", [
                            cmd.label,
                            result.isRecent
                              ? m("span.command-palette-recent", "Recent")
                              : null,
                          ]),
                        ]),
                        cmd.shortcut
                          ? m(
                              "span.command-palette-item-shortcut",
                              cmd.shortcut,
                            )
                          : null,
                      ],
                    );
                  }),
                ],
          ),

          m("div.command-palette-footer", [
            m("span", [
              m("kbd", "↑↓"),
              " to navigate, ",
              m("kbd", "Enter"),
              " to execute, ",
              m("kbd", "Esc"),
              " to close",
            ]),
          ]),
        ],
      ),
    ]);
  },
};

function buildCommandResults(query: string): RankedCommand[] {
  const enabledCommands = getCommands().filter((cmd) => {
    return Boolean(cmd.action) && (cmd.enabled ? cmd.enabled() : true);
  });

  const recentIds = getRecentCommandIds();
  const recentRank = new Map(recentIds.map((id, index) => [id, index]));

  if (!query) {
    const recentCommands = recentIds
      .map((id) => enabledCommands.find((cmd) => cmd.id === id))
      .filter((cmd): cmd is Command => Boolean(cmd));

    const fallback = enabledCommands.slice(0, 12);
    const commandsToShow =
      recentCommands.length > 0 ? recentCommands : fallback;

    return commandsToShow.map((command, index) => ({
      command,
      score: index,
      isRecent: recentRank.has(command.id),
    }));
  }

  return enabledCommands
    .map((command) => ({
      command,
      score: scoreCommand(command, query, recentRank.get(command.id)),
      isRecent: recentRank.has(command.id),
    }))
    .filter((result) => result.score < Number.POSITIVE_INFINITY)
    .sort(
      (a, b) =>
        a.score - b.score || a.command.label.localeCompare(b.command.label),
    )
    .slice(0, 30);
}

function scoreCommand(
  command: Command,
  query: string,
  recentIndex: number | undefined,
): number {
  const label = command.label.toLowerCase();
  const category = command.category.toLowerCase();
  const haystack = `${label} ${category} ${command.id.toLowerCase()}`;
  const recentBoost = recentIndex === undefined ? 0 : -10 + recentIndex;

  if (label === query) return recentBoost;
  if (label.startsWith(query)) return 10 + recentBoost;
  if (category.startsWith(query)) return 20 + recentBoost;
  if (label.includes(query)) return 30 + label.indexOf(query) + recentBoost;
  if (haystack.includes(query))
    return 50 + haystack.indexOf(query) + recentBoost;

  const fuzzyScore = scoreFuzzy(haystack, query);
  return fuzzyScore === null
    ? Number.POSITIVE_INFINITY
    : 80 + fuzzyScore + recentBoost;
}

function scoreFuzzy(haystack: string, query: string): number | null {
  let lastIndex = -1;
  let score = 0;

  for (const char of query) {
    const index = haystack.indexOf(char, lastIndex + 1);
    if (index === -1) return null;
    score += index - lastIndex;
    lastIndex = index;
  }

  return score;
}

function hasRecentResults(results: readonly RankedCommand[]): boolean {
  return results.some((result) => result.isRecent);
}
