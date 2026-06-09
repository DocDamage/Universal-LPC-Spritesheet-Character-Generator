import type { CatalogReader } from "../../../state/catalog.ts";
import {
  createStudioProjectSnapshot,
  type StudioProjectStatus,
} from "../../../state/studio-projects.ts";

export type WorkflowToolsAttrs = {
  catalog: CatalogReader;
};

export type SavedSnapshot = ReturnType<typeof createStudioProjectSnapshot>;

export type WorkflowToolsState = {
  undoStack: SavedSnapshot[];
  redoStack: SavedSnapshot[];
  favorites: string[];
  paletteName: string;
  namingTemplate: string;
  alignmentPreset: string;
  styleGuide: string;
  bulkStatus: StudioProjectStatus;
};
