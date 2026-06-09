import {
  clampBrushSize,
  type EditorTool,
} from "../../components/desktop/pixel-editor-tools.ts";
import type { Command, EditorCommandContext } from "../commands.ts";

export type EditorCommandsContext = {
  getEditorContext: () => EditorCommandContext | null;
  hasActiveEditor: () => boolean;
  hasFullscreenEditor: () => boolean;
};

export function getEditorCommands(context: EditorCommandsContext): Command[] {
  return [
    {
      id: "editor.fullscreen.toggle",
      label: "Toggle Fullscreen Editor",
      category: "Editor",
      shortcut: "F",
      keyCombo: { key: "f" },
      enabled: context.hasActiveEditor,
      action: () => {
        const editorContext = context.getEditorContext();
        if (editorContext) {
          editorContext.isFullscreen = !editorContext.isFullscreen;
        }
      },
    },
    {
      id: "editor.tab.edit",
      label: "Show Editor Tools Tab",
      category: "Editor",
      shortcut: "1",
      keyCombo: { key: "1" },
      enabled: context.hasFullscreenEditor,
      action: () => setEditorTab(context, "edit"),
    },
    {
      id: "editor.tab.animation",
      label: "Show Animation Tab",
      category: "Editor",
      shortcut: "2",
      keyCombo: { key: "2" },
      enabled: context.hasFullscreenEditor,
      action: () => setEditorTab(context, "animation"),
    },
    ...getEditorToolCommands(context),
    {
      id: "editor.brush.smaller",
      label: "Decrease Brush Size",
      category: "Editor",
      shortcut: "[",
      keyCombo: { key: "[" },
      enabled: context.hasActiveEditor,
      action: () => {
        const editorContext = context.getEditorContext();
        if (editorContext) {
          editorContext.brushSize = clampBrushSize(editorContext.brushSize - 1);
        }
      },
    },
    {
      id: "editor.brush.larger",
      label: "Increase Brush Size",
      category: "Editor",
      shortcut: "]",
      keyCombo: { key: "]" },
      enabled: context.hasActiveEditor,
      action: () => {
        const editorContext = context.getEditorContext();
        if (editorContext) {
          editorContext.brushSize = clampBrushSize(editorContext.brushSize + 1);
        }
      },
    },
    {
      id: "editor.mirrorX.toggle",
      label: "Toggle Horizontal Mirror",
      category: "Editor",
      shortcut: "X",
      keyCombo: { key: "x" },
      enabled: context.hasFullscreenEditor,
      action: () => {
        const editorContext = context.getEditorContext();
        if (editorContext) {
          editorContext.mirrorX = !editorContext.mirrorX;
        }
      },
    },
    {
      id: "editor.mirrorY.toggle",
      label: "Toggle Vertical Mirror",
      category: "Editor",
      shortcut: "Y",
      keyCombo: { key: "y" },
      enabled: context.hasFullscreenEditor,
      action: () => {
        const editorContext = context.getEditorContext();
        if (editorContext) {
          editorContext.mirrorY = !editorContext.mirrorY;
        }
      },
    },
    ...getEditorOperationCommands(),
  ];
}

function getEditorToolCommands(context: EditorCommandsContext): Command[] {
  return [
    {
      id: "editor.tool.pen",
      label: "Select Pencil Tool",
      category: "Editor Tools",
      shortcut: "B/P",
      keyCombo: { key: ["b", "p"] },
      enabled: context.hasActiveEditor,
      action: () => selectEditorTool(context, "pen"),
    },
    {
      id: "editor.tool.eraser",
      label: "Select Eraser Tool",
      category: "Editor Tools",
      shortcut: "E",
      keyCombo: { key: "e" },
      enabled: context.hasActiveEditor,
      action: () => selectEditorTool(context, "eraser"),
    },
    {
      id: "editor.tool.picker",
      label: "Select Color Picker",
      category: "Editor Tools",
      shortcut: "I",
      keyCombo: { key: "i" },
      enabled: context.hasActiveEditor,
      action: () => selectEditorTool(context, "picker"),
    },
    {
      id: "editor.tool.select",
      label: "Select Marquee Selection",
      category: "Editor Tools",
      shortcut: "M",
      keyCombo: { key: "m" },
      enabled: context.hasFullscreenEditor,
      action: () => selectEditorTool(context, "select"),
    },
    {
      id: "editor.tool.line",
      label: "Select Line Tool",
      category: "Editor Tools",
      shortcut: "L",
      keyCombo: { key: "l" },
      enabled: context.hasFullscreenEditor,
      action: () => selectEditorTool(context, "line"),
    },
    {
      id: "editor.tool.rect",
      label: "Select Rectangle Tool",
      category: "Editor Tools",
      shortcut: "R",
      keyCombo: { key: "r" },
      enabled: context.hasFullscreenEditor,
      action: () => selectEditorTool(context, "rect"),
    },
    {
      id: "editor.tool.ellipse",
      label: "Select Ellipse Tool",
      category: "Editor Tools",
      shortcut: "O",
      keyCombo: { key: "o" },
      enabled: context.hasFullscreenEditor,
      action: () => selectEditorTool(context, "ellipse"),
    },
    {
      id: "editor.tool.fill",
      label: "Select Fill Tool",
      category: "Editor Tools",
      shortcut: "G",
      keyCombo: { key: "g" },
      enabled: context.hasFullscreenEditor,
      action: () => selectEditorTool(context, "fill"),
    },
  ];
}

function getEditorOperationCommands(): Command[] {
  return [
    {
      id: "editor.undo",
      label: "Undo Edit",
      category: "Editor",
      shortcut: "Ctrl+Z",
      keyCombo: { key: "z", ctrlKey: true },
    },
    {
      id: "editor.redo",
      label: "Redo Edit",
      category: "Editor",
      shortcut: "Ctrl+Y / Ctrl+Shift+Z",
      keyCombo: { key: "y", ctrlKey: true, shiftKey: true },
    },
    {
      id: "editor.layer.new",
      label: "Add Layer",
      category: "Editor Layers",
      shortcut: "Ctrl+Shift+N",
      keyCombo: { key: "n", ctrlKey: true, shiftKey: true },
    },
    {
      id: "editor.layer.duplicate",
      label: "Duplicate Layer",
      category: "Editor Layers",
      shortcut: "Ctrl+J",
      keyCombo: { key: "j", ctrlKey: true },
    },
    {
      id: "editor.layer.mergeDown",
      label: "Merge Layer Down",
      category: "Editor Layers",
      shortcut: "Ctrl+E",
      keyCombo: { key: "e", ctrlKey: true },
    },
    {
      id: "editor.layer.flatten",
      label: "Flatten Visible Layers",
      category: "Editor Layers",
      shortcut: "Ctrl+Shift+E",
      keyCombo: { key: "e", ctrlKey: true, shiftKey: true },
    },
    {
      id: "editor.layer.pixelLock",
      label: "Toggle Layer Pixel Lock",
      category: "Editor Layers",
      shortcut: "/",
      keyCombo: { key: "/" },
    },
    {
      id: "editor.layer.alphaLock",
      label: "Toggle Layer Alpha Lock",
      category: "Editor Layers",
      shortcut: "?",
      keyCombo: { key: "?" },
    },
    {
      id: "editor.frame.previous",
      label: "Previous Animation Frame",
      category: "Animation",
      shortcut: ",",
      keyCombo: { key: "," },
    },
    {
      id: "editor.frame.next",
      label: "Next Animation Frame",
      category: "Animation",
      shortcut: ".",
      keyCombo: { key: "." },
    },
  ];
}

function selectEditorTool(
  context: EditorCommandsContext,
  tool: EditorTool,
): void {
  const editorContext = context.getEditorContext();
  if (editorContext) {
    editorContext.tool = tool;
  }
}

function setEditorTab(
  context: EditorCommandsContext,
  tab: EditorCommandContext["activeEditorTab"],
): void {
  const editorContext = context.getEditorContext();
  if (editorContext) {
    editorContext.activeEditorTab = tab;
  }
}
