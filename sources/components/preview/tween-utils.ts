// Shared tween utility functions for animation preview components
import type {
  TweenMode,
  TweenPreset,
  TweenSettings,
  TweenEasing,
} from "../../canvas/tween.ts";
import {
  setTweenOverrideForAnimation,
  setGlobalTweenSettings,
} from "../../state/tween-settings.ts";

export type TweenState = {
  tweenMode: TweenMode;
  tweenInbetweens: number;
  tweenFps: number;
  tweenMotionStrength: number;
  tweenAlphaThreshold: number;
  tweenEasing: TweenEasing;
  tweenPreset: TweenPreset;
  useAnimationOverride: boolean;
  compareOriginal: boolean;
};

export function assignTweenState(
  state: TweenState,
  settings: TweenSettings,
): void {
  state.tweenMode = settings.mode;
  state.tweenInbetweens = settings.inbetweens;
  state.tweenFps = settings.fps;
  state.tweenMotionStrength = settings.motionStrength;
  state.tweenAlphaThreshold = settings.alphaThreshold;
  state.tweenEasing = settings.easing || "linear";
}

export function persistTweenSettings(
  state: TweenState,
  selectedAnimation: string,
): void {
  const settings = {
    mode: state.tweenMode,
    inbetweens: state.tweenInbetweens,
    fps: state.tweenFps,
    motionStrength: state.tweenMotionStrength,
    alphaThreshold: state.tweenAlphaThreshold,
    easing: state.tweenEasing || "linear",
  };
  if (state.useAnimationOverride) {
    setTweenOverrideForAnimation(selectedAnimation, settings);
  } else {
    setGlobalTweenSettings(settings);
  }
}

export function currentTweenSettings(
  state: TweenState,
): TweenSettings {
  return {
    mode: state.tweenMode,
    inbetweens: state.compareOriginal ? 0 : state.tweenInbetweens,
    fps: state.compareOriginal ? 8 : state.tweenFps,
    motionStrength: state.tweenMotionStrength,
    alphaThreshold: state.tweenAlphaThreshold,
    easing: state.compareOriginal
      ? "linear"
      : state.tweenEasing || "linear",
  };
}
