import m from "mithril";
import { state } from "../../state/state.ts";
import {
  registerEditorContext,
  unregisterEditorContext,
} from "../../state/commands.ts";
import { canUseFeature } from "../../state/feature-gates.ts";
import { clampEditorZoom } from "./part-editor/state.ts";

import type { PartEditorState } from "./part-editor/types.ts";
import { initializePartEditorState } from "./part-editor/state.ts";
import { loadPartEditorItemIfNeeded } from "./part-editor/load-item.ts";
import { handleEditorShortcut } from "./part-editor/keyboard.ts";
import { stopPlayback } from "./part-editor/animation.ts";
import { createCanvasInteractionHandlers } from "./part-editor/canvas-interactions.ts";

import {
  renderEmptyEditor,
  renderProRequiredEditor,
  renderLoadingEditor,
  renderEditorHeader,
  renderNameField,
  renderToolButtons,
  renderQuickPalette,
  renderAutoPropagate,
  renderSaveButton,
  renderCanvasArea,
} from "./part-editor/views/index.ts";
import {
  renderProPanel,
  renderStatusBar,
  renderRecoveryPrompt,
} from "./part-editor/panels.ts";

export { createPartEditorStateForTests } from "./part-editor/state.ts";

export type {
  PartEditorState,
  EditorLayer,
  EditorSnapshot,
  EditorContextSnapshot,
  OnionCanvases,
  SelectionRect,
  SelectionMoveState,
  SelectionClipboard,
  FrameOverride,
  ShapeTool,
  TransformOperation,
  RgbColor,
  EditorWheelZoomInput,
  EditorWheelZoomUpdate,
} from "./part-editor/types.ts";

export { getEditorWheelZoomUpdate } from "./part-editor/state.ts";

export const PartEditor: m.Component<Record<string, never>, PartEditorState> = {
  oninit(vnode) {
    initializePartEditorState(vnode.state);
  },

  oncreate(vnode) {
    registerEditorContext(vnode.state);
    vnode.state.keyboardHandler = (e: KeyboardEvent) => {
      handleEditorShortcut(e, vnode.state);
    };
    window.addEventListener("keydown", vnode.state.keyboardHandler);

    vnode.state.beforeunloadHandler = (e: BeforeUnloadEvent) => {
      if (vnode.state.unsavedChanges && vnode.state.baseItemId) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", vnode.state.beforeunloadHandler);
  },

  onremove(vnode) {
    unregisterEditorContext();
    if (vnode.state.keyboardHandler) {
      window.removeEventListener("keydown", vnode.state.keyboardHandler);
    }
    if (vnode.state.beforeunloadHandler) {
      window.removeEventListener(
        "beforeunload",
        vnode.state.beforeunloadHandler,
      );
    }
    stopPlayback(vnode.state);
    if (vnode.state.autosaveDebounceTimer) {
      window.clearTimeout(vnode.state.autosaveDebounceTimer);
    }
    if (vnode.state.recomposeDebounceTimer) {
      window.clearTimeout(vnode.state.recomposeDebounceTimer);
    }
  },

  view(vnode) {
    const editing = state.editingPart;
    if (!editing) {
      return renderEmptyEditor();
    }

    if (!canUseFeature("advanced-editor")) {
      return renderProRequiredEditor();
    }

    loadPartEditorItemIfNeeded(vnode.state, editing);

    if (vnode.state.loading) {
      return renderLoadingEditor();
    }

    const setZoom = (zoom: number) => {
      vnode.state.zoom = clampEditorZoom(zoom);
    };

    const canvasHandlers = createCanvasInteractionHandlers({
      editorState: vnode.state,
      setZoom,
    });

    return m(
      "div.part-editor",
      {
        class: [
          vnode.state.isFullscreen ? "part-editor-fullscreen" : "",
          vnode.state.isTouchDevice ? "part-editor-mobile" : "",
        ]
          .filter(Boolean)
          .join(" "),
      },
      [
        vnode.state.showRecoveryPrompt
          ? renderRecoveryPrompt(vnode.state)
          : null,
        renderEditorHeader(vnode.state),
        m("div.part-editor-body", [
          m("div.part-editor-main-tools", [
            renderNameField(vnode.state),
            renderToolButtons(vnode.state),
            renderQuickPalette(vnode.state),
            renderAutoPropagate(vnode.state),
            renderCanvasArea(vnode.state, canvasHandlers),
            renderSaveButton(vnode.state),
          ]),
          vnode.state.isFullscreen ? renderProPanel(vnode.state) : null,
          renderStatusBar(vnode.state),
        ]),
      ],
    );
  },
};

export { partEditorTestApi } from "./part-editor/test-api.ts";
