import type {
  StudioProject,
  StudioProjectMetadata,
} from "../../../state/studio-projects.ts";

export type StudioPanelState = {
  projects: StudioProject[];
  projectName: string;
  collection: string;
  role: string;
  tags: string;
  notes: string;
  activeCollection: string;
  selectedProjectId: string | null;
  isExporting: boolean;
};

export type StudioMetadataPatch = Partial<StudioProjectMetadata> & {
  name?: string;
};
