import { type SavedSnapshot } from "../components/desktop/workflow-tools/types.ts";
import {
  applyStudioProjectSnapshot,
  createStudioProjectSnapshot,
} from "./studio-projects.ts";
import { triggerRender } from "../components/render-effect.ts";

let undoStack: SavedSnapshot[] = [];
let redoStack: SavedSnapshot[] = [];

export const characterUndoStore = {
  pushUndo(): void {
    const snapshot = createStudioProjectSnapshot();
    undoStack.push(snapshot);
    redoStack = [];
    if (undoStack.length > 25) {
      undoStack.shift();
    }
  },

  canUndo(): boolean {
    return undoStack.length > 0;
  },

  canRedo(): boolean {
    return redoStack.length > 0;
  },

  async undo(): Promise<void> {
    const snapshot = undoStack.pop();
    if (!snapshot) return;
    redoStack.push(createStudioProjectSnapshot());
    applyStudioProjectSnapshot(snapshot);
    await triggerRender();
  },

  async redo(): Promise<void> {
    const snapshot = redoStack.pop();
    if (!snapshot) return;
    undoStack.push(createStudioProjectSnapshot());
    applyStudioProjectSnapshot(snapshot);
    await triggerRender();
  },

  getUndoStack(): SavedSnapshot[] {
    return undoStack;
  },

  getRedoStack(): SavedSnapshot[] {
    return redoStack;
  },

  clear(): void {
    undoStack = [];
    redoStack = [];
  },
};
