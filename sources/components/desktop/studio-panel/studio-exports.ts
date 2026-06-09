import {
  downloadBlob,
  generateGameEngineMetadata,
} from "../../../canvas/download.ts";
import { canvasToBlob } from "../../../canvas/canvas-utils.ts";
import {
  drawCalls,
  getCanvas,
  renderCharacter,
} from "../../../canvas/renderer.ts";
import {
  exportStateAsJSON,
  serializeLayersForJson,
} from "../../../state/json.ts";
import {
  applyStudioProjectSnapshot,
  createStudioProjectSnapshot,
  type StudioProject,
} from "../../../state/studio-projects.ts";
import { state } from "../../../state/state.ts";
import {
  getAllCredits,
  creditsToCsv,
  creditsToTxt,
} from "../../../utils/credits.ts";
import type { ZipFolder } from "../../../utils/zip-helpers.ts";
import { triggerRender } from "../../render-effect.ts";
import {
  buildCombinedCredits,
  buildHandoffReadme,
  buildStudioReport,
} from "./studio-report.ts";
import { safeFileName } from "./studio-utils.ts";

type WindowWithJSZip = Window & {
  JSZip?: new () => ZipFolder;
};

async function renderProjectPng(project: StudioProject): Promise<Blob> {
  applyStudioProjectSnapshot(project.snapshot);
  await renderCharacter(state.selections, state.bodyType);
  const canvasResult = getCanvas();
  if (canvasResult.isErr()) {
    throw new Error("Canvas renderer is not ready yet.");
  }
  return canvasToBlob(canvasResult.value);
}

export async function exportHandoffZip(
  projects: StudioProject[],
): Promise<void> {
  const w = window as WindowWithJSZip;
  if (!w.JSZip) {
    throw new Error("JSZip library not loaded");
  }

  const restoreSnapshot = createStudioProjectSnapshot();
  const zip = new w.JSZip();
  const manifest = {
    version: 2,
    generatedAt: new Date().toISOString(),
    projectCount: projects.length,
    projects: projects.map((project) => ({
      id: project.id,
      name: project.name,
      collection: project.metadata.collection,
      status: project.metadata.status,
      engine: project.metadata.exportPreset.engine,
    })),
  };

  zip.file("README.txt", buildHandoffReadme(projects));
  zip.file("manifest.json", JSON.stringify(manifest, null, 2));
  zip.file("reports/studio-qa-report.md", buildStudioReport(projects));

  const combinedCredits = buildCombinedCredits(projects);
  zip.file("credits/combined-credits.txt", creditsToTxt(combinedCredits));
  zip.file("credits/combined-credits.csv", creditsToCsv(combinedCredits));

  try {
    for (const project of projects) {
      const baseName = safeFileName(project.name);
      const basePath = `projects/${baseName}-${project.id}`;
      const preset = project.metadata.exportPreset;
      zip.file(`${basePath}/project.json`, JSON.stringify(project, null, 2));
      if (preset.includeCredits) {
        zip.file(
          `${basePath}/credits.txt`,
          creditsToTxt(
            getAllCredits(
              project.snapshot.selections,
              project.snapshot.bodyType,
            ),
          ),
        );
      }

      if (preset.includePng) {
        const png = await renderProjectPng(project);
        zip.file(`${basePath}/spritesheet.png`, png);
      }

      if (preset.includeJson) {
        zip.file(
          `${basePath}/character.json`,
          exportStateAsJSON(state, serializeLayersForJson(drawCalls)),
        );
        zip.file(
          `${basePath}/engine-preset.json`,
          generateGameEngineMetadata(),
        );
      }
    }
  } finally {
    applyStudioProjectSnapshot(restoreSnapshot);
    await triggerRender();
  }

  const blob = await zip.generateAsync({ type: "blob" });
  downloadBlob(blob, "lpc-studio-handoff-pack.zip");
}

export async function exportPngZip(projects: StudioProject[]): Promise<void> {
  const w = window as WindowWithJSZip;
  if (!w.JSZip) {
    throw new Error("JSZip library not loaded");
  }

  const restoreSnapshot = createStudioProjectSnapshot();
  const zip = new w.JSZip();
  try {
    for (const project of projects) {
      const png = await renderProjectPng(project);
      zip.file(`${safeFileName(project.name)}-${project.id}.png`, png);
    }
  } finally {
    applyStudioProjectSnapshot(restoreSnapshot);
    await triggerRender();
  }

  const blob = await zip.generateAsync({ type: "blob" });
  downloadBlob(blob, "lpc-studio-spritesheets.zip");
}
