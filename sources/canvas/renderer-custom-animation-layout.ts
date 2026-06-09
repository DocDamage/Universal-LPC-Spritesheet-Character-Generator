import type { CustomAnimationDefinition } from "../custom-animations.ts";

export type CustomAnimationLayout = {
  totalWidth: number;
  totalHeight: number;
  currentCustomAnimations: Record<string, CustomAnimationDefinition>;
  customAnimYPositions: Record<string, number>;
};

export function calculateCustomAnimationLayout(
  addedCustomAnimations: Set<string>,
  customAnimations: Record<string, CustomAnimationDefinition>,
  baseWidth: number,
  baseHeight: number,
): CustomAnimationLayout {
  let totalHeight = baseHeight;
  let totalWidth = baseWidth;
  const currentCustomAnimations: Record<string, CustomAnimationDefinition> = {};
  const customAnimYPositions: Record<string, number> = {};

  if (addedCustomAnimations.size === 0) {
    return {
      totalWidth,
      totalHeight,
      currentCustomAnimations,
      customAnimYPositions,
    };
  }

  for (const customAnimName of addedCustomAnimations) {
    const customAnimDef = customAnimations[customAnimName];
    if (!customAnimDef) continue;

    customAnimYPositions[customAnimName] = totalHeight;
    const animHeight = customAnimDef.frameSize * customAnimDef.frames.length;
    const animWidth = customAnimDef.frameSize * customAnimDef.frames[0]!.length;
    totalHeight += animHeight;
    totalWidth = Math.max(totalWidth, animWidth);
    currentCustomAnimations[customAnimName] = customAnimDef;
  }

  return {
    totalWidth,
    totalHeight,
    currentCustomAnimations,
    customAnimYPositions,
  };
}
