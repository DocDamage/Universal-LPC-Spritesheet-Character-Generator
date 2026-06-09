import type { Selections, State } from "./app-state.ts";
import { state } from "./state.ts";

const STORAGE_KEY = "lpc-studio-project-library";
const LIBRARY_VERSION = 1;

export type StudioProjectSnapshot = {
  bodyType: string;
  selections: Selections;
  selectedAnimation: string;
  showTransparencyGrid: boolean;
  applyTransparencyMask: boolean;
  matchBodyColorEnabled: boolean;
  compactDisplay: boolean;
  enabledLicenses: Record<string, boolean>;
  enabledAnimations: Record<string, boolean>;
};

export type StudioProject = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  snapshot: StudioProjectSnapshot;
};

type StudioProjectLibrary = {
  version: number;
  exportedAt?: string;
  projects: StudioProject[];
};

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function getStorage(): Storage | null {
  if (typeof window === "undefined") return null;

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function createProjectId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `studio-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function readLibrary(): StudioProjectLibrary {
  const storage = getStorage();
  if (!storage) return { version: LIBRARY_VERSION, projects: [] };

  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) return { version: LIBRARY_VERSION, projects: [] };

  try {
    const parsed = JSON.parse(raw) as Partial<StudioProjectLibrary>;
    if (!Array.isArray(parsed.projects)) {
      return { version: LIBRARY_VERSION, projects: [] };
    }
    return {
      version: parsed.version ?? LIBRARY_VERSION,
      projects: parsed.projects.filter(isStudioProject),
    };
  } catch {
    return { version: LIBRARY_VERSION, projects: [] };
  }
}

function writeLibrary(library: StudioProjectLibrary): void {
  const storage = getStorage();
  if (!storage) return;
  storage.setItem(STORAGE_KEY, JSON.stringify(library));
}

function isStudioProject(value: unknown): value is StudioProject {
  const project = value as Partial<StudioProject>;
  return (
    typeof project?.id === "string" &&
    typeof project.name === "string" &&
    typeof project.createdAt === "string" &&
    typeof project.updatedAt === "string" &&
    typeof project.snapshot?.bodyType === "string" &&
    typeof project.snapshot?.selections === "object"
  );
}

export function createStudioProjectSnapshot(
  source: State = state,
): StudioProjectSnapshot {
  return {
    bodyType: source.bodyType,
    selections: cloneJson(source.selections),
    selectedAnimation: source.selectedAnimation,
    showTransparencyGrid: source.showTransparencyGrid,
    applyTransparencyMask: source.applyTransparencyMask,
    matchBodyColorEnabled: source.matchBodyColorEnabled,
    compactDisplay: source.compactDisplay,
    enabledLicenses: cloneJson(source.enabledLicenses),
    enabledAnimations: cloneJson(source.enabledAnimations),
  };
}

export function applyStudioProjectSnapshot(
  snapshot: StudioProjectSnapshot,
  target: State = state,
): void {
  target.bodyType = snapshot.bodyType;
  target.selections = cloneJson(snapshot.selections);
  target.selectedAnimation = snapshot.selectedAnimation;
  target.showTransparencyGrid = snapshot.showTransparencyGrid;
  target.applyTransparencyMask = snapshot.applyTransparencyMask;
  target.matchBodyColorEnabled = snapshot.matchBodyColorEnabled;
  target.compactDisplay = snapshot.compactDisplay;
  target.enabledLicenses = cloneJson(snapshot.enabledLicenses);
  target.enabledAnimations = cloneJson(snapshot.enabledAnimations);
  target.editingPart = null;
}

export function listStudioProjects(): StudioProject[] {
  return readLibrary().projects.sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  );
}

export function saveStudioProject(
  name: string,
  source: State = state,
): StudioProject {
  const trimmedName = name.trim() || "Untitled project";
  const now = new Date().toISOString();
  const library = readLibrary();
  const project: StudioProject = {
    id: createProjectId(),
    name: trimmedName,
    createdAt: now,
    updatedAt: now,
    snapshot: createStudioProjectSnapshot(source),
  };

  library.projects.push(project);
  writeLibrary(library);
  return project;
}

export function updateStudioProject(
  id: string,
  source: State = state,
): StudioProject | null {
  const library = readLibrary();
  const index = library.projects.findIndex((project) => project.id === id);
  if (index === -1) return null;

  const updated: StudioProject = {
    ...library.projects[index]!,
    updatedAt: new Date().toISOString(),
    snapshot: createStudioProjectSnapshot(source),
  };

  library.projects[index] = updated;
  writeLibrary(library);
  return updated;
}

export function deleteStudioProject(id: string): boolean {
  const library = readLibrary();
  const nextProjects = library.projects.filter((project) => project.id !== id);
  if (nextProjects.length === library.projects.length) return false;

  writeLibrary({ ...library, projects: nextProjects });
  return true;
}

export function exportStudioProjectLibrary(): string {
  const library = readLibrary();
  return JSON.stringify(
    {
      ...library,
      version: LIBRARY_VERSION,
      exportedAt: new Date().toISOString(),
    },
    null,
    2,
  );
}

export function importStudioProjectLibrary(content: string): number {
  const parsed = JSON.parse(content) as Partial<StudioProjectLibrary>;
  if (!Array.isArray(parsed.projects)) {
    throw new Error("Studio library JSON must include a projects array.");
  }

  const imported = parsed.projects.filter(isStudioProject).map((project) => ({
    ...project,
    id: createProjectId(),
    createdAt: project.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }));

  if (imported.length === 0) return 0;

  const library = readLibrary();
  writeLibrary({
    version: LIBRARY_VERSION,
    projects: [...library.projects, ...imported],
  });
  return imported.length;
}
