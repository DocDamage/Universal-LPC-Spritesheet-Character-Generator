import { ANIMATION_CONFIGS } from "../state/constants.ts";
import { customAnimations } from "../custom-animations.ts";
import type { CustomAnimationDefinition } from "../custom-animations.ts";
import {
  DEFAULT_TWEEN_SETTINGS,
  buildTweenSteps,
  normalizeTweenSettings,
} from "./tween.ts";
import type { TweenSettings } from "./tween.ts";
import { getTweenSettingsForAnimation } from "../state/tween-settings.ts";

// Preview options mirrored from app state (set by component layer to avoid
// canvas → state circular dependency).
let previewShowTransparencyGrid = true;
let previewApplyTransparencyMask = false;

export function setPreviewShowTransparencyGrid(enabled: boolean): void {
  previewShowTransparencyGrid = enabled;
}

export function setPreviewApplyTransparencyMask(enabled: boolean): void {
  previewApplyTransparencyMask = enabled;
}

export { previewShowTransparencyGrid, previewApplyTransparencyMask };

// Animation preview state
export let animationFrames: number[] = [1, 2, 3, 4, 5, 6, 7, 8]; // default for walk
export let animRowStart = 8; // default for walk (row number)
export let animRowNum = 4; // default for walk (number of rows to stack)
export let currentFrameIndex = 0;
export let lastFrameTime = Date.now();
export let animationFrameId: number | null = null;
export let tweenSettings: TweenSettings = { ...DEFAULT_TWEEN_SETTINGS };

// Track custom animations present in current render
export let currentCustomAnimations: Record<string, CustomAnimationDefinition> =
  {};
export let customAnimYPositions: Record<string, number> = {}; // Y positions of custom animations in canvas
export let activeCustomAnimation: string | null = null; // Currently selected custom animation for preview

export type PreviewGeometry = {
  frameSize: number;
  previewWidth: number;
  yOffset: number;
};

export type DirectionalPreviewFrame = {
  direction: string;
  canvas: HTMLCanvasElement;
};

export type PreviewAnimationStatus = {
  currentStep: number;
  sourceFrameCount: number;
  totalSteps: number;
  directionCount: number;
  fps: number;
  tweenMode: TweenSettings["mode"];
};

/**
 * Set which animation to preview
 */
export function setPreviewAnimation(animationName: string): number[] {
  // Check if this is a custom animation
  if (customAnimations && customAnimations[animationName]) {
    const customAnimDef = customAnimations[animationName];
    activeCustomAnimation = animationName;

    // Extract frame cycle from custom animation definition
    // Custom animations have 4 rows (n, w, s, e), we'll show all columns from first row
    const frameCount = customAnimDef.frames[0]!.length;

    // Check if we should skip the first frame (frame 0)
    const skipFirstFrame = customAnimDef.skipFirstFrameInPreview || false;
    animationFrames = skipFirstFrame
      ? Array.from({ length: frameCount - 1 }, (_, i) => i + 1) // [1, 2, 3, ..., 8]
      : Array.from({ length: frameCount }, (_, i) => i); // [0, 1, 2, ..., 8]

    animRowStart = 0; // Not used for custom animations
    animRowNum = 4; // Show all 4 directions
    currentFrameIndex = 0;

    return animationFrames;
  }

  // Standard animation
  activeCustomAnimation = null;
  const configs = ANIMATION_CONFIGS as Record<
    string,
    { row: number; num: number; cycle: number[] } | undefined
  >;
  const config = configs[animationName];
  if (!config) {
    console.error("Unknown animation:", animationName);
    return [];
  }

  animationFrames = config.cycle;
  animRowStart = config.row;
  animRowNum = config.num;
  currentFrameIndex = 0;

  return animationFrames; // Return for display
}

export function setPreviewTweenSettings(
  nextSettings: Partial<TweenSettings>,
): TweenSettings {
  tweenSettings = {
    ...normalizeTweenSettings({ ...tweenSettings, ...nextSettings }),
  };
  currentFrameIndex = 0;
  return tweenSettings;
}

export function getPreviewTweenSettings(): TweenSettings {
  return { ...tweenSettings };
}

export function getPreviewGeometry(): PreviewGeometry {
  let frameSize = 64; // FRAME_SIZE, imported lazily to avoid circular dependency at top-level

  if (activeCustomAnimation && customAnimations) {
    const customAnimDef = customAnimations[activeCustomAnimation];
    if (customAnimDef) {
      frameSize = customAnimDef.frameSize;
    }
  }

  return {
    frameSize,
    previewWidth: animRowNum * frameSize,
    yOffset: activeCustomAnimation
      ? customAnimYPositions[activeCustomAnimation] || 0
      : 0,
  };
}

export function getPreviewAnimationStatus(): PreviewAnimationStatus {
  return {
    currentStep: currentFrameIndex + 1,
    sourceFrameCount: animationFrames.length,
    totalSteps: Math.max(
      1,
      buildTweenSteps(animationFrames, tweenSettings).length,
    ),
    directionCount: animRowNum,
    fps: tweenSettings.fps,
    tweenMode: tweenSettings.mode,
  };
}

export function setAnimationFrameId(id: number | null): void {
  animationFrameId = id;
}

export function setCurrentFrameIndex(index: number): void {
  currentFrameIndex = index;
}

export function setLastFrameTime(time: number): void {
  lastFrameTime = time;
}

export function isPreviewAnimationRunning(): boolean {
  return animationFrameId !== null;
}

/** Get list of custom animations present in current render. */
export function getCustomAnimations(): Record<
  string,
  CustomAnimationDefinition
> {
  return currentCustomAnimations;
}

export function setCurrentCustomAnimations(
  customAnims: Record<string, CustomAnimationDefinition>,
): void {
  currentCustomAnimations = customAnims;
}

export function setCustomAnimYPositions(
  yPositions: Record<string, number>,
): void {
  customAnimYPositions = yPositions;
}

export function syncPreviewTweenSettingsForAnimation(
  animationName: string,
): TweenSettings {
  return setPreviewTweenSettings(getTweenSettingsForAnimation(animationName));
}
