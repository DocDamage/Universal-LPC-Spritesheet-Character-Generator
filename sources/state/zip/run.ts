import {
  addAnimationSliceToZip,
  addCanvasToZip,
  addStandardAnimationToZipCustomFolder,
  zipExportTimestamp,
  guardZipExportEnvironment,
  zipGenerateBlobWithProfiler,
  downloadZipBlob,
  addCharacterJsonAndCredits,
} from "../../utils/zip-helpers.ts";
import type { ZipFolder } from "../../utils/zip-helpers.ts";
import { createZipExportProfiler } from "../../performance-profiler.ts";
import {
  beginZipExportUiSuspend,
  endZipExportUiSuspend,
} from "../../utils/zip-export-ui-suspend.ts";
import { showToast } from "../notifications.ts";
import {
  buildTweenExportReadme,
  buildTweenEnginePresets,
} from "../tween-settings.ts";
import { FRAME_SIZE } from "../constants.ts";
import { renderState } from "../render-state.ts";
import m from "mithril";
import type { State } from "../state.ts";
import type { ZipFolder as ZipFolderType } from "../../utils/zip-helpers.ts";

declare global {
  interface Window {
    /** JSZip constructor attached at runtime by `vendor-globals.js`. */
    JSZip?: new () => ZipFolderType;
  }
}

// ---------------------------------------------------------------------------
// Notification helpers
// ---------------------------------------------------------------------------

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function showZipSuccess(message = "Export complete!"): void {
  showToast(message, { kind: "success", timeoutMs: 7000 });
}

function showZipWarning(message: string): void {
  showToast(message.trim(), { kind: "warning", timeoutMs: 9000 });
}

function showZipFailure(err: unknown): void {
  showToast(`Export failed: ${errorMessage(err)}`, {
    kind: "error",
    timeoutMs: 9000,
  });
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Create profiler-injected zip adder functions. */
export function makeZipAdders(
  profiler: ReturnType<typeof createZipExportProfiler>,
  deps?: Partial<{
    addAnimationSliceToZip: typeof addAnimationSliceToZip;
    addCanvasToZip: typeof addCanvasToZip;
    addStandardAnimationToZipCustomFolder: typeof addStandardAnimationToZipCustomFolder;
  }>,
) {
  const baseAddCanvasToZip = deps?.addCanvasToZip ?? addCanvasToZip;
  const baseAddSlice = deps?.addAnimationSliceToZip ?? addAnimationSliceToZip;
  const baseAddStandard =
    deps?.addStandardAnimationToZipCustomFolder ??
    addStandardAnimationToZipCustomFolder;

  const addCanvas: typeof baseAddCanvasToZip = (folder, fileName, srcCanvas) =>
    baseAddCanvasToZip(folder, fileName, srcCanvas, { profiler });
  const addSlice: typeof baseAddSlice = (
    folder,
    fileName,
    srcCanvas,
    srcRect,
  ) => baseAddSlice(folder, fileName, srcCanvas, srcRect, { profiler });
  const addStandardAnimation: typeof baseAddStandard = (
    custAnimFolder,
    itemFileName,
    src,
    custAnim,
  ) =>
    baseAddStandard(custAnimFolder, itemFileName, src, custAnim, { profiler });

  return { addCanvas, addSlice, addStandardAnimation };
}

/** Append tween-export README and engine presets to the ZIP when enabled. */
export function addTweenExportFiles(
  zip: ZipFolder,
  creditsFolder: ZipFolder,
  exportKind: Parameters<typeof buildTweenExportReadme>[0],
): void {
  creditsFolder.file(
    "TWEEN_EXPORT_README.txt",
    buildTweenExportReadme(exportKind),
  );
  const presetFolder = zip.folder("engine-presets")!;
  for (const preset of buildTweenEnginePresets(exportKind, FRAME_SIZE)) {
    presetFolder.file(`${preset.engine}.json`, JSON.stringify(preset, null, 2));
  }
}

export type ZipExportContext = {
  zip: ZipFolder;
  timestamp: string;
  state: State;
  bodyType: string;
  profiler: ReturnType<typeof createZipExportProfiler>;
  creditsFolder: ZipFolder;
};

export type ZipExportResult = {
  metadata?: object;
  warningMessage?: string;
  successMessage?: string;
  includeTweenFiles?: boolean;
  tweenExportKind?: Parameters<typeof buildTweenExportReadme>[0];
  beforeGenerateZip?: () => void;
};

type ZipExportStateKey =
  | "zipByAnimation"
  | "zipByItem"
  | "zipByAnimationAndItem"
  | "zipIndividualFrames";

/** Shared lifecycle wrapper for all ZIP export flows. */
export async function runZipExport(
  profilerName: string,
  stateKey: ZipExportStateKey,
  buildFilename: (bodyType: string, timestamp: string) => string,
  execute: (ctx: ZipExportContext) => Promise<ZipExportResult>,
  errorPrefix = "Export failed:",
): Promise<void> {
  if (!guardZipExportEnvironment()) return;
  let state: State | undefined;
  const profiler = createZipExportProfiler(profilerName);
  try {
    const zip = new window.JSZip!();
    const timestamp = zipExportTimestamp();
    state = (await import("../state.ts")).state;
    state[stateKey].isRunning = true;
    m.redraw();
    beginZipExportUiSuspend();
    const bodyType = state.bodyType;
    const creditsFolder = zip.folder("credits")!;

    const result = await execute({
      zip,
      timestamp,
      state,
      bodyType,
      profiler,
      creditsFolder,
    });

    await profiler.phase("staticFiles", async () => {
      addCharacterJsonAndCredits(
        zip,
        creditsFolder,
        state!,
        renderState.drawCalls,
      );
    });

    if (result.metadata) {
      creditsFolder.file(
        "metadata.json",
        JSON.stringify(result.metadata, null, 2),
      );
    }

    if (result.includeTweenFiles && result.tweenExportKind) {
      addTweenExportFiles(zip, creditsFolder, result.tweenExportKind);
    }

    result.beforeGenerateZip?.();
    const zipBlob = await zipGenerateBlobWithProfiler(profiler, zip);
    downloadZipBlob(zipBlob, buildFilename(bodyType, timestamp));

    if (result.warningMessage) {
      showZipWarning(result.warningMessage);
    } else {
      showZipSuccess(result.successMessage);
    }
  } catch (err) {
    console.error(errorPrefix, err);
    showZipFailure(err);
  } finally {
    endZipExportUiSuspend();
    if (state) {
      state[stateKey].isRunning = false;
    }
    m.redraw();
  }
}
