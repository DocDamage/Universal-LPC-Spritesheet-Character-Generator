import m from "mithril";
import { state } from "../../state/state.ts";
import {
  getCommands,
  setCommandShortcut,
  getAllShortcutConflicts,
  resetAllShortcuts,
  type CommandKeyCombo,
} from "../../state/commands.ts";

function renderShortcut(shortcut: string): m.Children {
  return shortcut.split(" / ").map((combo, comboIndex) => [
    comboIndex > 0 ? m("span.shortcut-combo-separator", "or") : null,
    m(
      "span.shortcut-combo",
      combo
        .split("+")
        .map((key, keyIndex) => [
          keyIndex > 0 ? m("span.shortcut-key-separator", "+") : null,
          m("kbd", key.trim()),
        ]),
    ),
  ]);
}

function formatKeyComboFromEvent(e: KeyboardEvent): CommandKeyCombo | null {
  if (["Control", "Alt", "Shift", "Meta"].includes(e.key)) return null;
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  return {
    key,
    ctrlKey: e.ctrlKey || e.metaKey || undefined,
    altKey: e.altKey || undefined,
    shiftKey: e.shiftKey || undefined,
  };
}

function formatComboString(combo: CommandKeyCombo): string {
  const parts: string[] = [];
  if (combo.ctrlKey) parts.push("Ctrl");
  if (combo.altKey) parts.push("Alt");
  if (combo.shiftKey) parts.push("Shift");
  const key =
    typeof combo.key === "string"
      ? combo.key
      : (combo.key as string[]).join("/");
  parts.push(key);
  return parts.join("+");
}

type ShortcutHelpModalState = {
  editingCommandId: string | null;
  editError: string;
  isEditMode: boolean;
};

export const ShortcutHelpModal: m.Component<
  Record<string, never>,
  ShortcutHelpModalState
> = {
  oninit(vnode) {
    vnode.state.editingCommandId = null;
    vnode.state.editError = "";
    vnode.state.isEditMode = false;
  },

  view(vnode) {
    if (!state.showShortcutHelp) return null;

    const commandsWithShortcuts = getCommands().filter((cmd) => cmd.shortcut);
    const categories: Record<string, typeof commandsWithShortcuts> = {};
    for (const cmd of commandsWithShortcuts) {
      if (!categories[cmd.category]) {
        categories[cmd.category] = [];
      }
      categories[cmd.category].push(cmd);
    }

    const conflicts = getAllShortcutConflicts();
    const conflictSet = new Set<string>();
    for (const group of conflicts) {
      for (const id of group) conflictSet.add(id);
    }

    const handleClose = () => {
      state.showShortcutHelp = false;
      vnode.state.editingCommandId = null;
      vnode.state.editError = "";
      m.redraw();
    };

    const startEdit = (cmdId: string) => {
      vnode.state.editingCommandId = cmdId;
      vnode.state.editError = "";
    };

    const cancelEdit = () => {
      vnode.state.editingCommandId = null;
      vnode.state.editError = "";
    };

    const handleKeyDown = (e: KeyboardEvent, cmdId: string) => {
      e.preventDefault();
      e.stopPropagation();
      const combo = formatKeyComboFromEvent(e);
      if (!combo) return;
      if (e.key === "Escape") {
        cancelEdit();
        m.redraw();
        return;
      }
      const success = setCommandShortcut(cmdId, combo);
      if (success) {
        vnode.state.editingCommandId = null;
        vnode.state.editError = "";
      } else {
        vnode.state.editError = `Conflict: ${formatComboString(combo)} is already used`;
      }
      m.redraw();
    };

    const handleReset = () => {
      if (confirm("Reset all keyboard shortcuts to defaults?")) {
        resetAllShortcuts();
        vnode.state.editingCommandId = null;
        vnode.state.editError = "";
        m.redraw();
      }
    };

    const toggleEditMode = () => {
      vnode.state.isEditMode = !vnode.state.isEditMode;
      vnode.state.editingCommandId = null;
      vnode.state.editError = "";
    };

    return m("div.shortcut-help-overlay", { onclick: handleClose }, [
      m(
        "div.shortcut-help",
        {
          role: "dialog",
          "aria-modal": "true",
          "aria-label": "Keyboard shortcuts",
          onclick: (e: MouseEvent) => e.stopPropagation(),
        },
        [
          m("div.shortcut-help-header", [
            m("h3", [m("span.shortcut-help-icon", "⌘"), "Keyboard Shortcuts"]),
            m(
              "div",
              { style: { display: "flex", gap: "8px", alignItems: "center" } },
              [
                m(
                  "button.shortcut-help-edit-btn",
                  {
                    type: "button",
                    title: vnode.state.isEditMode
                      ? "Done editing"
                      : "Edit shortcuts",
                    onclick: toggleEditMode,
                  },
                  vnode.state.isEditMode ? "Done" : "Edit",
                ),
                m(
                  "button.shortcut-help-close",
                  {
                    type: "button",
                    title: "Close keyboard shortcuts",
                    onclick: handleClose,
                  },
                  "×",
                ),
              ],
            ),
          ]),
          m(
            "div.shortcut-help-body",
            Object.entries(categories).map(([cat, cmds]) => {
              return m("div.shortcut-category-block", [
                m("h4.shortcut-category-title", cat),
                m("div.shortcut-list", [
                  cmds.map((cmd) => {
                    const isEditing =
                      vnode.state.isEditMode &&
                      vnode.state.editingCommandId === cmd.id;
                    const hasConflict = conflictSet.has(cmd.id);
                    return m(
                      "div.shortcut-row",
                      {
                        class: hasConflict ? "is-conflict" : "",
                        onclick: () => {
                          if (vnode.state.isEditMode && !isEditing) {
                            startEdit(cmd.id);
                          }
                        },
                        style: vnode.state.isEditMode
                          ? { cursor: "pointer" }
                          : undefined,
                      },
                      [
                        m("span.shortcut-label", cmd.label),
                        isEditing
                          ? m("span.shortcut-edit-hint", [
                              m("input.shortcut-edit-input", {
                                type: "text",
                                value: "Press keys...",
                                readOnly: true,
                                onkeydown: (e: KeyboardEvent) =>
                                  handleKeyDown(e, cmd.id),
                                onblur: cancelEdit,
                              }),
                              vnode.state.editError
                                ? m(
                                    "span.shortcut-edit-error",
                                    vnode.state.editError,
                                  )
                                : null,
                            ])
                          : m("span.shortcut-keys", [
                              hasConflict && vnode.state.isEditMode
                                ? m("span.shortcut-conflict-badge", "!")
                                : null,
                              renderShortcut(cmd.shortcut!),
                              vnode.state.isEditMode
                                ? m("span.shortcut-edit-icon", "✎")
                                : null,
                            ]),
                      ],
                    );
                  }),
                ]),
              ]);
            }),
          ),
          m("div.shortcut-help-footer", [
            m("span", "Press Esc or click outside to close"),
            vnode.state.isEditMode
              ? m(
                  "button.shortcut-help-reset",
                  {
                    type: "button",
                    onclick: handleReset,
                  },
                  "Reset to defaults",
                )
              : null,
          ]),
        ],
      ),
    ]);
  },
};
