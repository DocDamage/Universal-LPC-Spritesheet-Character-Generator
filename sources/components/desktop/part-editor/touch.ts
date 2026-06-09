import { clampEditorZoom } from "./state.ts";
import type { PartEditorState } from "./types.ts";

export function handleTouchStart(
  e: TouchEvent,
  stateObj: PartEditorState,
): void {
  if (e.touches.length === 2) {
    const dx = e.touches[0]!.clientX - e.touches[1]!.clientX;
    const dy = e.touches[0]!.clientY - e.touches[1]!.clientY;
    stateObj.touchStartDist = Math.hypot(dx, dy);
    stateObj.touchStartZoom = stateObj.zoom;
    stateObj.lastTouchCenter = {
      x: (e.touches[0]!.clientX + e.touches[1]!.clientX) / 2,
      y: (e.touches[0]!.clientY + e.touches[1]!.clientY) / 2,
    };
  }
}

export function handleTouchMove(
  e: TouchEvent,
  stateObj: PartEditorState,
): void {
  if (e.touches.length === 2 && stateObj.touchStartDist > 0) {
    e.preventDefault();
    const dx = e.touches[0]!.clientX - e.touches[1]!.clientX;
    const dy = e.touches[0]!.clientY - e.touches[1]!.clientY;
    const dist = Math.hypot(dx, dy);
    const scale = dist / stateObj.touchStartDist;
    const nextZoom = clampEditorZoom(
      Math.round(stateObj.touchStartZoom * scale),
    );
    if (nextZoom !== stateObj.zoom) {
      stateObj.zoom = nextZoom;
    }
  }
}

export function handleTouchEnd(stateObj: PartEditorState): void {
  stateObj.touchStartDist = 0;
  stateObj.lastTouchCenter = null;
}
