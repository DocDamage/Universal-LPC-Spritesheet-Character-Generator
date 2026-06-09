import {
  listStudioProjects,
  updateStudioProjectMetadata,
  type StudioProject,
  type StudioProjectMetadata,
} from "../../../state/studio-projects.ts";
import type { StudioMetadataPatch, StudioPanelState } from "./types.ts";

export function refreshProjects(vnodeState: StudioPanelState): void {
  vnodeState.projects = listStudioProjects();
}

export function parseTags(tags: string): string[] {
  return tags
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export function safeFileName(name: string): string {
  const cleaned = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || "project";
}

export async function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("Read failed"));
    reader.readAsText(file);
  });
}

export function selectedProjects(
  projects: StudioProject[],
  activeCollection: string,
): StudioProject[] {
  if (!activeCollection) return projects;
  return projects.filter(
    (project) => project.metadata.collection === activeCollection,
  );
}

export function uniqueCollections(projects: StudioProject[]): string[] {
  return Array.from(
    new Set(
      projects
        .map((project) => project.metadata.collection)
        .filter((collection) => collection.length > 0),
    ),
  ).sort((a, b) => a.localeCompare(b));
}

export function metadataFromInputs(
  vnodeState: StudioPanelState,
): Partial<StudioProjectMetadata> {
  return {
    collection: vnodeState.collection.trim(),
    role: vnodeState.role.trim(),
    tags: parseTags(vnodeState.tags),
    notes: vnodeState.notes.trim(),
  };
}

export function updateProjectField(
  vnodeState: StudioPanelState,
  project: StudioProject,
  patch: StudioMetadataPatch,
): void {
  updateStudioProjectMetadata(project.id, patch);
  refreshProjects(vnodeState);
}
