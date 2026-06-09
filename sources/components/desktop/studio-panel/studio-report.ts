import {
  getAllCredits,
  type CreditWithFileName,
} from "../../../utils/credits.ts";
import type {
  StudioProject,
  StudioProjectStatus,
} from "../../../state/studio-projects.ts";

const statuses: StudioProjectStatus[] = ["draft", "approved", "final"];

export function buildCombinedCredits(
  projects: StudioProject[],
): CreditWithFileName[] {
  const byFile = new Map<string, CreditWithFileName>();
  for (const project of projects) {
    for (const credit of getAllCredits(
      project.snapshot.selections,
      project.snapshot.bodyType,
    )) {
      byFile.set(credit.fileName, credit);
    }
  }
  return Array.from(byFile.values()).sort((a, b) =>
    a.fileName.localeCompare(b.fileName),
  );
}

export function buildStudioReport(projects: StudioProject[]): string {
  const lines = [
    "# LPC Studio QA Report",
    "",
    `Generated: ${new Date().toISOString()}`,
    `Projects: ${projects.length}`,
    "",
  ];

  const byStatus = new Map<StudioProjectStatus, number>();
  for (const status of statuses) byStatus.set(status, 0);
  for (const project of projects) {
    byStatus.set(
      project.metadata.status,
      (byStatus.get(project.metadata.status) ?? 0) + 1,
    );
  }

  lines.push("## Status Summary", "");
  for (const status of statuses) {
    lines.push(`- ${status}: ${byStatus.get(status) ?? 0}`);
  }

  lines.push("", "## Projects", "");
  for (const project of projects) {
    const enabledAnimations = Object.entries(project.snapshot.enabledAnimations)
      .filter(([, enabled]) => enabled)
      .map(([animation]) => animation);
    const selectedCount = Object.keys(project.snapshot.selections).length;
    const tags = project.metadata.tags.join(", ") || "none";
    lines.push(`### ${project.name}`);
    lines.push(`- Collection: ${project.metadata.collection || "none"}`);
    lines.push(`- Role: ${project.metadata.role || "none"}`);
    lines.push(`- Status: ${project.metadata.status}`);
    lines.push(`- Locked: ${project.metadata.locked ? "yes" : "no"}`);
    lines.push(`- Tags: ${tags}`);
    lines.push(`- Selected parts: ${selectedCount}`);
    lines.push(
      `- Enabled animations: ${enabledAnimations.length > 0 ? enabledAnimations.join(", ") : "default/current only"}`,
    );
    lines.push(`- Export engine: ${project.metadata.exportPreset.engine}`);
    if (project.metadata.notes) {
      lines.push(`- Notes: ${project.metadata.notes}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

export function buildHandoffReadme(projects: StudioProject[]): string {
  return [
    "LPC Studio Handoff Pack",
    "",
    "Contents:",
    "- manifest.json: project index and export metadata",
    "- reports/studio-qa-report.md: production QA summary",
    "- credits/: combined attribution files",
    "- projects/: per-project JSON, spritesheet PNGs, credits, and engine metadata",
    "",
    `Projects included: ${projects.length}`,
    "",
    "All LPC art remains governed by its original free/open licenses. This pack is a production workflow export only.",
  ].join("\n");
}
