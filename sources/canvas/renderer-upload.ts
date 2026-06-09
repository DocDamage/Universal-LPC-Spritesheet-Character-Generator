import { ANIMATION_OFFSETS } from "../state/constants.ts";
import { state as appState } from "../state/app-state.ts";
import type { DrawCall } from "../state/render-state.ts";

export function addCustomUploadDrawCalls(drawCalls: DrawCall[]): void {
  if (!appState.customUploadedImage) return;

  for (const [animName, yPos] of Object.entries(ANIMATION_OFFSETS)) {
    drawCalls.push({
      itemId: "custom-upload",
      variant: null,
      source: { kind: "custom", image: appState.customUploadedImage },
      zPos: appState.customImageZPos,
      layerNum: 0,
      animation: animName,
      yPos,
    });
  }
}
