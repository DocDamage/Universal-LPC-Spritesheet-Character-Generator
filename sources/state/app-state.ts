import { LICENSE_CONFIG, ANIMATIONS, BODY_TYPES } from "./constants.ts";
import { BUILD_TIER, BUILD_CHANNEL } from "./build-config.ts";
import type { TweenMode, TweenPreset, TweenEasing } from "../canvas/tween.ts";

/** A single item selection within a selection group (e.g. body, head, ears). */
export type Selection = {
  itemId: string;
  name: string;
  /** Index into the item's `recolors` array; `null` for top-level selections. */
  subId?: number | null;
  /** Set when the item exposes `variants`. Empty string represents "default". */
  variant?: string | null;
  /** Set when the item exposes `recolors`. Empty string represents "default". */
  recolor?: string | null;
};

/** All selections, keyed by selection group (`type_name` of the item or recolor slot). */
export type Selections = Record<string, Selection>;

type ZipMode = { isRunning: boolean };
export type AppPlan = "free" | "pro" | "studio";

/** Global application state. Mutated in place; Mithril views observe via redraw. */
export type State = {
  // saved in URL hash
  selections: Selections;
  bodyType: string;

  // potentially saved in future
  selectedAnimation: string;
  expandedNodes: Record<string, boolean>;
  searchQuery: string;
  showTransparencyGrid: boolean;
  applyTransparencyMask: boolean;
  matchBodyColorEnabled: boolean;
  compactDisplay: boolean;
  customUploadedImage: HTMLImageElement | null;
  customImageZPos: number;
  previewCanvasZoomLevel: number;
  previewTweenMode: TweenMode;
  previewTweenInbetweens: number;
  previewTweenFps: number;
  previewTweenMotionStrength: number;
  previewTweenAlphaThreshold: number;
  previewTweenEasing: TweenEasing;
  previewTweenPreset: TweenPreset;
  previewTweenOverrides: Record<
    string,
    {
      mode: TweenMode;
      inbetweens: number;
      fps: number;
      motionStrength: number;
      alphaThreshold: number;
      easing: TweenEasing;
    }
  >;
  fullSpritesheetCanvasZoomLevel: number;
  /** True after `main.js` runs the first bootstrap `renderCharacter`. */
  previewBootstrapRenderDone: boolean;
  /** Mirrored from `renderCharacter` compositing (see `renderer.js`). */
  isRenderingCharacter: boolean;
  enabledLicenses: Record<string, boolean>;
  enabledAnimations: Record<string, boolean>;

  activeTab: "character" | "accessories";
  bookPage: "creator" | "pixel" | "animation" | "settings";
  activeSlotLabel: string;
  isFlipping: boolean;
  flipFrame: number;
  targetBookPage: "creator" | "pixel" | "animation" | "settings" | null;
  editingPart: { slotLabel: string; itemId: string } | null;
  appPlan: AppPlan;

  // transient (never saved)
  showCommandPalette: boolean;
  showShortcutHelp: boolean;
  showOnboarding: boolean;
  showAbout: boolean;
  showCreditsPreview: boolean;
  showScaleStrip: boolean;
  excludeHiddenLayersFromExports: boolean;
  hiddenLayerIds: Set<string>;
  zipByAnimation: ZipMode;
  zipByItem: ZipMode;
  zipByAnimationAndItem: ZipMode;
  zipIndividualFrames: ZipMode;
};

// Global state
export const state: State = {
  // state that is saved in url hash
  selections: {},
  bodyType: BODY_TYPES[0]!,

  // State that is currently not saved but could be in future
  selectedAnimation: "walk",
  expandedNodes: {},
  searchQuery: "",
  showTransparencyGrid: true,
  applyTransparencyMask: false,
  matchBodyColorEnabled: true,
  compactDisplay: false,
  customUploadedImage: null,
  customImageZPos: 0,
  previewCanvasZoomLevel: 1,
  previewTweenMode: "off",
  previewTweenInbetweens: 1,
  previewTweenFps: 8,
  previewTweenMotionStrength: 1,
  previewTweenAlphaThreshold: 1,
  previewTweenEasing: "linear",
  previewTweenPreset: "original",
  previewTweenOverrides: {},
  fullSpritesheetCanvasZoomLevel: 1,
  previewBootstrapRenderDone: false,
  isRenderingCharacter: false,
  enabledLicenses: Object.fromEntries(
    LICENSE_CONFIG.map((lic) => [lic.key, true]),
  ),
  enabledAnimations: Object.fromEntries(
    ANIMATIONS.map((anim) => [anim.value, false]),
  ),
  activeTab: "character",
  bookPage: "creator",
  activeSlotLabel: "Gender",
  isFlipping: false,
  flipFrame: 1,
  targetBookPage: null,
  editingPart: null,
  appPlan: BUILD_TIER,

  // Following transient state should never be saved
  showCommandPalette: false,
  showShortcutHelp: false,
  showOnboarding: false,
  showAbout: false,
  showCreditsPreview: false,
  showScaleStrip: true,
  excludeHiddenLayersFromExports: false,
  hiddenLayerIds: new Set<string>(),
  zipByAnimation: { isRunning: false },
  zipByItem: { isRunning: false },
  zipByAnimationAndItem: { isRunning: false },
  zipIndividualFrames: { isRunning: false },
};

let appPlanVal = BUILD_TIER;
Object.defineProperty(state, "appPlan", {
  get() {
    return appPlanVal;
  },
  set(val: AppPlan) {
    if (BUILD_CHANNEL !== "dev") {
      return;
    }
    appPlanVal = val;
  },
  configurable: true,
  enumerable: true,
});
