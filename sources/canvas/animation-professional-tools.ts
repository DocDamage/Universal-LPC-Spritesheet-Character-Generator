import { downloadBlob, downloadFile } from "./download.ts";
import { canvasToBlob, createCanvas } from "./canvas-utils.ts";
import { renderPreviewAnimationFrameCanvases } from "./preview-animation.ts";
import { ANIMATION_CONFIGS, DIRECTIONS } from "../state/constants.ts";
import { state } from "../state/state.ts";
import { getItemMerged } from "../state/catalog.ts";
import { getTweenSettingsForAnimation } from "../state/tween-settings.ts";
import type { TweenSettings } from "./tween.ts";

export type AnimationQaCheck = {
  label: string;
  status: "ready" | "warning" | "blocked";
  detail: string;
};

type AnimationConfig = {
  row: number;
  num: number;
  cycle: number[];
};

function getAnimationConfig(animationName: string): AnimationConfig | null {
  return (
    (ANIMATION_CONFIGS as Record<string, AnimationConfig | undefined>)[
      animationName
    ] ?? null
  );
}

export function buildAnimationQaChecks(
  animationName: string,
  settings: TweenSettings = getTweenSettingsForAnimation(animationName),
): AnimationQaCheck[] {
  const config = getAnimationConfig(animationName);
  const selectedParts = Object.values(state.selections);
  const incompatibleParts = selectedParts.filter((selection) => {
    const meta = getItemMerged(selection.itemId).unwrapOr(null);
    if (!meta?.animations || meta.animations.length === 0) return false;
    if (animationName === "combat_idle") {
      return !meta.animations.includes("combat");
    }
    if (animationName === "backslash") {
      return (
        !meta.animations.includes("1h_slash") &&
        !meta.animations.includes("1h_backslash")
      );
    }
    if (animationName === "halfslash") {
      return !meta.animations.includes("1h_halfslash");
    }
    return !meta.animations.includes(animationName);
  });

  const sourceFrameCount = config?.cycle.length ?? 0;
  const generatedTweenFrames =
    settings.mode === "off" ? 0 : sourceFrameCount * settings.inbetweens;

  return [
    {
      label: "Animation definition",
      status:
        config || animationName in state.previewTweenOverrides
          ? "ready"
          : "warning",
      detail: config
        ? `${sourceFrameCount} source frame${sourceFrameCount === 1 ? "" : "s"}, ${config.num} direction row${config.num === 1 ? "" : "s"}`
        : "Custom animation or runtime-only animation.",
    },
    {
      label: "Selected part support",
      status: incompatibleParts.length === 0 ? "ready" : "warning",
      detail:
        incompatibleParts.length === 0
          ? `${selectedParts.length} selected part${selectedParts.length === 1 ? "" : "s"} checked`
          : `${incompatibleParts.length} selected part${incompatibleParts.length === 1 ? "" : "s"} may not support this animation.`,
    },
    {
      label: "Tween workload",
      status: generatedTweenFrames >= 120 ? "warning" : "ready",
      detail:
        settings.mode === "off"
          ? "Tweening is off for this animation."
          : `${generatedTweenFrames} generated in-between frame${generatedTweenFrames === 1 ? "" : "s"} at ${settings.fps} FPS.`,
    },
    {
      label: "Frame timing",
      status: settings.fps >= 4 && settings.fps <= 24 ? "ready" : "warning",
      detail: `${Math.round(1000 / settings.fps)} ms per frame at ${settings.fps} FPS.`,
    },
  ];
}

export function buildAnimationMetadata(
  animationName: string,
  settings: TweenSettings = getTweenSettingsForAnimation(animationName),
): string {
  const config = getAnimationConfig(animationName);
  const sourceFrames = config?.cycle ?? [];
  const frameDurationMs = Math.round(1000 / settings.fps);
  const inbetweens = settings.mode === "off" ? 0 : settings.inbetweens;
  const expandedFrameCount =
    sourceFrames.length + sourceFrames.length * inbetweens;

  return JSON.stringify(
    {
      app: "LPC Character Generator",
      animation: animationName,
      bodyType: state.bodyType,
      directions: config?.num === 1 ? ["all"] : DIRECTIONS,
      sourceFrames,
      frameSize: 64,
      timing: {
        fps: settings.fps,
        frameDurationMs,
        frameDurationsMs: Array.from(
          { length: Math.max(1, expandedFrameCount) },
          () => frameDurationMs,
        ),
      },
      tween: {
        mode: settings.mode,
        inbetweens: settings.inbetweens,
        easing: settings.easing,
        motionStrength: settings.motionStrength,
        alphaThreshold: settings.alphaThreshold,
      },
      notes: [
        "Frame durations are exported for engine importers and can be edited downstream.",
        "Source frame indexes match the LPC sheet columns for this animation cycle.",
      ],
    },
    null,
    2,
  );
}

export function downloadAnimationMetadata(
  animationName: string,
  settings?: TweenSettings,
): void {
  downloadFile(
    buildAnimationMetadata(animationName, settings),
    `${animationName}-animation-metadata.json`,
    "application/json",
  );
}

export async function downloadAnimationContactSheet(
  animationName: string,
  settings: TweenSettings,
): Promise<void> {
  const frames = renderPreviewAnimationFrameCanvases(settings);
  if (frames.length === 0) {
    throw new Error(
      "No animation frames are available for contact sheet export.",
    );
  }

  const firstFrame = frames[0]!;
  const labelHeight = 18;
  const columns = Math.min(8, frames.length);
  const rows = Math.ceil(frames.length / columns);
  const { canvas, ctx } = createCanvas(
    columns * firstFrame.width,
    rows * (firstFrame.height + labelHeight),
    true,
  );

  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#111827";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.font = "10px sans-serif";
  ctx.textBaseline = "top";

  frames.forEach((frame, index) => {
    const x = (index % columns) * firstFrame.width;
    const y = Math.floor(index / columns) * (firstFrame.height + labelHeight);
    ctx.drawImage(frame, x, y);
    ctx.fillStyle = "#cbd5e1";
    ctx.fillText(String(index + 1), x + 4, y + firstFrame.height + 4);
  });

  downloadBlob(
    await canvasToBlob(canvas),
    `${animationName}-contact-sheet.png`,
  );
}
