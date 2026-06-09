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

export type StudioProjectStatus = "draft" | "approved" | "final";

export type StudioExportPreset = {
  engine: "generic" | "godot" | "phaser" | "rpg-maker";
  includePng: boolean;
  includeCredits: boolean;
  includeJson: boolean;
};

export type StudioProjectMetadata = {
  collection: string;
  tags: string[];
  notes: string;
  role: string;
  status: StudioProjectStatus;
  locked: boolean;
  exportPreset: StudioExportPreset;
};

export type StudioProjectVersion = {
  id: string;
  label: string;
  createdAt: string;
  snapshot: StudioProjectSnapshot;
};

export type StudioProject = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  thumbnailDataUrl?: string;
  snapshot: StudioProjectSnapshot;
  metadata: StudioProjectMetadata;
  versions: StudioProjectVersion[];
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

function defaultExportPreset(): StudioExportPreset {
  return {
    engine: "generic",
    includePng: true,
    includeCredits: true,
    includeJson: true,
  };
}

function normalizeMetadata(
  metadata?: Partial<StudioProjectMetadata>,
): StudioProjectMetadata {
  return {
    collection: metadata?.collection ?? "",
    tags: Array.isArray(metadata?.tags) ? metadata.tags : [],
    notes: metadata?.notes ?? "",
    role: metadata?.role ?? "",
    status: metadata?.status ?? "draft",
    locked: metadata?.locked ?? false,
    exportPreset: {
      ...defaultExportPreset(),
      ...(metadata?.exportPreset ?? {}),
    },
  };
}

function normalizeProject(project: StudioProject): StudioProject {
  return {
    ...project,
    thumbnailDataUrl:
      typeof project.thumbnailDataUrl === "string"
        ? project.thumbnailDataUrl
        : undefined,
    metadata: normalizeMetadata(project.metadata),
    versions: Array.isArray(project.versions) ? project.versions : [],
  };
}

function captureProjectThumbnail(): string | undefined {
  if (typeof document === "undefined") return undefined;

  const source = document.querySelector<HTMLCanvasElement>(
    "#desktop-preview-canvas",
  );
  if (!source || source.width === 0 || source.height === 0) return undefined;

  const thumb = document.createElement("canvas");
  thumb.width = 96;
  thumb.height = 96;
  const ctx = thumb.getContext("2d");
  if (!ctx) return undefined;

  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, thumb.width, thumb.height);

  const frameSize = Math.min(source.height, source.width);
  const x = Math.max(0, Math.floor((source.width - frameSize) / 2));
  ctx.drawImage(source, x, 0, frameSize, frameSize, 16, 16, 64, 64);

  try {
    return thumb.toDataURL("image/png");
  } catch {
    return undefined;
  }
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
  return readLibrary()
    .projects.map(normalizeProject)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function saveStudioProject(
  name: string,
  source: State = state,
  metadata?: Partial<StudioProjectMetadata>,
): StudioProject {
  const trimmedName = name.trim() || "Untitled project";
  const now = new Date().toISOString();
  const library = readLibrary();
  const project: StudioProject = {
    id: createProjectId(),
    name: trimmedName,
    createdAt: now,
    updatedAt: now,
    thumbnailDataUrl: captureProjectThumbnail(),
    snapshot: createStudioProjectSnapshot(source),
    metadata: normalizeMetadata(metadata),
    versions: [],
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

  const existing = normalizeProject(library.projects[index]!);
  if (existing.metadata.locked) return null;

  const updated: StudioProject = {
    ...existing,
    updatedAt: new Date().toISOString(),
    thumbnailDataUrl: captureProjectThumbnail() ?? existing.thumbnailDataUrl,
    snapshot: createStudioProjectSnapshot(source),
  };

  library.projects[index] = updated;
  writeLibrary(library);
  return updated;
}

export function updateStudioProjectMetadata(
  id: string,
  patch: Partial<StudioProjectMetadata> & { name?: string },
): StudioProject | null {
  const library = readLibrary();
  const index = library.projects.findIndex((project) => project.id === id);
  if (index === -1) return null;

  const existing = normalizeProject(library.projects[index]!);
  const updated: StudioProject = {
    ...existing,
    name: patch.name?.trim() || existing.name,
    updatedAt: new Date().toISOString(),
    metadata: normalizeMetadata({
      ...existing.metadata,
      ...patch,
      exportPreset: {
        ...existing.metadata.exportPreset,
        ...(patch.exportPreset ?? {}),
      },
    }),
  };

  library.projects[index] = updated;
  writeLibrary(library);
  return updated;
}

export function duplicateStudioProject(id: string): StudioProject | null {
  const library = readLibrary();
  const original = library.projects.find((project) => project.id === id);
  if (!original) return null;

  const now = new Date().toISOString();
  const project: StudioProject = {
    ...normalizeProject(original),
    id: createProjectId(),
    name: `${original.name} Copy`,
    createdAt: now,
    updatedAt: now,
    thumbnailDataUrl: original.thumbnailDataUrl,
    metadata: {
      ...normalizeMetadata(original.metadata),
      locked: false,
      status: "draft",
    },
    snapshot: cloneJson(original.snapshot),
    versions: cloneJson(normalizeProject(original).versions),
  };

  library.projects.push(project);
  writeLibrary(library);
  return project;
}

export function addStudioProjectVersion(
  id: string,
  label: string,
): StudioProject | null {
  const library = readLibrary();
  const index = library.projects.findIndex((project) => project.id === id);
  if (index === -1) return null;

  const project = normalizeProject(library.projects[index]!);
  const now = new Date().toISOString();
  const version: StudioProjectVersion = {
    id: createProjectId(),
    label: label.trim() || `Version ${project.versions.length + 1}`,
    createdAt: now,
    snapshot: cloneJson(project.snapshot),
  };

  const updated: StudioProject = {
    ...project,
    updatedAt: now,
    versions: [...project.versions, version],
  };
  library.projects[index] = updated;
  writeLibrary(library);
  return updated;
}

export function restoreStudioProjectVersion(
  projectId: string,
  versionId: string,
): StudioProject | null {
  const library = readLibrary();
  const index = library.projects.findIndex(
    (project) => project.id === projectId,
  );
  if (index === -1) return null;

  const project = normalizeProject(library.projects[index]!);
  const version = project.versions.find((entry) => entry.id === versionId);
  if (!version || project.metadata.locked) return null;

  const updated: StudioProject = {
    ...project,
    updatedAt: new Date().toISOString(),
    snapshot: cloneJson(version.snapshot),
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
    ...normalizeProject(project),
    id: createProjectId(),
    createdAt: project.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    thumbnailDataUrl:
      typeof project.thumbnailDataUrl === "string"
        ? project.thumbnailDataUrl
        : undefined,
  }));

  if (imported.length === 0) return 0;

  const library = readLibrary();
  writeLibrary({
    version: LIBRARY_VERSION,
    projects: [...library.projects, ...imported],
  });
  return imported.length;
}
