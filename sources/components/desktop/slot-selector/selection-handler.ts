// Slot selection change handler — extracted from SlotSelector.ts view

import m from "mithril";
import { state, selectItem } from "../../../state/state.ts";
import { customAnimations } from "../../../custom-animations.ts";
import { getItemMerged } from "../../../state/catalog.ts";
import type { CatalogReader } from "../../../state/catalog.ts";
import type { SlotDef, SlotOption } from "../slot-config.ts";
import {
  clearSlotSelections,
  getDefaultRecolor,
} from "../slot-config.ts";
import {
  setPreviewAnimation,
  stopPreviewAnimation,
  startPreviewAnimation,
  setPreviewShowTransparencyGrid,
  setPreviewApplyTransparencyMask,
} from "../../../canvas/preview-animation.ts";

export type SlotChangeHandler = ReturnType<typeof createSlotChangeHandler>;

export function createSlotChangeHandler(
  slot: SlotDef,
  catalog: CatalogReader,
  options: SlotOption[],
  isBodyType: boolean,
  stateObj: { showColorPicker: boolean },
) {
  return (e: Event): void => {
    const target = e.target as HTMLSelectElement;
    const value = target.value;
    stateObj.showColorPicker = false;

    if (isBodyType) {
      state.bodyType = value;
      m.redraw();
      return;
    }

    if (!value) {
      clearSlotSelections(slot, catalog);
      return;
    }

    const opt = options.find((o) => o.value === value);
    if (!opt) return;

    clearSlotSelections(slot, catalog);

    if (opt.variant) {
      selectItem(opt.itemId, opt.variant);
    } else {
      const defaultRecolor = getDefaultRecolor(opt.itemId, catalog);
      selectItem(opt.itemId, defaultRecolor || "");
    }

    // Auto-switch preview animation for custom-animation-only items
    const meta = getItemMerged(opt.itemId).unwrapOr(null);
    if (meta && meta.animations && meta.animations.length > 0) {
      const firstAnim = meta.animations[0];
      if (firstAnim && customAnimations && customAnimations[firstAnim]) {
        stopPreviewAnimation();
        setPreviewAnimation(firstAnim);
        setPreviewShowTransparencyGrid(state.showTransparencyGrid);
        setPreviewApplyTransparencyMask(state.applyTransparencyMask);
        startPreviewAnimation();
        state.selectedAnimation = firstAnim;
      }
    }
  };
}
