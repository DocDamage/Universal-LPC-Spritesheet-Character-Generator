import { ANIMATIONS, ANIMATION_CONFIGS, DIRECTIONS } from "./constants.ts";
import { state } from "./state.ts";
import {
  TWEEN_PRESETS,
  normalizeTweenSettings,
  type TweenPreset,
  type TweenSettings,
} from "../canvas/tween.ts";
import { addedCustomAnimations } from "../canvas/renderer.ts";
import { customAnimations } from "../custom-animations.ts";

type AnimationConfigMap = Record<string, { cycle: number[] } | undefined>;

export type TweenExportEstimate = {
  enabled: boolean;
  standardAnimations: number;
  customAnimations: number;
  sourceFrames: number;
  generatedTweenFrames: number;
  totalFrames: number;
  expandedSpritesheets: number;
};

export type TweenEnginePreset = {
  engine: "generic" | "godot" | "phaser" | "rpg-maker";
  exportKind: "split-by-animation" | "individual-frames";
  fps: number;
  frameDurationMs: number;
  frameSize: number;
  directions: readonly string[];
  pathTemplate: string;
  notes: string[];
  animations: Array<{
    id: string;
    mode: TweenSettings["mode"];
    inbetweens: number;
    fps: number;
    frameDurationMs: number;
  }>;
};

export function getGlobalTweenSettings(): TweenSettings {
  return normalizeTweenSettings({
    mode: state.previewTweenMode,
    inbetweens: state.previewTweenInbetweens,
    fps: state.previewTweenFps,
    motionStrength: state.previewTweenMotionStrength,
    alphaThreshold: state.previewTweenAlphaThreshold,
  });
}

export function getTweenSettingsForAnimation(
  animationName: string,
): TweenSettings {
  return normalizeTweenSettings(
    state.previewTweenOverrides[animationName] ?? getGlobalTweenSettings(),
  );
}

export function setGlobalTweenSettings(settings: Partial<TweenSettings>): void {
  const normalized = normalizeTweenSettings({
    ...getGlobalTweenSettings(),
    ...settings,
  });
  state.previewTweenMode = normalized.mode;
  state.previewTweenInbetweens = normalized.inbetweens;
  state.previewTweenFps = normalized.fps;
  state.previewTweenMotionStrength = normalized.motionStrength;
  state.previewTweenAlphaThreshold = normalized.alphaThreshold;
}

export function applyTweenPreset(preset: TweenPreset): TweenSettings {
  state.previewTweenPreset = preset;
  const settings = TWEEN_PRESETS[preset];
  setGlobalTweenSettings(settings);
  return getGlobalTweenSettings();
}

export function setTweenOverrideForAnimation(
  animationName: string,
  settings: Partial<TweenSettings>,
): TweenSettings {
  const normalized = normalizeTweenSettings({
    ...getTweenSettingsForAnimation(animationName),
    ...settings,
  });
  state.previewTweenOverrides[animationName] = normalized;
  return normalized;
}

export function clearTweenOverrideForAnimation(animationName: string): void {
  delete state.previewTweenOverrides[animationName];
}

export function hasTweenOverride(animationName: string): boolean {
  return Boolean(state.previewTweenOverrides[animationName]);
}

export function estimateTweenExportFrames(): TweenExportEstimate {
  const standardAnimations = ANIMATIONS.filter((anim) => !anim.noExport);
  const customAnimationNames = Array.from(addedCustomAnimations);
  const animationConfigs = ANIMATION_CONFIGS as AnimationConfigMap;
  let sourceFrames = 0;
  let generatedTweenFrames = 0;

  for (const anim of standardAnimations) {
    const frameCount = animationConfigs[anim.value]?.cycle.length ?? 0;
    const settings = getTweenSettingsForAnimation(anim.value);
    sourceFrames += frameCount * DIRECTIONS.length;
    if (settings.mode !== "off") {
      generatedTweenFrames +=
        frameCount * DIRECTIONS.length * settings.inbetweens;
    }
  }

  for (const animName of customAnimationNames) {
    const anim = customAnimations[animName];
    const frameCount = anim?.frames[0]?.length ?? 0;
    const settings = getTweenSettingsForAnimation(animName);
    sourceFrames += frameCount * DIRECTIONS.length;
    if (settings.mode !== "off") {
      generatedTweenFrames +=
        frameCount * DIRECTIONS.length * settings.inbetweens;
    }
  }

  return {
    enabled: generatedTweenFrames > 0,
    standardAnimations: standardAnimations.length,
    customAnimations: customAnimationNames.length,
    sourceFrames,
    generatedTweenFrames,
    totalFrames: sourceFrames + generatedTweenFrames,
    expandedSpritesheets:
      generatedTweenFrames > 0
        ? standardAnimations.length + customAnimationNames.length
        : 0,
  };
}

export function buildTweenExportReadme(
  exportKind: "split-by-animation" | "individual-frames",
): string {
  const globalSettings = getGlobalTweenSettings();
  const estimate = estimateTweenExportFrames();
  const overrideNames = Object.keys(state.previewTweenOverrides).sort();
  const pathSummary =
    exportKind === "split-by-animation"
      ? [
          "Original sheets stay in standard/ and custom/.",
          "Generated tweened sheets are written to tweened/standard/ and tweened/custom/.",
        ]
      : [
          "Original frame PNGs keep their numeric frame names.",
          "Generated tween frames are written beside source frames as <frame>_tween_<index>.png.",
        ];

  return [
    "LPC Tween Export",
    "",
    `Export kind: ${exportKind}`,
    `Global mode: ${globalSettings.mode}`,
    `Global in-betweens: ${globalSettings.inbetweens}`,
    `Global FPS: ${globalSettings.fps}`,
    `Motion strength: ${globalSettings.motionStrength}`,
    `Alpha threshold: ${globalSettings.alphaThreshold}`,
    `Per-animation overrides: ${overrideNames.length > 0 ? overrideNames.join(", ") : "none"}`,
    "",
    ...pathSummary,
    "",
    `Estimated source frames: ${estimate.sourceFrames}`,
    `Estimated generated tween frames: ${estimate.generatedTweenFrames}`,
    `Estimated total frame PNGs for individual-frame export: ${estimate.totalFrames}`,
    "",
    "Game-engine import tip: use the FPS value above as the animation playback rate for generated tweened sequences.",
    "Engine preset JSON files are available under engine-presets/ for generic importers, Godot, Phaser, and RPG Maker style workflows.",
  ].join("\n");
}

export function buildTweenEnginePresets(
  exportKind: "split-by-animation" | "individual-frames",
  frameSize: number,
): TweenEnginePreset[] {
  const animations = ANIMATIONS.filter((anim) => !anim.noExport).map((anim) => {
    const settings = getTweenSettingsForAnimation(anim.value);
    return {
      id: anim.value,
      mode: settings.mode,
      inbetweens: settings.inbetweens,
      fps: settings.fps,
      frameDurationMs: Math.round(1000 / settings.fps),
    };
  });
  const globalSettings = getGlobalTweenSettings();
  const frameDurationMs = Math.round(1000 / globalSettings.fps);
  const pathTemplate =
    exportKind === "split-by-animation"
      ? "tweened/standard/{animation}.png"
      : "standard/{animation}/{direction}/{frame}.png";

  return [
    {
      engine: "generic",
      exportKind,
      fps: globalSettings.fps,
      frameDurationMs,
      frameSize,
      directions: DIRECTIONS,
      pathTemplate,
      notes: [
        "Use this preset as a neutral manifest for custom import scripts.",
        "Per-animation FPS overrides are listed in the animations array.",
      ],
      animations,
    },
    {
      engine: "godot",
      exportKind,
      fps: globalSettings.fps,
      frameDurationMs,
      frameSize,
      directions: DIRECTIONS,
      pathTemplate,
      notes: [
        "Import tweened sheets as SpriteFrames or AnimatedSprite2D animations.",
        "Set animation speed to fps, or use per-animation fps when it differs.",
        "For individual frames, import files in numeric frame order and keep *_tween_* frames between their source frames.",
      ],
      animations,
    },
    {
      engine: "phaser",
      exportKind,
      fps: globalSettings.fps,
      frameDurationMs,
      frameSize,
      directions: DIRECTIONS,
      pathTemplate,
      notes: [
        "Load tweened sheets with this.load.spritesheet using frameWidth/frameHeight.",
        "Create animations with frameRate set to fps.",
        "For individual frames, generate frame names from the path template and preserve sorted frame order.",
      ],
      animations,
    },
    {
      engine: "rpg-maker",
      exportKind,
      fps: globalSettings.fps,
      frameDurationMs,
      frameSize,
      directions: DIRECTIONS,
      pathTemplate,
      notes: [
        "RPG Maker import usually needs a plugin or conversion step for LPC-sized directional sheets.",
        "Use tweened individual frames when a plugin accepts explicit frame sequences.",
        "Keep original standard/ and custom/ sheets for compatibility fallbacks.",
      ],
      animations,
    },
  ];
}
