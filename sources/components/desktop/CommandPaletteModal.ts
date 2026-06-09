import m from "mithril";
import { state } from "../../state/state.ts";
import { executeCommand, getCommands } from "../../state/commands.ts";

type CommandPaletteState = {
  searchQuery: string;
  selectedIndex: number;
  wasOpen: boolean;
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
    const filtered = getCommands().filter((cmd) => {
      if (!cmd.action) return false;
      const isEnabled = cmd.enabled ? cmd.enabled() : true;
      if (!isEnabled) return false;
      return (
        cmd.label.toLowerCase().includes(query) ||
        cmd.category.toLowerCase().includes(query)
      );
    });

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
        const selected = filtered[vnode.state.selectedIndex];
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
                  "No commands match your query.",
                )
              : filtered.map((cmd, index) => {
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
                        m("span.command-palette-item-label", cmd.label),
                      ]),
                      cmd.shortcut
                        ? m("span.command-palette-item-shortcut", cmd.shortcut)
                        : null,
                    ],
                  );
                }),
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
